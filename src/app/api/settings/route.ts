export const runtime = "nodejs"

import { withErrorBoundary, AppError } from "@/lib/errors"
import { updateSettingsSchema } from "@/lib/api-schemas"
import { paths } from "@/config/paths"
import { LLM_CONFIG, type LlmProviderKey } from "@/config/models"
import { getRuntimeConfig, invalidateRuntimeConfig } from "@/lib/llm/runtime-config"
import fs from "node:fs/promises"
import { NextRequest } from "next/server"

async function readSettings() {
  try {
    const raw = await fs.readFile(paths.settings, "utf8")
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { hitlMode: "manual", hitlThreshold: 0.8 }
  }
}

export const GET = withErrorBoundary(async () => {
  const saved = await readSettings()
  const savedProviders = (saved.providers ?? {}) as Record<string, { enabled?: boolean; model?: string; apiKey?: string }>

  const providerEntries = Object.entries(LLM_CONFIG).map(([k, v]) => {
    const savedP = savedProviders[k] ?? {}
    return [
      k,
      {
        enabled: savedP.enabled ?? v.enabled,
        model: savedP.model ?? v.model,
        hasKey: Boolean(savedP.apiKey || process.env[v.envKey]),
      },
    ]
  })

  return {
    hitlMode: saved.hitlMode ?? "manual",
    hitlThreshold: saved.hitlThreshold ?? 0.8,
    providers: Object.fromEntries(providerEntries),
    piVersion: "0.73.0",
  }
})

export const PUT = withErrorBoundary(async (req: NextRequest) => {
  const body = updateSettingsSchema.parse(await req.json())
  const saved = await readSettings()
  if (body.hitlMode !== undefined) saved.hitlMode = body.hitlMode
  if (body.hitlThreshold !== undefined) saved.hitlThreshold = body.hitlThreshold

  // Persist provider overrides
  if (body.providers) {
    const savedProviders = (saved.providers ?? {}) as Record<string, Record<string, unknown>>
    for (const [k, v] of Object.entries(body.providers)) {
      const key = k as LlmProviderKey
      const cfg = LLM_CONFIG[key]
      if (!cfg) continue

      if (!savedProviders[k]) savedProviders[k] = {}
      if (v.enabled !== undefined) savedProviders[k].enabled = v.enabled
      if (v.model !== undefined) savedProviders[k].model = v.model
      if (v.apiKey !== undefined) savedProviders[k].apiKey = v.apiKey

      // Validate: enabling a provider that has no key at all
      const effectiveEnabled = v.enabled ?? savedProviders[k].enabled ?? cfg.enabled
      if (effectiveEnabled) {
        const hasKey = savedProviders[k].apiKey || process.env[cfg.envKey]
        if (!hasKey) {
          throw new AppError("E_VALIDATION", `请先为 ${k} 配置 API Key（在 .env.local 或此页面输入）`)
        }
      }
    }
    saved.providers = savedProviders
  }

  await fs.mkdir(paths.data, { recursive: true })
  await fs.writeFile(paths.settings, JSON.stringify(saved, null, 2), "utf8")
  invalidateRuntimeConfig()
  return saved
})
