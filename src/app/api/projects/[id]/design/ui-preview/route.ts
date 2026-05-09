import { withErrorBoundary, AppError } from "@/lib/errors"
import { startSandbox, getRunning } from "@/lib/sandbox"
import { paths } from "@/config/paths"
import path from "node:path"
import fs from "node:fs/promises"
import { NextRequest } from "next/server"

export const GET = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const existing = getRunning(params.id + "-ui")
  if (existing) return { url: existing.url, port: existing.port }

  const uiFile = path.join(paths.design(params.id), "ui.html")
  try {
    await fs.access(uiFile)
  } catch {
    throw new AppError("E_NOT_FOUND", "UI 原型未生成")
  }

  // Serve UI prototype via a simple static server
  const staticDir = paths.design(params.id)
  const h = await startSandbox({
    projectId: params.id + "-ui",
    workspaceDir: staticDir,
    command: `npx serve -l $PORT -s .`,
  })
  return { url: h.url, port: h.port }
})
