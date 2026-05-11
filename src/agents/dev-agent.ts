import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import type { AgentRunCtx } from "@/agents/types"
import { runPiSession } from "@/lib/pi/session"
import { piSessionPool } from "@/lib/pi/session-manager"
import { buildDevSystemPrompt, buildDevUserPrompt } from "@/agents/prompts/dev"
import { reopenFromGate } from "@/lib/hitl/gates"
import { loadAgentConfig, buildSystemPrompt } from "@/agents/registry"
import { WORKSPACE_WRITE_DENY } from "@/lib/pi/tools"
import { generateViaLLM } from "@/agents/llm-code-gen"
import { generateSmartTemplate } from "@/agents/smart-template"
import fs from "node:fs/promises"
import { execSync } from "node:child_process"
import path from "node:path"

async function purgeContextMirrors(workspaceDir: string) {
  const entries = await fs.readdir(workspaceDir).catch(() => [])
  for (const f of entries) {
    if (WORKSPACE_WRITE_DENY.some((re) => re.test(f))) {
      await fs.rm(path.join(workspaceDir, f), { force: true }).catch(() => {})
    }
  }
}

export async function runDev(ctx: AgentRunCtx, instruction?: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: ctx.projectId } })
  const workspaceDir = paths.workspace(project.id)
  await fs.mkdir(workspaceDir, { recursive: true })

  // J1.3: 启动前清理上下文镜像残留
  await purgeContextMirrors(workspaceDir)

  // 预检: 检查是否配置了 API key
  const hasApiKey = !!process.env.DEEPSEEK_API_KEY
  if (!hasApiKey) {
    ctx.send("log", { line: "⚠ 未配置 DEEPSEEK_API_KEY，跳过 Pi 会话，进入 LLM 直连 / 模板兜底" })
    let fallbackFiles = await generateViaLLM(ctx, ctx.projectId, workspaceDir)
    if (fallbackFiles < 1) {
      fallbackFiles = await generateSmartTemplate(ctx, ctx.projectId, workspaceDir)
    }
    ctx.send("result", { workspaceDir, filesCount: fallbackFiles })
    return
  }

  // J3: 构建包含 PRD + 5 设计产物的系统提示词
  ctx.setPhase("thinking", "加载 PRD 与设计产物")
  const basePrompt = await buildDevSystemPrompt(ctx.projectId)
  const systemPrompt = await buildSystemPrompt("dev", ctx.projectId, basePrompt)
  const userPrompt = buildDevUserPrompt(instruction)
  ctx.send("log", { line: `Pi 启动: ${workspaceDir}` })

  // J6: 从注册表加载 dev agent 配置
  const devCfg = await loadAgentConfig("dev")

  // Token accumulators
  let tokenIn = 0
  let tokenOut = 0
  let piOk = false

  // ── 四级降级链 ─────────────────────────────────────────────────
  let filesCount = 0

  // Level 1: Pi 编码代理（15min, 含 reload + bash 工具）
  try {
    ctx.send("log", { line: "--- 第一级：Pi 编码代理 ---" })
    const r = await runPiSession({
      projectId: project.id,
      workspaceDir,
      prompt: userPrompt,
      provider: devCfg.provider as "deepseek" | "anthropic" | "kimi" | "xiaomi" | "openai",
      modelId: devCfg.modelId,
      timeoutMs: devCfg.timeoutMs,
      systemPromptOverride: systemPrompt,
      onEvent: (e) => {
        switch (e.type) {
          case "tool_start":
            ctx.setPhase("tool_running", `执行 ${(e.data as { name?: string })?.name ?? "工具"}`)
            break
          case "tool_end":
            ctx.setPhase("writing", "写入文件")
            break
          case "thinking_delta":
            ctx.setPhase("thinking", "思考中")
            break
          case "text_delta":
            ctx.setPhase("writing", "生成代码")
            break
        }
        const data = e.data as Record<string, unknown> | undefined
        if (data?.usage) {
          const u = data.usage as { input_tokens?: number; output_tokens?: number }
          if (u.input_tokens) tokenIn += u.input_tokens
          if (u.output_tokens) tokenOut += u.output_tokens
          ctx.addTokens(u.input_tokens ?? 0, u.output_tokens ?? 0)
        }
        ctx.send(e.type as "log" | "result" | "error" | "text_delta" | "thinking_delta" | "tool_start" | "tool_update" | "tool_end", e.data)
      },
    })
    piOk = r.ok
    if (piOk) {
      try { filesCount = (await fs.readdir(workspaceDir)).length } catch { /* ignore */ }
      ctx.send("log", { line: `Pi 完成，产出 ${filesCount} 文件` })
    } else {
      ctx.send("log", { line: `Pi 失败: ${r.error ?? "未知错误"}` })
    }
  } catch (e: unknown) {
    ctx.send("log", { line: `Pi 异常: ${String((e as Error)?.message ?? e)}` })
    piOk = false
  }

  // Level 2: Pi followUp 续写（文件数 < 5 时）
  if (piOk && filesCount < 5) {
    ctx.send("log", { line: `--- 第二级：Pi followUp 续写（当前仅 ${filesCount} 文件）---` })
    ctx.setPhase("thinking", "Pi followUp 续写")
    try {
      await piSessionPool.followUp(ctx.projectId, "请继续生成剩余文件，确保完整实现 PRD 中所有功能需求。")
      await new Promise((r) => setTimeout(r, 5000)) // 给 followUp 时间
      filesCount = (await fs.readdir(workspaceDir)).length
      ctx.send("log", { line: `followUp 完成，现有 ${filesCount} 文件` })
    } catch (e: unknown) {
      ctx.send("log", { line: `followUp 异常: ${(e as Error)?.message ?? e}` })
    }
  }

  // Level 3: LLM 直连生成（Pi 完全失败 或 文件数仍 < 1）
  if (!piOk || filesCount < 1) {
    ctx.send("log", { line: `--- 第三级：LLM 直连生成 ---` })
    const llmCount = await generateViaLLM(ctx, ctx.projectId, workspaceDir)
    if (llmCount > 0) {
      piOk = true
      filesCount = Math.max(filesCount, llmCount)
    }
  }

  // Level 4: 智能模板兜底（LLM 也失败）
  if (!piOk || filesCount < 1) {
    ctx.send("log", { line: "--- 第四级：智能模板兜底 ---" })
    const tmplCount = await generateSmartTemplate(ctx, ctx.projectId, workspaceDir)
    if (tmplCount > 0) {
      piOk = true
      filesCount = tmplCount
    }
  }

  // 重新统计文件数（如果尚未正确统计）
  if (filesCount === 0) {
    try { filesCount = (await fs.readdir(workspaceDir)).length } catch { /* ignore */ }
  }

  // J3.3: 构建自检 — 仅当有足够文件时执行
  let builtOk = false
  let buildLogPath: string | undefined
  if (piOk && filesCount >= 1) {
    ctx.setPhase("reviewing", "构建自检")
    ctx.send("log", { line: "--- 构建自检 ---" })

    let buildLog = ""

    const install = execIn(workspaceDir, "pnpm install --no-frozen-lockfile 2>&1", 10 * 60_000)
    buildLog += `$ pnpm install --no-frozen-lockfile\n${install.out}\n\n`
    ctx.send("log", { line: install.ok ? "✓ pnpm install" : `✗ pnpm install:\n${install.out.slice(-1500)}` })

    if (install.ok) {
      const build = execIn(workspaceDir, "pnpm exec next build 2>&1 || pnpm exec tsc --noEmit 2>&1", 10 * 60_000)
      builtOk = build.ok
      buildLog += `$ pnpm exec next build 2>&1 || pnpm exec tsc --noEmit 2>&1\n${build.out}\n`
      ctx.send("log", { line: build.ok ? "✓ build" : `✗ build:\n${build.out.slice(-1500)}` })
    }

    await fs.writeFile(`${workspaceDir}/build.log`, buildLog, "utf-8").catch(() => {})
    buildLogPath = `${workspaceDir}/build.log`
  }

  // J3.4: AC 覆盖率
  let coverage: number | null = null
  let coverageMd = ""
  try {
    coverageMd = await fs.readFile(`${workspaceDir}/COVERAGE.md`, "utf-8")
  } catch { /* 缺失 */ }
  if (coverageMd) {
    let prdContent = ""
    try { prdContent = await fs.readFile(paths.prd(ctx.projectId), "utf-8") } catch { /* ignore */ }
    const totalAcs = (prdContent.match(/AC[\d.]+/gi) ?? []).length
    const coveredAcs = (coverageMd.match(/AC[\d.]+/gi) ?? []).length
    coverage = totalAcs > 0 ? Math.round((coveredAcs / totalAcs) * 100) : null
  }

  // K8.3: SELF_REVIEW.md 自评检测
  let selfReviewPass = 0
  let selfReviewTotal = 0
  try {
    const selfReview = await fs.readFile(`${workspaceDir}/SELF_REVIEW.md`, "utf-8")
    selfReviewPass = (selfReview.match(/pass/gi) ?? []).length
    selfReviewTotal = (selfReview.match(/(pass|fail)/gi) ?? []).length
  } catch { /* 缺失 */ }

  // Upsert code artifact
  const existing = await prisma.artifact.findFirst({
    where: { projectId: ctx.projectId, type: "code" },
    orderBy: { version: "desc" },
  })
  const meta = { entry: "index.html", filesCount, builtOk, coverage, buildLogPath, selfReview: selfReviewTotal > 0 ? { pass: selfReviewPass, total: selfReviewTotal } : null }

  if (existing && !existing.locked) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: {
        storagePath: workspaceDir,
        version: existing.version + 1,
        meta: J.stringify(meta),
      },
    })
  } else {
    await prisma.artifact.create({
      data: {
        projectId: ctx.projectId,
        type: "code",
        version: (existing?.version ?? 0) + 1,
        storagePath: workspaceDir,
        meta: J.stringify(meta),
      },
    })
  }

  ctx.send("result", { workspaceDir, filesCount, builtOk, coverage })

  // J8: 代码重新生成后反锁 G3 及后续 Gate
  void reopenFromGate(ctx.projectId, "G3").catch(() => {})

  // 自动停止旧沙箱，提示用户重新预览
  try {
    const { stopSandbox } = await import("@/lib/sandbox")
    await stopSandbox(ctx.projectId).catch(() => {})
    ctx.send("log", { line: "已停止旧沙箱，请点击预览自动重启查看新代码" })
  } catch {
    ctx.send("log", { line: "代码已生成，点击预览查看" })
  }
}

// J3.3: 工作区内的命令执行器
function execIn(cwd: string, cmd: string, ms = 5 * 60_000): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, { cwd, stdio: "pipe", timeout: ms, encoding: "utf-8" })
    return { ok: true, out: out.toString() }
  } catch (e: any) {
    return {
      ok: false,
      out: ((e as any)?.stdout?.toString?.() ?? "") + ((e as any)?.stderr?.toString?.() ?? ""),
    }
  }
}
