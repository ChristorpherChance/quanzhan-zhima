import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { updateProjectSchema } from "@/lib/api-schemas"
import { NextRequest, NextResponse } from "next/server"
import { paths } from "@/config/paths"
import fs from "node:fs/promises"

export const GET = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { artifacts: true, gates: true },
  })
  if (!project) throw new AppError("E_NOT_FOUND", "项目不存在")
  const conversationsMeta = await prisma.conversation.findMany({
    where: { projectId: params.id },
    select: { agentType: true, updatedAt: true },
  })
  return { project, artifacts: project.artifacts, gates: project.gates, conversationsMeta }
})

export const PATCH = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const body = updateProjectSchema.parse(await req.json())
  const project = await prisma.project.update({
    where: { id: params.id },
    data: body,
  })
  return { project }
})

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id
  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) return NextResponse.json({ ok: false, error: "项目不存在" }, { status: 404 })

  // 1. 软删除标记
  await prisma.project.update({ where: { id }, data: { archived: true } })

  try {
    // 2. 停止运行中的沙箱
    try {
      const { getRunning } = await import("@/lib/sandbox")
      const h = getRunning(id)
      if (h) await h.stop().catch(() => {})
    } catch { /* 沙箱模块不可用则跳过 */ }

    // 3. 清理文件系统
    await fs.rm(paths.workspace(id), { recursive: true, force: true }).catch(() => {})
    await fs.rm(paths.design(id), { recursive: true, force: true }).catch(() => {})
    await fs.rm(paths.exports(id), { recursive: true, force: true }).catch(() => {})

    // 4. DB 级联删除
    await prisma.project.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    // 任一步失败回滚 archived
    await prisma.project.update({ where: { id }, data: { archived: false } }).catch(() => {})
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message ?? String(e) },
      { status: 500 },
    )
  }
}
