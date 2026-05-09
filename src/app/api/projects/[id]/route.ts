import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { updateProjectSchema } from "@/lib/api-schemas"
import { NextRequest } from "next/server"

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
