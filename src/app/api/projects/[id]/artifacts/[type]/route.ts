import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import fs from "node:fs/promises"

const VALID_TYPES = ["prd", "design-summary", "design-detail", "design-api", "design-db", "design-ui", "review-report"] as const

export const GET = withErrorBoundary(async (
  req: Request,
  { params }: { params: { id: string; type: string } },
) => {
  const type = params.type
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    throw new AppError("E_VALIDATION", `Unknown artifact type: ${type}`)
  }

  // 支持 ?version=N 查询历史版本
  const url = new URL(req.url)
  const versionParam = url.searchParams.get("version")
  const versionFilter = versionParam ? { version: parseInt(versionParam, 10) } : {}

  const artifact = await prisma.artifact.findFirst({
    where: { projectId: params.id, type, ...versionFilter },
    orderBy: { version: "desc" },
  })

  if (!artifact) {
    throw new AppError("E_NOT_FOUND", `Artifact ${type} not found for project ${params.id}`)
  }

  let content: string
  try {
    content = await fs.readFile(artifact.storagePath, "utf-8")
    // 如果内容包裹在 markdown 代码块中，去掉外层包裹（兼容 LLM 返回格式）
    const mdMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
    if (mdMatch) {
      content = mdMatch[1]
    }
  } catch {
    throw new AppError("E_NOT_FOUND", `Artifact file not found: ${artifact.storagePath}`)
  }

  return { content, type: artifact.type, version: artifact.version }
})
