import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { NextRequest } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) throw new AppError("E_VALIDATION", "未提供文件")

  if (file.size > MAX_SIZE) {
    throw new AppError("E_VALIDATION", `文件过大: ${(file.size / 1024 / 1024).toFixed(1)}MB，最大 10MB`)
  }

  const ext = file.name.split(".").pop()?.toLowerCase()
  if (!ext || !["docx", "pdf", "md", "txt"].includes(ext)) {
    throw new AppError("E_VALIDATION", `不支持的格式: .${ext}，支持 .docx .pdf .md .txt`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  let parsedContent = ""

  if (ext === "docx") {
    const mammoth = await import("mammoth")
    const result = await mammoth.extractRawText({ buffer })
    parsedContent = result.value
  } else if (ext === "pdf") {
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse(buffer)
    // load 在类型声明中为 private，但运行时可用
    await (parser as unknown as { load: () => Promise<void> }).load()
    const pages = await parser.getText()
    parsedContent = Array.isArray(pages) ? pages.join("\n\n") : String(pages)
  } else {
    // md / txt: plain text
    parsedContent = buffer.toString("utf-8")
  }

  if (!parsedContent.trim()) {
    throw new AppError("E_PARSE_FAILED", "文件解析后无内容")
  }

  // 保存原始文件和解析内容
  const uploadDir = paths.design(params.id).replace("/design", "/uploads")
  await fs.mkdir(uploadDir, { recursive: true })
  const uploadId = crypto.randomUUID()
  const parsedPath = path.join(uploadDir, `${uploadId}.md`)
  const origPath = path.join(uploadDir, `${uploadId}_original.${ext}`)

  await fs.writeFile(parsedPath, parsedContent, "utf-8")
  await fs.writeFile(origPath, buffer)

  // 保存为 requirement-upload artifact
  const existing = await prisma.artifact.findFirst({
    where: { projectId: params.id, type: "requirement-upload" },
    orderBy: { version: "desc" },
  })
  const version = (existing?.version ?? 0) + 1

  await prisma.artifact.create({
    data: {
      projectId: params.id,
      type: "requirement-upload",
      version,
      storagePath: parsedPath,
      meta: JSON.stringify({
        originalName: file.name,
        originalPath: origPath,
        parsedPath,
        format: ext,
        size: file.size,
        uploadId,
        contentLength: parsedContent.length,
      }),
    },
  })

  return {
    uploadId,
    originalName: file.name,
    format: ext,
    contentLength: parsedContent.length,
    preview: parsedContent.slice(0, 500),
  }
})
