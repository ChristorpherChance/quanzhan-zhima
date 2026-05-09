import { prisma } from "@/lib/db/prisma"
import { chat } from "@/lib/llm/gateway"
import { log } from "@/lib/log"
import type { GateType } from "@/lib/hitl/gates"

/** LLM-based confidence scorer (existing, for fallback) */
export async function confidenceFor(
  projectId: string,
  gateType: string,
): Promise<number> {
  try {
    const r = await chat({
      task: "review",
      messages: [
        {
          role: "system",
          content:
            `你是评审员。给定刚生成的产物，输出 0-1 之间的浮点 confidence。\n` +
            `标准：完整性、内部一致性、是否覆盖 PRD 全部 AC。\n` +
            `仅输出 JSON：{"score": number, "reasons": string[]}.`,
        },
        {
          role: "user",
          content: `项目 ${projectId} 的 Gate ${gateType} 产物已生成。请评分。`,
        },
      ],
      temperature: 0.1,
      maxTokens: 256,
    })
    const parsed = JSON.parse(r.text) as { score: number }
    return typeof parsed.score === "number" ? parsed.score : 0.5
  } catch (e: unknown) {
    log("agent", "confidence scoring failed, defaulting to 0.5", e)
    return 0.5
  }
}

/** Rule-based confidence computation for all gates G0-G6 */
export async function computeGate(
  projectId: string,
  gate: GateType,
): Promise<{ confidence: number; reasons: string[] }> {
  const reasons: string[] = []

  switch (gate) {
    case "G0": {
      const p = await prisma.project.findUnique({ where: { id: projectId } })
      const len = (p?.oneLiner?.trim().length ?? 0)
      if (len < 8) reasons.push(`一句话需求仅 ${len} 字（需 ≥ 8）`)
      return { confidence: len >= 8 ? 1.0 : Math.min(len / 8, 0.9), reasons }
    }
    case "G1": {
      const prd = await prisma.artifact.findFirst({
        where: { projectId, type: "prd" },
        orderBy: { version: "desc" },
      })
      if (!prd) { reasons.push("PRD 不存在"); return { confidence: 0, reasons } }
      if (!prd.locked) reasons.push("PRD 未锁定")
      return { confidence: prd.locked ? 1.0 : 0.7, reasons }
    }
    case "G2": {
      const types = ["design-summary", "design-api", "design-db", "design-detail", "design-ui"]
      let locked = 0
      for (const t of types) {
        const a = await prisma.artifact.findFirst({
          where: { projectId, type: t },
          orderBy: { version: "desc" },
        })
        if (!a) reasons.push(`缺少 ${t}`)
        else if (!a.locked) reasons.push(`${t} 未锁定`)
        else locked++
      }
      return { confidence: locked / 5, reasons }
    }
    case "G3": {
      const code = await prisma.artifact.findFirst({
        where: { projectId, type: "code" },
        orderBy: { version: "desc" },
      })
      if (!code) { reasons.push("代码未生成"); return { confidence: 0.3, reasons } }
      const sandboxJob = await prisma.job.findFirst({
        where: { projectId, type: "sandbox-run", status: "succeeded" },
      })
      if (!sandboxJob) reasons.push("沙箱未成功启动")
      return { confidence: sandboxJob ? 1.0 : 0.6, reasons }
    }
    case "G4": {
      const report = await prisma.artifact.findFirst({
        where: { projectId, type: "review-report" },
        orderBy: { version: "desc" },
      })
      if (!report) { reasons.push("无审查报告"); return { confidence: 0, reasons } }
      try {
        const meta = JSON.parse(report.meta ?? "{}")
        if (meta.hasP0) reasons.push("存在 P0 缺陷")
        return { confidence: meta.hasP0 ? 0.5 : 1.0, reasons }
      } catch {
        return { confidence: 0.5, reasons: ["无法解析审查报告 meta"] }
      }
    }
    case "G5": {
      const exp = await prisma.job.findFirst({
        where: { projectId, type: "export", status: "succeeded" },
      })
      if (!exp) reasons.push("导出未完成")
      return { confidence: exp ? 1.0 : 0, reasons }
    }
    case "G6": {
      const all = await prisma.gate.findMany({ where: { projectId } })
      const lockedTypes = all.filter(g => g.status === "locked").map(g => g.type)
      const required = ["G0", "G1", "G2", "G3", "G4", "G5"]
      for (const g of required) {
        if (!lockedTypes.includes(g)) reasons.push(`${g} 未锁定`)
      }
      return { confidence: lockedTypes.length / required.length, reasons }
    }
    default:
      return { confidence: 0, reasons: [`未知关卡: ${gate}`] }
  }
}
