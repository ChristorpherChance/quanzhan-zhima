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
