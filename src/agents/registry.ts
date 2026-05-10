/**
 * Agent 注册表 — 数据驱动配置中心
 *
 * 硬编码默认值确保即使数据库为空也能正常工作。
 * 数据库 AgentConfig 表可覆盖默认值（按需加载）。
 */

export interface AgentConfig {
  key: string
  label: string
  description: string
  stage: string
  modelId: string
  provider: string
  temperature: number
  maxTokens: number
  timeoutMs: number
  enabled: boolean
  systemPrompt?: string | null
}

const DEFAULTS: Record<string, AgentConfig> = {
  requirement: {
    key: "requirement",
    label: "需求分析",
    description: "澄清需求、生成 PRD、编辑需求文档",
    stage: "requirement",
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    temperature: 0.4,
    maxTokens: 32768,
    timeoutMs: 10 * 60_000,
    enabled: true,
  },
  design: {
    key: "design",
    label: "设计生成",
    description: "概要设计、详细设计、API 设计、数据库设计、UI 原型",
    stage: "design",
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    temperature: 0.3,
    maxTokens: 65536,
    timeoutMs: 15 * 60_000,
    enabled: true,
  },
  dev: {
    key: "dev",
    label: "代码开发",
    description: "基于设计产物生成完整可运行代码，含构建自检",
    stage: "dev",
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    temperature: 0.2,
    maxTokens: 65536,
    timeoutMs: 30 * 60_000,
    enabled: true,
  },
  review: {
    key: "review",
    label: "代码审查",
    description: "静态分析、依赖审计、测试运行、LLM 综合审查",
    stage: "review",
    modelId: "deepseek-v4-pro",
    provider: "deepseek",
    temperature: 0.1,
    maxTokens: 16384,
    timeoutMs: 10 * 60_000,
    enabled: true,
  },
}

const AGENT_KEYS = Object.keys(DEFAULTS) as string[]

export function getAgentConfig(key: string): AgentConfig | undefined {
  return DEFAULTS[key]
}

export function getAgentTypes(): string[] {
  return [...AGENT_KEYS]
}

export function listAgents(): AgentConfig[] {
  return AGENT_KEYS.map((k) => DEFAULTS[k])
}

/**
 * 异步加载 DB 覆盖后的配置。
 * 若 DB 不可用则静默回退到硬编码默认值。
 */
export async function loadAgentConfig(key: string): Promise<AgentConfig> {
  const base = DEFAULTS[key]
  if (!base) throw new Error(`未知 Agent 类型: ${key}`)
  try {
    const { prisma } = await import("@/lib/db/prisma")
    const row = await prisma.agentConfig.findUnique({ where: { key } })
    if (row?.enabled !== false) {
      return {
        ...base,
        modelId: row?.modelId ?? base.modelId,
        provider: row?.provider ?? base.provider,
        temperature: row?.temperature ?? base.temperature,
        maxTokens: row?.maxTokens ?? base.maxTokens,
        timeoutMs: row?.timeoutMs ?? base.timeoutMs,
        enabled: row?.enabled ?? base.enabled,
        systemPrompt: row?.systemPrompt ?? base.systemPrompt,
      }
    }
    return base
  } catch {
    return base
  }
}

/**
 * K1: 构造完整 system prompt（DB 覆盖 + Memory + Skill）。
 * 所有 agent 构造 system prompt 时统一调用此函数。
 */
export async function buildSystemPrompt(
  key: string,
  projectId: string,
  baseSystem: string,
): Promise<string> {
  try {
    const { prisma } = await import("@/lib/db/prisma")
    const [cfg, mems, skills] = await Promise.all([
      prisma.agentConfig.findUnique({ where: { key } }).catch(() => null),
      prisma.agentMemory.findMany({
        where: { agentKey: key, OR: [{ projectId }, { projectId: null }] },
        orderBy: [{ weight: "desc" }, { updatedAt: "desc" }],
        take: 20,
      }).catch(() => []),
      prisma.agentSkill.findMany({ where: { agentKey: key, isEnabled: true } }).catch(() => []),
    ])

    const sysOverride = cfg?.systemPrompt?.trim() || baseSystem

    const memBlock = mems.length
      ? `\n\n# 记忆库（按权重）\n${mems.map((m: { kind: string; title: string; content: string }) => `- [${m.kind}] ${m.title}: ${m.content}`).join("\n")}`
      : ""

    const skillBlock = skills.length
      ? `\n\n# 技能库\n${skills.map((s: { name: string; instruction: string; examplesJson: string }) => `## ${s.name}\n${s.instruction}\n示例:\n${s.examplesJson}`).join("\n\n")}`
      : ""

    return sysOverride + memBlock + skillBlock
  } catch {
    return baseSystem
  }
}
