import { withErrorBoundary } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { createProjectSchema } from "@/lib/api-schemas"
import { NextRequest, NextResponse } from "next/server"

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = createProjectSchema.parse(await req.json())
  // P2-4: 检查同名项目
  const existing = await prisma.project.findFirst({
    where: { name: body.name }
  })
  if (existing) {
    return new NextResponse(
      JSON.stringify({ error: "已存在同名项目", existingId: existing.id }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    )
  }
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
