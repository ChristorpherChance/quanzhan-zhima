import { AppError } from "@/lib/errors"
import { paths } from "@/config/paths"
import fs from "node:fs/promises"
import path from "node:path"
import { NextRequest } from "next/server"

export const GET = async (
  _req: NextRequest,
  { params }: { params: { id: string; fileId: string } },
) => {
  const outDir = paths.exports(params.id)
  const filePath = path.join(outDir, params.fileId)
  try {
    const stat = await fs.stat(filePath)
    const buf = await fs.readFile(filePath)
    const ext = path.extname(params.fileId).toLowerCase()
    const mime: Record<string, string> = {
      ".md": "text/markdown",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".pdf": "application/pdf",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".zip": "application/zip",
    }
    return new Response(buf, {
      headers: {
        "Content-Type": mime[ext] ?? "application/octet-stream",
        "Content-Length": String(stat.size),
        "Content-Disposition": `attachment; filename="${params.fileId}"`,
      },
    })
  } catch {
    throw new AppError("E_NOT_FOUND", "文件不存在")
  }
}
