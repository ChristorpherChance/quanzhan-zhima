import { sseResponse } from "@/lib/sse"
import { getJobEvents, getJobEventTarget } from "@/agents/orchestrator"
import { prisma } from "@/lib/db/prisma"
import { NextRequest } from "next/server"

export const GET = (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  // 支持断线续传：客户端传 ?lastEventId=N 跳过已发事件
  const url = new URL(req.url)
  const lastEventId = parseInt(url.searchParams.get("lastEventId") ?? "0", 10)

  return sseResponse(async (send, signal) => {
    const jobId = params.id

    // 1. 重放已有事件（从 lastEventId 之后开始）
    const existing = getJobEvents(jobId)
    for (let i = lastEventId; i < existing.length; i++) {
      if (signal.aborted) return
      const e = existing[i]
      send(e.event, e.data)
    }

    // 2. 检查 job 是否已完成
    const job = await prisma.job.findUnique({ where: { id: jobId } })
    if (!job || job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
      if (job?.status === "succeeded") {
        const hasResult = existing.some((e) => e.event === "result")
        if (!hasResult) send("result", { jobId })
      } else if (job?.status === "failed") {
        const hasError = existing.some((e) => e.event === "error")
        if (!hasError) send("error", { message: job?.errorMsg ?? "job failed" })
      } else if (job?.status === "cancelled") {
        send("end", { reason: "cancelled" })
      }
      return
    }

    // 3. 监听新事件（EventTarget 推流，无 DB 轮询）
    const target = getJobEventTarget(jobId)
    let settled = false

    const settle = (reason: string) => {
      if (settled) return
      settled = true
      if (!signal.aborted) send("end", { reason })
    }

    const handler = (e: Event) => {
      if (signal.aborted) return
      const detail = (e as CustomEvent).detail as { event?: string; data?: unknown } | undefined
      if (detail) {
        send(detail.event ?? "unknown", detail.data)
        // 收到 end/result/error 事件后关闭连接
        if (detail.event === "end" || detail.event === "result") {
          settle("job-completed")
        }
      }
    }
    target.addEventListener("job-event", handler)

    // 4. Keep-alive: 每 10s 发心跳（含 elapsedMs 保证前端计时器存活）
    const jobStartedAt = job?.startedAt?.getTime() ?? Date.now()
    const keepAlive = setInterval(() => {
      if (signal.aborted || settled) return
      try {
        send("heartbeat", { ts: Date.now(), elapsedMs: Date.now() - jobStartedAt, summary: "心跳" })
      } catch { /* ignore */ }
    }, 10_000)

    // 5. 等待 job 终止或客户端断开
    while (!settled && !signal.aborted) {
      const current = await prisma.job.findUnique({ where: { id: jobId } })
      if (!current || current.status === "succeeded" || current.status === "failed" || current.status === "cancelled") {
        if (current?.status === "succeeded") {
          send("result", { jobId })
        } else if (current?.status === "failed") {
          send("error", { message: current?.errorMsg ?? "job failed" })
        } else if (current?.status === "cancelled") {
          send("end", { reason: "cancelled" })
        }
        break
      }
      // 低频 DB 轮询（10s 一次，作为 EventTarget 的兜底）
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 10_000)
        const onAbort = () => { clearTimeout(t); resolve() }
        signal.addEventListener("abort", onAbort, { once: true })
      })
    }

    // 6. 清理
    clearInterval(keepAlive)
    target.removeEventListener("job-event", handler)
  })
}
