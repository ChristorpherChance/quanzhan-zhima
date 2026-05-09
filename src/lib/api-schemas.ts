import { z } from "zod"

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  oneLiner: z.string().min(1).max(500),
  seedType: z.enum(["photovoltaic", "power-anomaly", "egg"]).optional(),
  hitlMode: z.enum(["manual", "auto", "hybrid"]).optional(),
  hitlThreshold: z.number().min(0).max(1).optional(),
})

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hitlMode: z.enum(["manual", "auto", "hybrid"]).optional(),
  hitlThreshold: z.number().min(0).max(1).optional(),
  currentStage: z.enum(["requirement", "design", "dev", "review", "done"]).optional(),
})

export const clarifySchema = z.object({
  extraContext: z.string().max(1000).optional(),
})

export const answerSchema = z.object({
  answers: z.record(z.string()),
})

export const editRequirementSchema = z.object({
  section: z.string().optional(),
  instruction: z.string().min(1),
})

export const designGenerateSchema = z.object({
  subtype: z.enum(["summary", "detail", "api", "db", "ui"]),
})

export const designEditSchema = z.object({
  subtype: z.enum(["summary", "detail", "api", "db", "ui"]),
  instruction: z.string().min(1),
})

export const devRunSchema = z.object({
  instruction: z.string().optional(),
})

export const reviewRunSchema = z.object({
  scope: z.array(z.enum(["lint", "types", "audit", "unit", "e2e"])).optional(),
})

export const reviewFixSchema = z.object({
  severityFilter: z.array(z.enum(["P0", "P1"])),
})

export const reopenGateSchema = z.object({
  reason: z.string().min(1),
})

export const exportSchema = z.object({
  formats: z.array(z.enum(["md", "docx", "pdf", "xlsx", "zip"])),
})

export const updateSettingsSchema = z.object({
  hitlMode: z.enum(["manual", "auto", "hybrid"]).optional(),
  hitlThreshold: z.number().min(0).max(1).optional(),
  providers: z.record(z.object({
    enabled: z.boolean().optional(),
    model: z.string().optional(),
    apiKey: z.string().optional(),
  })).optional(),
})

export const eggSchema = z.object({
  oneLiner: z.string().min(1).max(500),
})

export const confirmArtifactSchema = z.object({
  content: z.string().min(1),
  meta: z.any().optional(),
})

export const designStepSchema = z.object({
  step: z.enum(["summary", "detail", "api", "db", "ui"]),
})
