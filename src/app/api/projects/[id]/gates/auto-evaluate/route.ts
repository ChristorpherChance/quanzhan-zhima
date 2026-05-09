import { withErrorBoundary } from "@/lib/errors"
import { confidenceFor } from "@/agents/confidence"
import { lockGate, type GateType } from "@/lib/hitl/gates"
import { prisma } from "@/lib/db/prisma"
import { NextRequest } from "next/server"

function gateForStage(stage: string): GateType | null {
  if (stage === "requirement") return "G1"
  if (stage === "design") return "G2"
  if (stage === "dev") return "G3"
  return null
}

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: params.id } })
  const gate = gateForStage(project.currentStage)
  if (!gate) return { confidence: 1, decision: "locked", reason: "project already done" }

  const score = await confidenceFor(params.id, gate)
  await prisma.gate.update({
    where: { projectId_type: { projectId: params.id, type: gate } },
    data: { confidence: score, mode: "hybrid" },
  })

  if (score >= project.hitlThreshold) {
    try { await lockGate(params.id, gate) } catch { /* not ready yet */ }
  }

  return { confidence: score, decision: score >= project.hitlThreshold ? "locked" : "need-human" }
})
