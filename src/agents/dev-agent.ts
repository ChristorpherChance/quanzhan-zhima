import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import type { AgentRunCtx } from "@/agents/types"
import { runPiSession } from "@/lib/pi/session"
import fs from "node:fs/promises"

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

  const prompt = instruction ?? "请开始按系统提示完成任务。"
  ctx.send("log", { line: `Pi 启动: ${workspaceDir}` })

  // Token accumulators
  let tokenIn = 0
  let tokenOut = 0

  try {
    const r = await runPiSession({
      projectId: project.id,
      workspaceDir,
      prompt,
      provider: "deepseek",
      modelId: "deepseek-chat",
      timeoutMs: 240_000,
      onEvent: (e) => {
        // 追踪 phase 变化
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
        // 累加 token（如果 Pi 事件包含 usage 信息）
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
    if (!r.ok) {
      ctx.send("log", { line: "Pi 失败，进入 fallback：直接 chat 拉模板。" })
      await fallbackTemplateBuild(ctx, workspaceDir)
    }
  } catch (e: unknown) {
    ctx.send("log", { line: `Pi 异常: ${String((e as Error)?.message ?? e)}，进入 fallback` })
    await fallbackTemplateBuild(ctx, workspaceDir)
  }

  // Upsert code artifact
  const existing = await prisma.artifact.findFirst({
    where: { projectId: ctx.projectId, type: "code" },
    orderBy: { version: "desc" },
  })
  // 统计文件数
  let filesCount = 0
  try { filesCount = (await fs.readdir(workspaceDir)).length } catch { /* ignore */ }
  if (existing && !existing.locked) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: {
        storagePath: workspaceDir,
        version: existing.version + 1,
        meta: J.stringify({ entry: "index.html", filesCount }),
      },
    })
  } else {
    await prisma.artifact.create({
      data: {
        projectId: ctx.projectId,
        type: "code",
        version: (existing?.version ?? 0) + 1,
        storagePath: workspaceDir,
        meta: J.stringify({ entry: "index.html", filesCount }),
      },
    })
  }

  ctx.send("result", { workspaceDir, filesCount })

  // 自动停止旧沙箱，提示用户重新预览
  try {
    const { stopSandbox } = await import("@/lib/sandbox")
    await stopSandbox(ctx.projectId).catch(() => {})
    ctx.send("log", { line: "已停止旧沙箱，请点击预览自动重启查看新代码" })
  } catch {
    ctx.send("log", { line: "代码已生成，点击预览查看" })
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
    // 如果骨架目录不存在，动态生成最小可运行项目
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
