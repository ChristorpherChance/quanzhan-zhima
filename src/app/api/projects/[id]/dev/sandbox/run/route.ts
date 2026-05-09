import { withErrorBoundary } from "@/lib/errors"
import { startSandbox, getRunning } from "@/lib/sandbox"
import { paths } from "@/config/paths"
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs"
import { NextRequest } from "next/server"

function copyDirSync(src: string, dest: string) {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const sp = `${src}/${entry.name}`
    const dp = `${dest}/${entry.name}`
    if (entry.isDirectory()) copyDirSync(sp, dp)
    else copyFileSync(sp, dp)
  }
}

function ensureSkeletonWorkspace(workspaceDir: string) {
  if (existsSync(`${workspaceDir}/package.json`)) return

  const skeletonDir = paths.workspace("_skeleton")
  try {
    copyDirSync(skeletonDir, workspaceDir)
  } catch {
    mkdirSync(workspaceDir, { recursive: true })
    throw new Error("skeleton template missing – run `mkdir -p storage/projects/_skeleton` with minimal node project files")
  }
}

/** Mount design/ui-prototype/ into workspace preview/ for static serving */
function mountPreviewPrototype(projectId: string, workspaceDir: string) {
  const protoSrc = `${paths.design(projectId)}/ui-prototype`
  const protoDest = `${workspaceDir}/preview`
  try {
    copyDirSync(protoSrc, protoDest)
  } catch {
    // 原型目录不存在时静默跳过
  }
}

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const existing = getRunning(params.id)
  if (existing) return { url: existing.url, port: existing.port, sandboxId: params.id }

  const workspaceDir = paths.workspace(params.id)
  ensureSkeletonWorkspace(workspaceDir)
  mountPreviewPrototype(params.id, workspaceDir)

  try {
    const h = await startSandbox({
      projectId: params.id,
      workspaceDir,
      command: "npm run dev",
    })
    return { url: h.url, port: h.port, sandboxId: params.id }
  } catch (e: unknown) {
    return { url: null, message: "sandbox unavailable, use export zip", error: String((e as Error)?.message ?? e) }
  }
})
