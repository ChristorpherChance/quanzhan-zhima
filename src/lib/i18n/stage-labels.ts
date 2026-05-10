import type { GateType } from "@/lib/hitl/gates"

export const STAGE_LABEL: Record<GateType, string> = {
  G0: "立项",
  G1: "需求",
  G2: "设计",
  G3: "开发",
  G4: "审查",
  G5: "导出",
  G6: "交付",
}

export const stageActionLabel = (g: GateType) => `完成${STAGE_LABEL[g]}阶段`
export const stageReopenLabel = (g: GateType) => `重新打开${STAGE_LABEL[g]}阶段`
