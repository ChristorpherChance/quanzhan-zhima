import { withErrorBoundary } from "@/lib/errors"
import { startSandbox, getRunning } from "@/lib/sandbox"
import { prisma } from "@/lib/db/prisma"
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
  // 早返：复用已运行的沙箱
  const existing = getRunning(params.id)
  if (existing) {
    await prisma.job.upsert({
      where: { id: `sb-${params.id}` },
      create: {
        id: `sb-${params.id}`,
        projectId: params.id,
        agentType: "dev",
        type: "sandbox-run",
        status: "succeeded",
      },
      update: { status: "succeeded" },
    })
    return { url: existing.url, port: existing.port, sandboxId: params.id }
  }

  const workspaceDir = paths.workspace(params.id)
  ensureSkeletonWorkspace(workspaceDir)
  mountPreviewPrototype(params.id, workspaceDir)

  // 创建 sandbox-run Job 占位（修复 G3 永远过不了的硬 bug）
  const job = await prisma.job.create({
    data: { projectId: params.id, agentType: "dev", type: "sandbox-run", status: "running" },
  })

  try {
    const h = await startSandbox({
      projectId: params.id,
      workspaceDir,
      command: "npm run dev",
    })
    await prisma.job.update({ where: { id: job.id }, data: { status: "succeeded" } })
    return { url: h.url, port: h.port, sandboxId: params.id, jobId: job.id }
  } catch (e: unknown) {
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "failed", logs: String((e as Error)?.message ?? e) },
    })
    return { url: null, message: "sandbox unavailable, use export zip", error: String((e as Error)?.message ?? e) }
  }
})
