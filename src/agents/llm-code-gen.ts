import fs from "node:fs/promises"
import { dirname } from "node:path"
import { stream } from "@/lib/llm/gateway"
import { paths } from "@/config/paths"
import { buildLLMDevPrompt } from "@/agents/prompts/dev"
import type { AgentRunCtx } from "@/agents/types"

/**
 * Parse code blocks from LLM output.
 * Supports format:
 * ## FILE: path/to/file
 * ```language
 * ...code...
 * ```
 */
function parseCodeBlocks(text: string): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = []
  const re = /(?:##\s*FILE:\s*(\S+)[\s\S]*?)?```(\w+)?\s*\n([\s\S]*?)```/g
  let match
  let lastPath: string | null = null
  while ((match = re.exec(text)) !== null) {
    const headerPath = match[1]
    const code = match[3]
    if (headerPath) lastPath = headerPath
    if (lastPath && code.trim().length > 0) {
      files.push({ path: lastPath, content: code.trim() })
    }
  }
  return files
}

/**
 * Second-level fallback: direct LLM code generation via Gateway.stream().
 * Called when Pi coding agent fails or produces too few files.
 */
export async function generateViaLLM(
  ctx: AgentRunCtx,
  projectId: string,
  workspaceDir: string,
): Promise<number> {
  ctx.setPhase("thinking", "LLM 直连生成代码")
  ctx.send("log", { line: "--- 第二级：LLM 直连生成 ---" })

  const systemPrompt = await buildLLMDevPrompt(projectId)

  const userPrompt = `请生成完整应用代码。输出格式严格遵循：

## FILE: path/to/file
\`\`\`language
...完整代码内容...
\`\`\`

要求：
- 生成一个完整的 SPA 应用（index.html）
- 使用 localStorage 存储数据
- 包含 CRUD 全部功能
- 使用 Tailwind CSS CDN
- 代码可直接在浏览器中运行`

  let fullText = ""
  try {
    const streamGen = stream({
      task: "reason-heavy",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    })

    for await (const event of streamGen) {
      if (event.type === "delta" && event.text) {
        fullText += event.text
        ctx.send("text_delta", { text: event.text })
      } else if (event.type === "error") {
        throw new Error(event.error ?? "LLM stream error")
      }
    }
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    ctx.send("log", { line: `LLM 直连失败: ${msg}` })
    return 0
  }

  // Parse and write files
  const files = parseCodeBlocks(fullText)
  let count = 0
  for (const { path: fp, content } of files) {
    try {
      const fullPath = `${workspaceDir}/${fp}`
      await fs.mkdir(dirname(fullPath), { recursive: true })
      await fs.writeFile(fullPath, content, "utf-8")
      ctx.send("log", { line: `✓ ${fp}` })
      count++
    } catch (e: unknown) {
      ctx.send("log", { line: `✗ ${fp}: ${(e as Error)?.message ?? e}` })
    }
  }

  // If no FILE markers found, try to extract a single index.html
  if (count === 0 && fullText.length > 100) {
    try {
      await fs.writeFile(`${workspaceDir}/index.html`, fullText, "utf-8")
      ctx.send("log", { line: "✓ index.html (from full output)" })
      count = 1
    } catch { /* ignore */ }
  }

  ctx.send("log", { line: `LLM 直连完成，产出 ${count} 个文件` })
  return count
}
