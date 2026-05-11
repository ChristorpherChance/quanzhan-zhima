import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"

/**
 * GET /api/projects/[id]/artifacts
 * Returns list of existing artifact types with latest version info.
 * Used by frontend to avoid polling 404s on non-existent artifacts.
 */
export const GET = withErrorBoundary(async (
  _req: Request,
  { params }: { params: { id: string } },
) => {
  const artifacts = await prisma.artifact.findMany({
    where: { projectId: params.id },
    orderBy: { type: "asc" },
  })

  // Group by type, keep latest version
  const typeMap = new Map<string, { type: string; latestVersion: number; locked: boolean }>()
  for (const a of artifacts) {
    const existing = typeMap.get(a.type)
    if (!existing || a.version > existing.latestVersion) {
      typeMap.set(a.type, {
        type: a.type,
        latestVersion: a.version,
        locked: a.locked,
      })
    }
  }

  return { types: [...typeMap.values()] }
})
