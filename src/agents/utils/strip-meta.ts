const META_PATTERNS = [
  /^好的[，,].*$/m,
  /^作为(设计|需求|开发|审查)\s*Agent.*$/m,
  /^我将(严格|按照|根据).*$/m,
  /^以下是.*的(设计|文档|方案)[:：].*$/m,
  /^明白了[，,].*$/m,
  /^没问题[，,].*$/m,
]

export function stripMetaTalk(content: string): string {
  const lines = content.split("\n")
  while (lines.length > 0 && META_PATTERNS.some((p) => p.test(lines[0]?.trim() ?? ""))) {
    lines.shift()
  }
  while (lines.length > 0 && lines[0].trim() === "") lines.shift()
  return lines.join("\n")
}

/**
 * 针对 HTML 输出的严格提取:从 <!DOCTYPE html> 或 <html> 开始提取,
 * 容忍 LLM 输出没有 </html> 闭合标签(常见情况)。
 * 去除 LLM 包装的 markdown 代码块 (```html ... ```) 和前后自然语言说明。
 */
export function extractHtml(content: string): string {
  // 1. 找到 HTML 起点:<!DOCTYPE html> 优先,其次 <html
  const docTypeIdx = content.search(/<!DOCTYPE\s+html/i)
  const htmlIdx = content.search(/<html\b/i)
  let startIdx = -1
  if (docTypeIdx !== -1) startIdx = docTypeIdx
  else if (htmlIdx !== -1) startIdx = htmlIdx

  // 2. fallback: ```html 代码块包装
  if (startIdx === -1) {
    const codeBlockMatch = content.match(/```(?:html)?\s*\n([\s\S]*?)```/)
    if (codeBlockMatch) return codeBlockMatch[1].trim()
    return stripMetaTalk(content)
  }

  // 3. 找到 HTML 终点:</html> 闭合优先,其次 </body>,
  //    再次最后一个 <!-- END:... --> 标记,实在不行到字符串末尾
  let body = content.slice(startIdx)
  const htmlEndMatch = body.match(/<\/html\s*>/i)
  if (htmlEndMatch && htmlEndMatch.index !== undefined) {
    return body.slice(0, htmlEndMatch.index + htmlEndMatch[0].length)
  }
  const bodyEndMatch = body.match(/<\/body\s*>/i)
  if (bodyEndMatch && bodyEndMatch.index !== undefined) {
    return body.slice(0, bodyEndMatch.index + bodyEndMatch[0].length) + "\n</html>"
  }
  // 找最后一个 <!-- END:... --> 标记
  const endMarkers = [...body.matchAll(/<!--\s*END:[^>]*-->/gi)]
  if (endMarkers.length > 0) {
    const last = endMarkers[endMarkers.length - 1]
    if (last.index !== undefined) {
      return body.slice(0, last.index + last[0].length) + "\n</body></html>"
    }
  }
  // 实在不行,从 startIdx 到末尾,strip 掉末尾的 markdown 自然语言段(以 --- 或 ** 或 ``` 开头的行)
  const lines = body.split("\n")
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim()
    if (last === "" || /^---+$/.test(last) || /^```/.test(last) || /^\*\*[^*]+\*\*/.test(last) || /^[#>]/.test(last) || /^优化建议/.test(last) || /^骨架拆解/.test(last) || /您可以/.test(last)) {
      lines.pop()
    } else break
  }
  return lines.join("\n")
}

/**
 * 去掉 LLM 输出中所有的 markdown 代码块栅栏(```html / ``` / ```javascript 等),
 * 但保留代码内容本身。适用于 HTML 片段(非完整文档)
 */
export function stripCodeFences(content: string): string {
  return content
    .replace(/^```(?:html|xml|svg)?\s*$/gm, "")  // 单独成行的 ```html 标记
    .replace(/^```\s*$/gm, "")                    // 单独成行的 ``` 结尾
}
