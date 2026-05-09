import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"

const VALID_TYPES = ["prd", "design-summary", "design-detail", "design-api", "design-db", "design-ui", "review-report"] as const

export const GET = withErrorBoundary(async (
  _req: Request,
  { params }: { params: { id: string; type: string } },
) => {
  const type = params.type
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    throw new AppError("E_VALIDATION", `Unknown artifact type: ${type}`)
  }

  const versions = await prisma.artifact.findMany({
    where: { projectId: params.id, type },
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      locked: true,
      createdAt: true,
      lockedAt: true,
      meta: true,
    },
  })

  return { versions }
})
