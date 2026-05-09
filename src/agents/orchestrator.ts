import fs from "node:fs/promises"
import { dirname } from "node:path"
import { prisma } from "@/lib/db/prisma"
import { log } from "@/lib/log"
import { paths } from "@/config/paths"
import type { AgentRunCtx, AgentPhase } from "@/agents/types"

interface JobEvent {
  event: string
  data: unknown
  ts: string
}

interface StartJobOpts {
  projectId: string
  agentType: string
  type: string
  run: (ctx: AgentRunCtx) => Promise<void>
}

interface PhaseState {
  phase: AgentPhase
  label: string
  tokenIn: number
  tokenOut: number
  startedAt: number
}

// 内存事件缓冲区: jobId -> events[]
const jobEvents = new Map<string, JobEvent[]>()

// EventTarget 推送: jobId -> EventTarget
const jobEventTargets = new Map<string, EventTarget>()

// Phase 状态追踪: jobId -> PhaseState
const jobPhases = new Map<string, PhaseState>()

export function getJobEvents(jobId: string): JobEvent[] {
  return jobEvents.get(jobId) ?? []
}

export function getJobEventTarget(jobId: string): EventTarget {
  let target = jobEventTargets.get(jobId)
  if (!target) {
    target = new EventTarget()
    jobEventTargets.set(jobId, target)
  }
  return target
}

export async function startJob(opts: StartJobOpts) {
  log("agent", `orchestrator:startJob project=${opts.projectId} agentType=${opts.agentType} type=${opts.type}`)

  // 创建 Job 记录
  const job = await prisma.job.create({
    data: {
      projectId: opts.projectId,
      agentType: opts.agentType,
      type: opts.type,
      status: "running",
      startedAt: new Date(),
    },
  })

  const jobId = job.id

  // 初始化事件缓冲区
  if (!jobEvents.has(jobId)) {
    jobEvents.set(jobId, [])
  }

  const buffer = jobEvents.get(jobId)!

  // 初始化 phase 追踪
  const phaseState: PhaseState = {
    phase: "queued",
    label: "排队中",
    tokenIn: 0,
    tokenOut: 0,
    startedAt: Date.now(),
  }
  jobPhases.set(jobId, phaseState)

  const elapsed = () => Date.now() - phaseState.startedAt

  const pushPhase = (phase: AgentPhase, label?: string) => {
    phaseState.phase = phase
    if (label) phaseState.label = label
    const payload = {
      phase: phaseState.phase,
      label: phaseState.label,
      tokenIn: phaseState.tokenIn,
      tokenOut: phaseState.tokenOut,
      elapsedMs: elapsed(),
    }
    const entry: JobEvent = { event: "phase", data: payload, ts: new Date().toISOString() }
    buffer.push(entry)
    if (buffer.length > 500) buffer.splice(0, buffer.length - 500)
    const target = jobEventTargets.get(jobId)
    if (target) {
      target.dispatchEvent(new CustomEvent("job-event", { detail: entry }))
    }
    // 异步更新 Job.meta（不阻塞主流程）
    prisma.job.update({ where: { id: jobId }, data: { meta: JSON.stringify(payload) } }).catch(() => {})
  }

  // 发射初始 queued 事件
  pushPhase("queued", "排队中")

  // 创建 AgentRunCtx
  const ctx: AgentRunCtx = {
    projectId: opts.projectId,
    jobId,
    send: (event: string, data: unknown) => {
      const entry: JobEvent = { event, data, ts: new Date().toISOString() }
      buffer.push(entry)
      if (buffer.length > 500) {
        const dropped = buffer.length - 500
        buffer.splice(0, dropped)
        // 通知客户端有事件被丢弃
        const target = jobEventTargets.get(jobId)
        if (target) {
          target.dispatchEvent(new CustomEvent("job-event", { detail: { event: "dropped", data: { count: dropped }, ts: new Date().toISOString() } }))
        }
      }
      // 推送到 EventTarget
      const target = jobEventTargets.get(jobId)
      if (target) {
        target.dispatchEvent(new CustomEvent("job-event", { detail: entry }))
      }
      log("agent", `orchestrator:event job=${jobId} event=${event}`)
    },
    setPhase: (phase: AgentPhase, label?: string) => pushPhase(phase, label),
    addTokens: (tokensIn: number, tokensOut: number) => {
      phaseState.tokenIn += tokensIn
      phaseState.tokenOut += tokensOut
    },
  }

  // 异步执行 run
  const executionPromise = (async () => {
    try {
      log("agent", `orchestrator:run-start job=${jobId}`)
      pushPhase("thinking", "开始思考")
      await opts.run(ctx)
      log("agent", `orchestrator:run-success job=${jobId}`)

      pushPhase("done", "完成")

      // 更新 Job 状态为成功
      const logs = buffer.map((e) => `[${e.ts}][${e.event}] ${JSON.stringify(e.data)}`).join("\n")
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "succeeded",
          logs,
          endedAt: new Date(),
          costTokens: phaseState.tokenIn + phaseState.tokenOut,
          meta: JSON.stringify({ phase: phaseState.phase, label: phaseState.label, tokenIn: phaseState.tokenIn, tokenOut: phaseState.tokenOut, elapsedMs: elapsed() }),
        },
      })

      // 追加变更日志
      void appendChangelog(opts.projectId, `Job ${opts.agentType}/${opts.type} 执行成功`)
    } catch (e: unknown) {
      const msg = String((e as Error)?.message ?? e)
      log("agent", `orchestrator:run-fail job=${jobId} error=${msg}`)

      pushPhase("error", msg.slice(0, 100))

      // 发送错误事件（如果还没有被发送）
      ctx.send("error", { code: "E_JOB_FAILED", message: msg })

      // 更新 Job 状态为失败
      const logs = buffer.map((e) => `[${e.ts}][${e.event}] ${JSON.stringify(e.data)}`).join("\n")
      await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "failed",
          logs,
          errorMsg: msg,
          endedAt: new Date(),
          costTokens: phaseState.tokenIn + phaseState.tokenOut,
          meta: JSON.stringify({ phase: "error", label: msg.slice(0, 100), tokenIn: phaseState.tokenIn, tokenOut: phaseState.tokenOut, elapsedMs: elapsed() }),
        },
      })

      // 追加变更日志
      void appendChangelog(opts.projectId, `Job ${opts.agentType}/${opts.type} 执行失败: ${msg}`)
    } finally {
      // Job 完成后延迟清理 EventTarget 和 event buffer（给 SSE 连接时间收尾）
      setTimeout(() => {
        jobEventTargets.delete(jobId)
        jobEvents.delete(jobId)
        jobPhases.delete(jobId)
      }, 30_000)
    }
  })()

  // 返回 Job 记录（不等待执行完成）
  void executionPromise
  return job
}

async function appendChangelog(projectId: string, entry: string) {
  try {
    const filePath = paths.changelogPath(projectId)
    await fs.mkdir(dirname(filePath), { recursive: true })
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19)
    const line = `- [${timestamp}] ${entry}\n`
    let existing = ""
    try {
      existing = await fs.readFile(filePath, "utf-8")
    } catch {
      // 文件不存在
    }
    if (!existing) {
      existing = "# 变更日志\n\n"
    }
    await fs.writeFile(filePath, existing + line, "utf-8")
  } catch {
    // 静默失败，不影响主流程
  }
}

export async function appendGateLog(projectId: string, gateType: string) {
  const label = gateType === "G1" ? "需求阶段锁定" : gateType === "G2" ? "设计阶段锁定" : `${gateType} 锁定`
  await appendChangelog(projectId, `${label}`)
}
