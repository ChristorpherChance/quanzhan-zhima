export const runtime = "nodejs"

import { withErrorBoundary, AppError } from "@/lib/errors"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

export const POST = withErrorBoundary(async (
  req: Request,
  _ctx: { params: { id: string } },
) => {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) throw new AppError("E_VALIDATION", "未提供文件")

  const ext = path.extname(file.name).toLowerCase()
  const buffer = Buffer.from(await file.arrayBuffer())

  let content: string
  if (ext === ".md" || ext === ".txt") {
    content = buffer.toString("utf-8")
  } else if (ext === ".doc" || ext === ".docx") {
    // 尝试使用 pandoc 转换
    const tmpDir = path.join(os.tmpdir(), "quanzhan-upload")
    await fs.mkdir(tmpDir, { recursive: true })
    const inputPath = path.join(tmpDir, file.name)
    const outputPath = path.join(tmpDir, "converted.md")
    await fs.writeFile(inputPath, buffer)
    try {
      const { execSync } = await import("node:child_process")
      execSync(`pandoc "${inputPath}" -t markdown -o "${outputPath}"`, { timeout: 30000 })
      content = await fs.readFile(outputPath, "utf-8")
    } catch {
      // pandoc 不可用时，对 .docx 尝试简单提取
      content = `[文件上传成功: ${file.name}]\n\n注意: 需要安装 pandoc 才能解析 .doc/.docx 内容。`
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true })
    }
  } else {
    throw new AppError("E_VALIDATION", `不支持的文件类型: ${ext}。支持: .md, .txt, .doc, .docx`)
  }

  return { content, fileName: file.name }
})
