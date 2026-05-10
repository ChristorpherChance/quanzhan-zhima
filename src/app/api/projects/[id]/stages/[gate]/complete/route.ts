import { withErrorBoundary, AppError } from "@/lib/errors"
import { prisma } from "@/lib/db/prisma"
import { lockGate, type GateType } from "@/lib/hitl/gates"
import { NextRequest } from "next/server"
import { J } from "@/lib/db/json"

const ARTIFACTS_PER_GATE: Record<GateType, string[]> = {
  G0: [],
  G1: ["prd"],
  G2: ["design-summary", "design-detail", "design-api", "design-db", "design-ui"],
  G3: ["code"],
  G4: ["review-report"],
  G5: [],
  G6: [],
}

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string; gate: string } },
) => {
  const gate = params.gate as GateType
  const types = ARTIFACTS_PER_GATE[gate] ?? []

  // 1) 把每个相关 artifact 最新版自动 confirm（locked=true）
  for (const t of types) {
    const latest = await prisma.artifact.findFirst({
      where: { projectId: params.id, type: t },
      orderBy: { version: "desc" },
    })
    if (!latest) throw new AppError("E_GATE_CLOSED", "阶段条件未满足", { reasons: [`缺少产物：${t}`] })
    if (!latest.locked) {
      await prisma.artifact.update({ where: { id: latest.id }, data: { locked: true } })
    }
  }

  // 2) 调 lockGate（会再做一次 checkConditions 兜底）
  const r = await lockGate(params.id, gate)

  // 记录 changelog
  const { appendGateLog } = await import("@/agents/orchestrator")
  void appendGateLog(params.id, gate)

  return r
})
