import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { createProjectSchema } from "@/lib/api-schemas"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = createProjectSchema.parse(await req.json())
  const project = await prisma.project.create({ data: body })
  return { project }
})

export const GET = withErrorBoundary(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(Number(searchParams.get("limit")) || 20, 100)
  const cursor = searchParams.get("cursor")
  const items = await prisma.project.findMany({
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { updatedAt: "desc" },
  })
  const hasMore = items.length > limit
  if (hasMore) items.pop()
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id : null }
})
