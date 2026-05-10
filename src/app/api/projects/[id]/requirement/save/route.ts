import { withErrorBoundary, AppError } from "@/lib/errors"
import { NextRequest } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { J } from "@/lib/db/json"
import fs from "node:fs/promises"
import { dirname } from "node:path"
import { z } from "zod"

const SaveSchema = z.object({
  content: z.string().min(1),
})

export const POST = withErrorBoundary(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const raw = await req.json()
  const parsed = SaveSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError("E_BAD_REQUEST", "参数校验失败: " + parsed.error.flatten().fieldErrors.content?.join(", "))
  }

  const { content } = parsed.data
  const filePath = paths.prd(params.id)
  await fs.mkdir(dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, content, "utf-8")

  // Upsert artifact (保持 locked 状态不变)
  const existing = await prisma.artifact.findFirst({
    where: { projectId: params.id, type: "prd" },
    orderBy: { version: "desc" },
  })
  if (existing && !existing.locked) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: { storagePath: filePath, version: existing.version + 1, meta: J.stringify({ savedAt: new Date().toISOString() }) },
    })
  } else if (!existing) {
    await prisma.artifact.create({
      data: { projectId: params.id, type: "prd", version: 1, storagePath: filePath },
    })
  }

  return { saved: true, length: content.length }
})
