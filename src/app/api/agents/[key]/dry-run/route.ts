import { withErrorBoundary } from "@/lib/errors"
import { NextRequest } from "next/server"
import { chat } from "@/lib/llm/gateway"
import { loadAgentConfig } from "@/agents/registry"

export const maxDuration = 120

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { key: string } },
) => {
  const config = await loadAgentConfig(params.key)

  const t0 = Date.now()
  try {
    const r = await chat({
      task: "clarify",
      messages: [
        { role: "system", content: "你是一个助手。请用中文回复。" },
        { role: "user", content: "说'你好，Agent 测试成功！'" },
      ],
      temperature: config.temperature,
      maxTokens: Math.min(config.maxTokens, 256),
      preferModel: config.modelId,
    })

    return {
      ok: true,
      agentKey: params.key,
      latencyMs: Date.now() - t0,
      modelUsed: config.modelId,
      response: r.text.slice(0, 200),
    }
  } catch (e: unknown) {
    return {
      ok: false,
      agentKey: params.key,
      latencyMs: Date.now() - t0,
      modelUsed: config.modelId,
      error: String((e as Error)?.message ?? e),
    }
  }
})
