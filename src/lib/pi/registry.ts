import fs from "node:fs"
import { ModelRegistry, AuthStorage } from "@mariozechner/pi-coding-agent"
import { LLM_CONFIG, type LlmProviderKey, type LlmProviderCfg } from "@/config/models"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"

// ── Singleton cache ──────────────────────────────────────────────
let cached: { modelRegistry: ModelRegistry; authStorage: AuthStorage } | null = null

/**
 * Pi SDK provider names differ from our internal LLM_CONFIG keys.
 * This mapping bridges the two worlds.
 */
export const PI_PROVIDER: Record<LlmProviderKey, string> = {
  deepseek: "deepseek",
  opus: "anthropic",
  kimi: "moonshotai",
  xiaomi: "xiaomi",
  gpt: "openai",
  ollama: "ollama",
}

/** Read saved API keys from settings.json (if any). */
function loadSavedApiKeys(): Record<string, string> {
  try {
    const raw = fs.readFileSync(paths.settings, "utf8")
    const data = JSON.parse(raw)
    const providers = (data.providers ?? {}) as Record<string, { apiKey?: string }>
    const result: Record<string, string> = {}
    for (const [k, v] of Object.entries(providers)) {
      if (v.apiKey) result[k] = v.apiKey
    }
    return result
  } catch {
    return {}
  }
}

/**
 * Initialize ModelRegistry + AuthStorage for the embedded Pi agent.
 *
 * Accepts optional runtime config (from settings overrides).
 * Uses static LLM_CONFIG as fallback when runtimeConfig is not provided.
 */
export function getPiRegistry(
  runtimeConfig?: Record<LlmProviderKey, LlmProviderCfg>,
): { modelRegistry: ModelRegistry; authStorage: AuthStorage } {
  const config = runtimeConfig ?? LLM_CONFIG

  // Invalidate cache if runtimeConfig changes (detected by different reference)
  if (cached && runtimeConfig && runtimeConfig !== LLM_CONFIG) {
    cached = null
  }

  if (cached) return cached

  const savedApiKeys = loadSavedApiKeys()
  const authStorage = AuthStorage.inMemory()
  const modelRegistry = ModelRegistry.inMemory(authStorage)

  // Set API keys for all enabled providers
  for (const key of Object.keys(config) as LlmProviderKey[]) {
    const cfg = config[key]
    if (key !== "deepseek" && !cfg.enabled) continue

    // Priority: saved settings > env var
    const apiKey = savedApiKeys[key] || process.env[cfg.envKey]
    if (apiKey) {
      authStorage.setRuntimeApiKey(PI_PROVIDER[key], apiKey)
      log("pi", `✓ API key set for ${PI_PROVIDER[key]}`)
    } else if (key === "deepseek") {
      log("pi", "⚠ DEEPSEEK_API_KEY not found in env or settings – Pi agent may fail")
    }
  }

  // Register custom providers for models NOT in the Pi SDK built-in list.
  // deepseek 也走自定义注册，确保 model id 受控（deepseek-chat / deepseek-reasoner）
  const customOnly: LlmProviderKey[] = ["deepseek", "kimi", "xiaomi", "ollama"]
  for (const key of customOnly) {
    const cfg = config[key]
    if (!cfg.enabled) continue

    const api = ("openai-completions" as const)

    if (key === "deepseek") {
      modelRegistry.registerProvider(PI_PROVIDER[key], {
        name: PI_PROVIDER[key],
        baseUrl: cfg.baseURL!,
        api,
        models: [
          {
            id: "deepseek-chat",
            name: "DeepSeek Chat",
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64_000,
            maxTokens: 8192,
          },
          {
            id: "deepseek-reasoner",
            name: "DeepSeek Reasoner",
            reasoning: true,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 64_000,
            maxTokens: 8192,
          },
        ],
      })
      log("pi", `✓ Custom provider registered: ${PI_PROVIDER[key]} (deepseek-chat + deepseek-reasoner)`)
    } else {
      modelRegistry.registerProvider(PI_PROVIDER[key], {
        name: PI_PROVIDER[key],
        baseUrl: cfg.baseURL!,
        api,
        models: [
          {
            id: cfg.model,
            name: cfg.model,
            reasoning: false,
            input: ["text"],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            contextWindow: 128_000,
            maxTokens: 8192,
          },
        ],
      })
      log("pi", `✓ Custom provider registered: ${PI_PROVIDER[key]} / ${cfg.model}`)
    }
  }

  cached = { modelRegistry, authStorage }
  log("pi", "✓ Pi registry initialized")
  return cached
}

/**
 * Invalidate the cached registry so next call re-creates it.
 */
export function invalidatePiRegistry(): void {
  cached = null
  log("pi", "Pi registry cache invalidated")
}

/**
 * Resolve a Model object from the cached registry.
 * Uses the Pi SDK provider name (e.g., "deepseek", "anthropic", "openai").
 */
export function resolvePiModel(
  provider: string,
  modelId: string,
): ReturnType<ModelRegistry["find"]> {
  const { modelRegistry } = getPiRegistry()
  return modelRegistry.find(provider, modelId)
}

/**
 * Resolve a model using the internal LLM_CONFIG key (e.g., "deepseek", "opus").
 */
export function resolvePiModelByKey(
  key: LlmProviderKey,
  runtimeConfig?: Record<LlmProviderKey, LlmProviderCfg>,
): ReturnType<ModelRegistry["find"]> {
  const config = runtimeConfig ?? LLM_CONFIG
  const cfg = config[key]
  const { modelRegistry } = getPiRegistry(config)
  return modelRegistry.find(PI_PROVIDER[key], cfg.model)
}
