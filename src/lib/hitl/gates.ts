import { prisma } from "@/lib/db/prisma"
import { AppError } from "@/lib/errors"
import { J } from "@/lib/db/json"

export type GateType = "G1" | "G2" | "G3"

async function checkConditions(
  projectId: string,
  gate: GateType,
): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = []

  if (gate === "G1") {
    const prd = await prisma.artifact.findFirst({
      where: { projectId, type: "prd" },
      orderBy: { version: "desc" },
    })
    if (!prd) reasons.push("未生成 PRD")
  } else if (gate === "G2") {
    for (const t of ["design-summary", "design-api", "design-db", "design-detail", "design-ui"]) {
      const a = await prisma.artifact.findFirst({
        where: { projectId, type: t },
        orderBy: { version: "desc" },
      })
      if (!a) reasons.push(`缺少子产物：${t}`)
      else if (!a.locked) reasons.push(`未锁定：${t}`)
    }
  } else if (gate === "G3") {
    const report = await prisma.artifact.findFirst({
      where: { projectId, type: "review-report" },
      orderBy: { version: "desc" },
    })
    if (!report) reasons.push("未生成审查报告")
    const meta = report?.meta ? J.parse<{ hasP0?: boolean }>(report.meta, {}) : {}
    if (meta.hasP0) reasons.push("P0 缺陷未修复")
  }

  return { ok: reasons.length === 0, reasons }
}

export async function lockGate(projectId: string, gate: GateType) {
  const { ok, reasons } = await checkConditions(projectId, gate)
  if (!ok) throw new AppError("E_GATE_CLOSED", "关卡条件未满足", { reasons })

  const row = await prisma.gate.upsert({
    where: { projectId_type: { projectId, type: gate } },
    create: { projectId, type: gate, status: "locked", lockedAt: new Date() },
    update: { status: "locked", lockedAt: new Date(), reopenReason: null },
  })

  const nextStage =
    gate === "G1" ? "design" : gate === "G2" ? "dev" : "done"
  await prisma.project.update({
    where: { id: projectId },
    data: { currentStage: nextStage },
  })

  return { gate: row, nextStage }
}

export async function reopenGate(
  projectId: string,
  gate: GateType,
  reason: string,
) {
  return prisma.gate.update({
    where: { projectId_type: { projectId, type: gate } },
    data: { status: "reopened", reopenReason: reason },
  })
}

export { checkConditions }
