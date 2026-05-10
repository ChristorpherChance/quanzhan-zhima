import { withErrorBoundary, AppError } from "@/lib/errors"
import { exportSchema } from "@/lib/api-schemas"
import { paths } from "@/config/paths"
import { pandocConvert } from "@/lib/export/pandoc"
import { mdToDocx, mdToPdf } from "@/lib/export/native"
import { reviewToXlsx, parseDefects } from "@/lib/export/excel"
import { packCodeZip } from "@/lib/export/git-zip"
import { prisma } from "@/lib/db/prisma"
import fs from "node:fs/promises"
import path from "node:path"
import crypto from "node:crypto"
import { NextRequest } from "next/server"

const USE_PANDOC = process.env.EXPORT_USE_PANDOC === "1"

async function convertMarkdown(inputMd: string, outputPath: string, format: "docx" | "pdf"): Promise<string> {
  if (USE_PANDOC) {
    return pandocConvert({ inputMd, outputPath, format })
  }
  const mdContent = await fs.readFile(inputMd, "utf-8")
  if (format === "docx") {
    return mdToDocx(mdContent, outputPath)
  }
  return mdToPdf(mdContent, outputPath)
}

const VALID_TYPES = ["prd", "design", "code", "review"]

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string; type: string } },
) => {
  if (!VALID_TYPES.includes(params.type)) throw new AppError("E_VALIDATION", "无效导出类型")
  const body = exportSchema.parse(await req.json())
  const outDir = paths.exports(params.id)
  await fs.mkdir(outDir, { recursive: true })

  const files: Array<{ format: string; downloadUrl: string; error?: string }> = []
  for (const fmt of body.formats) {
    try {
      const fileId = crypto.randomUUID()
      const ext = fmt === "zip" ? "zip" : fmt === "xlsx" ? "xlsx" : fmt === "docx" ? "docx" : "md"
      const outPath = path.join(outDir, `${fileId}.${ext}`)

      if (params.type === "prd" && ["md", "docx", "pdf"].includes(fmt)) {
        const prdPath = paths.prd(params.id)
        if (fmt === "md") {
          await fs.copyFile(prdPath, outPath)
        } else {
          try { await convertMarkdown(prdPath, outPath, fmt as "docx" | "pdf") }
          catch { files.push({ format: fmt, downloadUrl: "", error: "导出失败" }); continue }
        }
      } else if (params.type === "design" && ["md", "docx", "pdf"].includes(fmt)) {
        const designDir = paths.design(params.id)
        const merged = path.join(outDir, `${fileId}_merged.md`)
        const files_list = await fs.readdir(designDir).catch(() => [] as string[])
        const mdContents = await Promise.all(
          files_list.filter(f => f.endsWith(".md")).map(f => fs.readFile(path.join(designDir, f), "utf8")),
        )
        await fs.writeFile(merged, mdContents.join("\n\n---\n\n"), "utf8")
        if (fmt === "md") {
          await fs.copyFile(merged, outPath)
        } else {
          try { await convertMarkdown(merged, outPath, fmt as "docx" | "pdf") }
          catch { files.push({ format: fmt, downloadUrl: "", error: "导出失败" }); continue }
        }
      } else if (params.type === "code" && fmt === "zip") {
        await packCodeZip(paths.workspace(params.id), outPath)
      } else if (params.type === "review") {
        if (fmt === "xlsx") {
          const report = await prisma.artifact.findFirst({
            where: { projectId: params.id, type: "review-report" },
            orderBy: { version: "desc" },
          })
          if (!report) throw new AppError("E_NOT_FOUND", "未找到审查报告")
          const md = await fs.readFile(path.join(paths.project(params.id), "reports", "review.md"), "utf8").catch(() => "")
          const defects = parseDefects(md)
          await reviewToXlsx({ title: "审查缺陷表", defects }, outPath)
        } else if (["md", "docx", "pdf"].includes(fmt)) {
          const rptPath = path.join(paths.project(params.id), "reports", "review.md")
          if (fmt === "md") {
            await fs.copyFile(rptPath, outPath)
          } else {
            try { await convertMarkdown(rptPath, outPath, fmt as "docx" | "pdf") }
            catch { files.push({ format: fmt, downloadUrl: "", error: "导出失败" }); continue }
          }
        }
      } else {
        files.push({ format: fmt, downloadUrl: "", error: "不支持的格式组合" })
        continue
      }

      files.push({ format: fmt, downloadUrl: `/api/projects/${params.id}/exports/download/${path.basename(outPath)}` })
    } catch (e: unknown) {
      files.push({ format: fmt, downloadUrl: "", error: String((e as Error)?.message ?? e) })
    }
  }

  return { files }
})
