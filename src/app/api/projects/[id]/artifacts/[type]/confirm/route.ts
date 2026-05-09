export const runtime = "nodejs"

import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { confirmArtifactSchema } from "@/lib/api-schemas"
import fs from "node:fs/promises"
import { dirname } from "node:path"
import { J } from "@/lib/db/json"

const VALID_TYPES = ["prd", "design-summary", "design-detail", "design-api", "design-db", "design-ui", "review-report"] as const

export const POST = withErrorBoundary(async (
  req: Request,
  { params }: { params: { id: string; type: string } },
) => {
  const type = params.type
  if (!VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    throw new AppError("E_VALIDATION", `Unknown artifact type: ${type}`)
  }

  const body = confirmArtifactSchema.parse(await req.json())

  const latest = await prisma.artifact.findFirst({
    where: { projectId: params.id, type: params.type },
    orderBy: { version: "desc" },
  })

  const newVersion = (latest?.version ?? 0) + 1
  const storagePath = paths.artifactVersioned(params.id, params.type, newVersion)

  await fs.mkdir(dirname(storagePath), { recursive: true })
  await fs.writeFile(storagePath, body.content, "utf-8")

  const artifact = await prisma.artifact.create({
    data: {
      projectId: params.id,
      type: params.type,
      version: newVersion,
      locked: true,
      storagePath,
      meta: body.meta ? J.stringify(body.meta) : null,
    },
  })

  return { artifact, version: newVersion }
})
