import { prisma } from "@/lib/db/prisma"
import { AppError } from "@/lib/errors"
import { J } from "@/lib/db/json"
import { paths } from "@/config/paths"
import { existsSync } from "node:fs"

export type GateType = "G0" | "G1" | "G2" | "G3" | "G4" | "G5" | "G6"

const STAGE_NEXT: Record<string, string> = {
  G0: "requirement",
  G1: "design",
  G2: "dev",
  G3: "review",
  G4: "review",
  G5: "export",
  G6: "done",
}

async function checkConditions(
  projectId: string,
  gate: GateType,
): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = []

  if (gate === "G0") {
    // G0 立项：oneLiner ≥ 8 字
    const p = await prisma.project.findUnique({ where: { id: projectId } })
    if (!p) { reasons.push("项目不存在"); return { ok: false, reasons } }
    if (!p.oneLiner || p.oneLiner.trim().length < 8) reasons.push("一句话需求少于 8 个字符")
  } else if (gate === "G1") {
    // G1 需求→设计：PRD 已生成并锁定
    const prd = await prisma.artifact.findFirst({
      where: { projectId, type: "prd" },
      orderBy: { version: "desc" },
    })
    if (!prd) reasons.push("未生成 PRD")
    else if (!prd.locked) reasons.push("PRD 未完成")
  } else if (gate === "G2") {
    // G2 设计→开发：全部 5 个设计子产物已生成并锁定
    for (const t of ["design-summary", "design-api", "design-db", "design-detail", "design-ui"]) {
      const a = await prisma.artifact.findFirst({
        where: { projectId, type: t },
        orderBy: { version: "desc" },
      })
      if (!a) reasons.push(`缺少子产物：${t}`)
      else if (!a.locked) reasons.push(`未完成：${t}`)
    }
  } else if (gate === "G3") {
    // G3 开发→审查：code 产物存在 + workspace 有入口文件
    const code = await prisma.artifact.findFirst({
      where: { projectId, type: "code" },
      orderBy: { version: "desc" },
    })
    if (!code) reasons.push("未生成代码产物")
    else if (!code.locked) reasons.push("代码未确认")
    const ws = paths.workspace(projectId)
    const hasEntry = existsSync(`${ws}/index.html`) ||
                     existsSync(`${ws}/server.js`) ||
                     existsSync(`${ws}/package.json`)
    if (!hasEntry) reasons.push("工作区缺少入口文件")
    // J2: 软化 builtOk — 仅缺失时 hard-block，失败仅 warning
    if (code?.meta) {
      try {
        const meta = JSON.parse(code.meta as string)
        if (meta.builtOk === undefined) reasons.push("未执行构建自检")
        // builtOk === false 不阻断，由 confirm 路由透传 warning
      } catch { /* meta 解析失败则跳过 */ }
    }
  } else if (gate === "G4") {
    // G4 审查→导出：审查报告已生成且无 P0 缺陷
    const report = await prisma.artifact.findFirst({
      where: { projectId, type: "review-report" },
      orderBy: { version: "desc" },
    })
    if (!report) reasons.push("未生成审查报告")
    const meta = report?.meta ? J.parse<{ hasP0?: boolean }>(report.meta, {}) : {}
    if (meta.hasP0) reasons.push("P0 缺陷未修复")
  } else if (gate === "G5") {
    // G5 导出→交付：至少有一个 exports 文件已生成
    const exp = await prisma.job.findFirst({
      where: { projectId, type: "export", status: "succeeded" },
    })
    if (!exp) reasons.push("未完成导出")
  } else if (gate === "G6") {
    // G6 交付：全部阶段锁定
    const allGates = await prisma.gate.findMany({
      where: { projectId },
    })
    const lockedSet = new Set(allGates.filter(g => g.status === "locked").map(g => g.type))
    for (const g of ["G0","G1","G2","G3","G4","G5"]) {
      if (!lockedSet.has(g)) reasons.push(`${g} 未完成`)
    }
  }

  return { ok: reasons.length === 0, reasons }
}

export async function lockGate(projectId: string, gate: GateType) {
  const { ok, reasons } = await checkConditions(projectId, gate)
  if (!ok) throw new AppError("E_GATE_CLOSED", "阶段条件未满足", { reasons })

  const row = await prisma.gate.upsert({
    where: { projectId_type: { projectId, type: gate } },
    create: { projectId, type: gate, status: "locked", lockedAt: new Date() },
    update: { status: "locked", lockedAt: new Date(), reopenReason: null },
  })

  const nextStage = STAGE_NEXT[gate] ?? projectId
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

// J8: 重新生成产物时，反锁当前 + 后续所有 Gate
const GATE_SEQUENCE: GateType[] = ["G0", "G1", "G2", "G3", "G4", "G5", "G6"]

export async function reopenFromGate(projectId: string, fromGate: GateType) {
  const startIdx = GATE_SEQUENCE.indexOf(fromGate)
  if (startIdx < 0) return
  for (let i = startIdx; i < GATE_SEQUENCE.length; i++) {
    const g = GATE_SEQUENCE[i]
    await prisma.gate.updateMany({
      where: { projectId, type: g },
      data: { status: "reopened", reopenReason: `产物重新生成 (触发于 ${fromGate})`, lockedAt: null },
    })
  }
}

/** Auto-evaluate: compute confidence for a gate and auto-lock if ≥ threshold */
export async function autoEvaluate(
  projectId: string,
  gate: GateType,
  threshold: number = 0.8,
): Promise<{ locked: boolean; confidence: number; reasons: string[] }> {
  const { ok, reasons } = await checkConditions(projectId, gate)
  const confidence = ok ? 1.0 : Math.max(0, 1.0 - reasons.length * 0.2)

  if (confidence >= threshold) {
    try {
      await lockGate(projectId, gate)
      return { locked: true, confidence, reasons: [] }
    } catch {
      return { locked: false, confidence, reasons }
    }
  }

  return { locked: false, confidence, reasons }
}

export { checkConditions }
