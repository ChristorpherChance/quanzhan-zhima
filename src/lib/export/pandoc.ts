import { spawn } from "node:child_process"
import { log } from "@/lib/log"

export async function pandocConvert(args: {
  inputMd: string
  outputPath: string
  format: "docx" | "pdf"
}) {
  const flags =
    args.format === "pdf"
      ? ["--pdf-engine=xelatex", "-V", "mainfont=Noto Sans CJK SC", "-V", "CJKmainfont=Noto Sans CJK SC"]
      : []

  await new Promise<void>((resolve, reject) => {
    const p = spawn("pandoc", [args.inputMd, "-o", args.outputPath, ...flags], {
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
}
