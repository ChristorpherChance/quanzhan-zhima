export const runtime = "nodejs"

import fs from "node:fs/promises"
import { withErrorBoundary, AppError } from "@/lib/errors"
import { paths } from "@/config/paths"

const VALID_TYPES = ["changelog", "requirements", "plan"] as const
type DocType = (typeof VALID_TYPES)[number]

const PATH_MAP: Record<DocType, (projectId: string) => string> = {
  changelog: paths.changelogPath,
  requirements: paths.requirementsPath,
  plan: paths.planPath,
}

export const GET = withErrorBoundary(async (
  _req: Request,
  ctx: { params: { id: string; docType: string } },
) => {
  const { id, docType } = ctx.params
  if (!VALID_TYPES.includes(docType as DocType)) {
    throw new AppError("E_VALIDATION", `无效的文档类型: ${docType}。支持: ${VALID_TYPES.join(", ")}`)
  }

  const filePath = PATH_MAP[docType as DocType](id)
  let content = ""
  try {
    content = await fs.readFile(filePath, "utf-8")
  } catch {
    content = ""
  }

  return { content, docType }
})
