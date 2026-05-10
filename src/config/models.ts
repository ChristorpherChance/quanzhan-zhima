export type LlmProviderKey = "deepseek" | "opus" | "kimi" | "xiaomi" | "gpt" | "ollama"

export interface LlmProviderCfg {
  provider: "anthropic" | "openai-compatible"
  model: string
  baseURL?: string
  envKey: string
  enabled: boolean
  maxTokens?: number
  maxTokensRange?: { min: number; max: number; default: number }
  notes?: string
}

export function clampMaxTokens(raw: number | undefined | null, range?: { min: number; max: number; default: number }): number {
  const r = range ?? { min: 1, max: 4096, default: 4096 }
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return r.default
  return Math.min(Math.max(Math.floor(raw), r.min), r.max)
}

export const LLM_CONFIG: Record<LlmProviderKey, LlmProviderCfg> = {
  deepseek: { provider: "openai-compatible", model: "deepseek-v4-pro", baseURL: "https://api.deepseek.com/v1", envKey: "DEEPSEEK_API_KEY", enabled: true, maxTokens: 393216, maxTokensRange: { min: 1, max: 393216, default: 32768 }, notes: "主用 · deepseek-v4-pro 1M上下文 384K输出" },
  opus:     { provider: "anthropic", model: "claude-opus-4-20250514", envKey: "ANTHROPIC_API_KEY", enabled: false, maxTokensRange: { min: 1, max: 8192, default: 4096 }, notes: "扩展位 · 深推理" },
  kimi:     { provider: "openai-compatible", model: "moonshot-v1-128k", baseURL: "https://api.moonshot.cn/v1", envKey: "KIMI_API_KEY", enabled: false, maxTokensRange: { min: 1, max: 32768, default: 4096 }, notes: "扩展位" },
  xiaomi:   { provider: "openai-compatible", model: "milm-pro", baseURL: "https://api.mi.com/openai/v1", envKey: "XIAOMI_API_KEY", enabled: false, maxTokensRange: { min: 1, max: 8192, default: 4096 }, notes: "扩展位" },
  gpt:      { provider: "openai-compatible", model: "gpt-4o", baseURL: "https://api.openai.com/v1", envKey: "OPENAI_API_KEY", enabled: false, maxTokensRange: { min: 1, max: 16384, default: 4096 }, notes: "扩展位" },
  ollama:   { provider: "openai-compatible", model: "qwen2.5:14b", baseURL: "http://localhost:11434/v1", envKey: "OLLAMA_API_KEY", enabled: false, maxTokensRange: { min: 1, max: 4096, default: 2048 }, notes: "本地模型 · 需自行启动 ollama serve" },
}

export const FALLBACK_ORDER: LlmProviderKey[] = ["deepseek", "opus", "kimi", "xiaomi", "gpt", "ollama"]
