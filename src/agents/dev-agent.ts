import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import type { AgentRunCtx } from "@/agents/types"
import { runPiSession } from "@/lib/pi/session"
import { buildDevSystemPrompt, buildDevUserPrompt } from "@/agents/prompts/dev"
import { reopenFromGate } from "@/lib/hitl/gates"
import { loadAgentConfig, buildSystemPrompt } from "@/agents/registry"
import fs from "node:fs/promises"
import { execSync } from "node:child_process"

export async function runDev(ctx: AgentRunCtx, instruction?: string): Promise<void> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: ctx.projectId } })
  const workspaceDir = paths.workspace(project.id)
  await fs.mkdir(workspaceDir, { recursive: true })

  // 预检: 检查是否配置了 API key
  const hasApiKey = !!process.env.DEEPSEEK_API_KEY
  if (!hasApiKey) {
    ctx.send("log", { line: "⚠ 未配置 DEEPSEEK_API_KEY，跳过 Pi 会话，进入 fallback" })
    await fallbackTemplateBuild(ctx, workspaceDir)
    ctx.send("result", { workspaceDir })
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

  try {
    const r = await runPiSession({
      projectId: project.id,
      workspaceDir,
      prompt: userPrompt,
      provider: devCfg.provider as "deepseek" | "anthropic" | "kimi" | "xiaomi" | "openai",
      modelId: devCfg.modelId,
      timeoutMs: devCfg.timeoutMs,
      systemPromptOverride: systemPrompt, // J3: 注入完整上下文
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
    if (!r.ok) {
      ctx.send("log", { line: "Pi 失败，进入 fallback：直接 chat 拉模板。" })
      await fallbackTemplateBuild(ctx, workspaceDir)
    }
  } catch (e: unknown) {
    ctx.send("log", { line: `Pi 异常: ${String((e as Error)?.message ?? e)}，进入 fallback` })
    await fallbackTemplateBuild(ctx, workspaceDir)
  }

  // J3.3: 构建自检 — 仅当 Pi 成功时执行
  let builtOk = false
  if (piOk) {
    ctx.setPhase("reviewing", "构建自检")
    ctx.send("log", { line: "--- 构建自检 ---" })

    const install = execIn(workspaceDir, "pnpm install --no-frozen-lockfile 2>&1", 10 * 60_000)
    ctx.send("log", { line: install.ok ? "✓ pnpm install" : `✗ pnpm install:\n${install.out.slice(-1500)}` })

    if (install.ok) {
      const build = execIn(workspaceDir, "pnpm exec next build 2>&1 || pnpm exec tsc --noEmit 2>&1", 10 * 60_000)
      builtOk = build.ok
      ctx.send("log", { line: build.ok ? "✓ build" : `✗ build:\n${build.out.slice(-1500)}` })
    }
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
  let filesCount = 0
  try { filesCount = (await fs.readdir(workspaceDir)).length } catch { /* ignore */ }
  const meta = { entry: "index.html", filesCount, builtOk, coverage, selfReview: selfReviewTotal > 0 ? { pass: selfReviewPass, total: selfReviewTotal } : null }

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

const MINIMAL_SERVER_JS = `const http = require("http")
const PORT = process.env.PORT || 3000
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(\`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>AI 生成的应用</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}.card{background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:500px;margin:20px}h1{color:#333;margin-bottom:16px}p{color:#666;line-height:1.6}.status{margin-top:24px;padding:10px 20px;background:#e8f5e9;color:#2e7d32;border-radius:8px;font-size:14px}</style></head><body><div class="card"><h1>🚀 应用已启动</h1><p>这是一个由 AI 生成的骨架应用。沙箱环境已就绪。</p><div class="status">✓ 沙箱运行中 · 端口 \${PORT}</div></div></body></html>\`)
})
server.listen(PORT, () => console.log(\`Server running on http://localhost:\${PORT}\`))`

async function fallbackTemplateBuild(ctx: AgentRunCtx, workspaceDir: string): Promise<void> {
  const skeletonDir = paths.workspace("_skeleton")
  try {
    await copyDir(skeletonDir, workspaceDir)
    ctx.send("log", { line: "fallback: 骨架模板已复制" })
  } catch {
    ctx.send("log", { line: "fallback: 无骨架模板，动态生成最小项目" })
    try {
      await fs.writeFile(`${workspaceDir}/package.json`, JSON.stringify({
        name: "ai-generated-app",
        version: "1.0.0",
        private: true,
        scripts: { dev: "node server.js" },
      }, null, 2), "utf-8")
      await fs.writeFile(`${workspaceDir}/server.js`, MINIMAL_SERVER_JS, "utf-8")
      ctx.send("log", { line: "fallback: 最小项目已生成" })
    } catch (e: unknown) {
      ctx.send("error", { code: "E_FALLBACK_FAILED", message: `fallback 失败: ${(e as Error)?.message ?? e}` })
    }
  }
  ctx.send("log", { line: "fallback 完成" })
}

async function copyDir(src: string, dest: string) {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const e of entries) {
    const sp = `${src}/${e.name}`
    const dp = `${dest}/${e.name}`
    if (e.isDirectory()) {
      await copyDir(sp, dp)
    } else {
      await fs.copyFile(sp, dp)
    }
  }
}
