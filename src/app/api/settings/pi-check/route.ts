export const runtime = "nodejs"

import { withErrorBoundary } from "@/lib/errors"
import { getPiRegistry, PI_PROVIDER } from "@/lib/pi/registry"
import { getRuntimeConfig } from "@/lib/llm/runtime-config"
import type { LlmProviderKey } from "@/config/models"

export const GET = withErrorBoundary(async () => {
  const runtimeConfig = await getRuntimeConfig()

  let connected = false
  let error: string | undefined

  const providerStatus: Record<string, { hasKey: boolean; modelResolved: boolean; modelId: string; piProvider: string }> = {}

  try {
    const { modelRegistry, authStorage } = getPiRegistry(runtimeConfig)

    for (const key of Object.keys(runtimeConfig) as LlmProviderKey[]) {
      const cfg = runtimeConfig[key]
      const piProvider = PI_PROVIDER[key]
      const apiKey = await authStorage.getApiKey(piProvider)
      const hasKey = apiKey !== undefined && apiKey.length > 0
      const model = hasKey ? modelRegistry.find(piProvider, cfg.model) : null

      providerStatus[key] = {
        hasKey,
        modelResolved: model !== null,
        modelId: cfg.model,
        piProvider,
      }
    }

    connected = true
  } catch (e: unknown) {
    error = (e as Error)?.message ?? String(e)
  }

  return { connected, error, providers: providerStatus }
})
