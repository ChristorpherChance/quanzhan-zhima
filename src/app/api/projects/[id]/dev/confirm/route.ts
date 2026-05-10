import { NextResponse } from "next/server"
import { prisma } from "@/lib/db/prisma"
import { lockGate, checkConditions } from "@/lib/hitl/gates"

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const projectId = params.id

  // 1. 锁最新 code artifact
  const code = await prisma.artifact.findFirst({
    where: { projectId, type: "code" },
    orderBy: { version: "desc" },
  })
  if (!code) return NextResponse.json({ ok: false, error: "尚未生成代码" }, { status: 400 })
  if (!code.locked) {
    await prisma.artifact.update({ where: { id: code.id }, data: { locked: true } })
  }

  // 2. 收集 warnings（builtOk=false 不阻断，仅提示）
  const warnings: string[] = []
  if (code?.meta) {
    try {
      const meta = JSON.parse(code.meta as string)
      if (meta.builtOk === false) {
        warnings.push("构建未通过，但允许提交审查")
      }
      if (meta.coverage != null && meta.coverage < 60) {
        warnings.push(`AC 覆盖率仅 ${meta.coverage}%，建议补充`)
      }
    } catch { /* meta 解析失败则跳过 */ }
  }

  // 3. 检查 G3，逐条返回 reasons
  const { ok, reasons } = await checkConditions(projectId, "G3")
  if (!ok) {
    return NextResponse.json({ ok: false, reasons, warnings }, { status: 400 })
  }

  // 4. 锁 G3
  try {
    const r = await lockGate(projectId, "G3")
    return NextResponse.json({ ok: true, nextStage: r.nextStage, warnings })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, reasons: [(e as Error)?.message ?? String(e)], warnings },
      { status: 400 },
    )
  }
}
