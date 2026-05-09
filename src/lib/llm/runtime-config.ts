import fs from "node:fs/promises"
import { LLM_CONFIG, type LlmProviderKey, type LlmProviderCfg } from "@/config/models"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"

// ── Saved provider overrides ───────────────────────────────────────

interface SavedProviders {
  [key: string]: { enabled?: boolean; model?: string; apiKey?: string }
}

interface SavedSettings {
  providers?: SavedProviders
  hitlMode?: string
  hitlThreshold?: number
}

let cachedConfig: Record<LlmProviderKey, LlmProviderCfg> | null = null

async function readSavedSettings(): Promise<SavedSettings> {
  try {
    const raw = await fs.readFile(paths.settings, "utf8")
    return JSON.parse(raw) as SavedSettings
  } catch {
    return {}
  }
}

/**
 * Build the runtime LLM config by merging persisted overrides
 * onto the static LLM_CONFIG baseline.
 */
export async function getRuntimeConfig(): Promise<Record<LlmProviderKey, LlmProviderCfg>> {
  if (cachedConfig) return cachedConfig

  const saved = await readSavedSettings()
  const providers = saved.providers ?? {}

  const merged = { ...LLM_CONFIG } as Record<LlmProviderKey, LlmProviderCfg>
  for (const key of Object.keys(merged) as LlmProviderKey[]) {
    const override = providers[key]
    if (!override) continue

    if (override.enabled !== undefined) {
      merged[key] = { ...merged[key], enabled: override.enabled }
    }
    if (override.model !== undefined) {
      merged[key] = { ...merged[key], model: override.model }
    }
  }

  cachedConfig = merged
  log("runtime-config", "✓ Runtime config built from LLM_CONFIG + saved overrides")
  return merged
}

/**
 * Invalidate the in-memory cache so next getRuntimeConfig() re-reads from disk.
 */
export function invalidateRuntimeConfig(): void {
  cachedConfig = null
  log("runtime-config", "Runtime config cache invalidated")
}
