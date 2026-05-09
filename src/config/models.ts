export type LlmProviderKey = "deepseek" | "opus" | "kimi" | "xiaomi" | "gpt"

export interface LlmProviderCfg {
  provider: "anthropic" | "openai-compatible"
  model: string
  baseURL?: string
  envKey: string
  enabled: boolean
  notes?: string
}

export const LLM_CONFIG: Record<LlmProviderKey, LlmProviderCfg> = {
  deepseek: { provider: "openai-compatible", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1", envKey: "DEEPSEEK_API_KEY", enabled: true, notes: "主用" },
  opus:     { provider: "anthropic", model: "claude-opus-4-20250514", envKey: "ANTHROPIC_API_KEY", enabled: false, notes: "扩展位 · 深推理" },
  kimi:     { provider: "openai-compatible", model: "moonshot-v1-128k", baseURL: "https://api.moonshot.cn/v1", envKey: "KIMI_API_KEY", enabled: false, notes: "扩展位" },
  xiaomi:   { provider: "openai-compatible", model: "milm-pro", baseURL: "https://api.mi.com/openai/v1", envKey: "XIAOMI_API_KEY", enabled: false, notes: "扩展位" },
  gpt:      { provider: "openai-compatible", model: "gpt-4o", baseURL: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY", enabled: false, notes: "扩展位" },
}

export const FALLBACK_ORDER: LlmProviderKey[] = ["deepseek", "opus", "kimi", "xiaomi", "gpt"]
