import { withErrorBoundary } from "@/lib/errors"
import { startJob } from "@/agents/orchestrator"
import { runPiSession } from "@/lib/pi/session"
import { DEV_PATCH_SYSTEM } from "@/agents/prompts/dev"
import { loadAgentConfig } from "@/agents/registry"
import { paths } from "@/config/paths"
import { NextRequest } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = await req.json() as { filePath?: string; range?: [number, number]; instruction?: string }
  const { filePath, range, instruction } = body
  if (!filePath || !instruction) throw new Error("缺少 filePath 或 instruction")

  const workspaceDir = paths.workspace(params.id)

  const job = await startJob({
    projectId: params.id,
    agentType: "dev",
    type: "dev-patch",
    run: async (ctx) => {
      // 读取当前文件内容
      const resolved = path.resolve(workspaceDir, filePath.replace(/^\/+/, ""))
      let currentContent = ""
      try { currentContent = await fs.readFile(resolved, "utf-8") } catch { /* 文件可能不存在 */ }

      const rangeHint = range ? `\n修改区间: 第 ${range[0]}-${range[1]} 行。` : ""
      const prompt = `filePath: ${filePath}${rangeHint}\n指令: ${instruction}\n\n当前文件内容:\n\`\`\`\n${currentContent.slice(0, 8000)}\n\`\`\`\n请按 patch 模式修改此文件。`

      const cfg = await loadAgentConfig("dev")
      await runPiSession({
        projectId: params.id,
        workspaceDir,
        prompt,
        provider: cfg.provider as "deepseek" | "anthropic" | "kimi" | "xiaomi" | "openai",
        modelId: cfg.modelId,
        timeoutMs: cfg.timeoutMs,
        systemPromptOverride: DEV_PATCH_SYSTEM,
        onEvent: (e) => ctx.send(e.type as "log" | "text_delta", e.data),
      })
    },
  })

  return { jobId: job.id }
})
