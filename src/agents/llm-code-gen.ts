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

  const userPrompt = `基于已注入的 PRD 和 4 份设计产物,生成完整应用代码。

# 输出格式(严格)
## FILE: path/to/file
\`\`\`language
...完整代码内容...
\`\`\`

# 必须满足
- **功能完全对齐 PRD 的 AC**(每条 AC 都要有对应实现),严禁生成 PRD 未提及的功能(如任务管理器、待办清单等通用 demo)
- 字段名、术语、模块名必须来自 PRD 和设计产物
- 生成可直接运行的 index.html(单文件 SPA),使用 Tailwind CDN + 原生 JS 或 Alpine.js
- 用 localStorage 存储数据,包含 PRD 要求的 CRUD/查询/筛选/统计等
- 包含至少 12 条符合业务场景的 mock 数据(不是 task1/task2 这种 placeholder)
- **如果使用 Alpine.js 路由,所有 \`x-show\` 元素必须加 \`x-cloak\` 属性,且 head 中必须包含 \`<style>[x-cloak]{display:none!important}</style>\`**(避免页面加载时所有 page 同时显示的 FOUC)
- 代码直接在浏览器中打开即可运行`

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
