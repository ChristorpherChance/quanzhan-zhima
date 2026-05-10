import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"

export const POST = withErrorBoundary(async (
  _req: Request,
  { params }: { params: { id: string; type: string } },
) => {
  const a = await prisma.artifact.findFirst({
    where: { projectId: params.id, type: params.type },
    orderBy: { version: "desc" },
  })
  if (!a) {
    throw new AppError("E_NOT_FOUND", `产物 ${params.type} 不存在`)
  }
  await prisma.artifact.update({
    where: { id: a.id },
    data: { locked: true, lockedAt: new Date() },
  })
  return { locked: true, type: params.type, version: a.version }
})
