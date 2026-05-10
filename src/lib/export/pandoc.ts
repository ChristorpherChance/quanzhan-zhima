import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { log } from "@/lib/log"
import { injectMermaidTheme } from "@/lib/markdown/mermaid-theme"

export async function pandocConvert(args: {
  inputMd: string
  outputPath: string
  format: "docx" | "pdf"
}) {
  // J9: 注入 mermaid light 主题，避免 PDF 中黑底黑字
  const raw = await fs.readFile(args.inputMd, "utf-8")
  const themed = injectMermaidTheme(raw, "light")
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "zm-pandoc-"))
  const themedPath = path.join(tmpDir, "themed.md")
  await fs.writeFile(themedPath, themed, "utf-8")

  const flags =
    args.format === "pdf"
      ? ["--pdf-engine=xelatex", "-V", "mainfont=Noto Sans CJK SC", "-V", "CJKmainfont=Noto Sans CJK SC"]
      : []

  try {
    await new Promise<void>((resolve, reject) => {
      const p = spawn("pandoc", [themedPath, "-o", args.outputPath, ...flags], {
        stdio: "inherit",
      })
      const t = setTimeout(() => {
        p.kill("SIGKILL")
        reject(new Error(`pandoc timeout: ${args.format}`))
      }, 60_000)
      p.on("exit", (code) => {
        clearTimeout(t)
        if (code === 0) resolve()
        else reject(new Error(`pandoc exit ${code}`))
      })
    })

    log("export", `pandoc ${args.format} done: ${args.outputPath}`)
    return args.outputPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
