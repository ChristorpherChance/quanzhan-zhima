import Anthropic from "@anthropic-ai/sdk"
import { AppError } from "@/lib/errors"
import type { LlmRequest, LlmResponse, LlmStreamEvent } from "./types"

export interface AnthropicOpts {
  model: string
  envKey: string
}

function getClient(opts: AnthropicOpts): Anthropic {
  const apiKey = process.env[opts.envKey]
  if (!apiKey) {
    throw new AppError("E_GATE_CLOSED", `缺少 API Key: ${opts.envKey}`)
  }
  return new Anthropic({ apiKey })
}

function extractSystem(req: LlmRequest): string | undefined {
  const lines = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
  return lines.length > 0 ? lines.join("\n") : undefined
}

function convertMessages(
  req: LlmRequest,
): { role: "user" | "assistant"; content: string }[] {
  return req.messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }))
}

export async function chat(
  req: LlmRequest,
  opts: AnthropicOpts,
): Promise<LlmResponse> {
  const client = getClient(opts)
  const system = extractSystem(req)
  const messages = convertMessages(req)
  const temperature = req.temperature ?? 0.4
  const maxTokens = req.maxTokens ?? 4096

  const response = await client.messages.create({
    model: opts.model,
    system,
    messages,
    temperature,
    max_tokens: maxTokens,
  })

  const text = response.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("")

  return {
    text,
    model: response.model,
    tokensIn: response.usage.input_tokens,
    tokensOut: response.usage.output_tokens,
  }
}

export async function* stream(
  req: LlmRequest,
  opts: AnthropicOpts,
): AsyncIterable<LlmStreamEvent> {
  let client: Anthropic
  try {
    client = getClient(opts)
  } catch (e: unknown) {
    yield {
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    }
    return
  }

  const system = extractSystem(req)
  const messages = convertMessages(req)
  const temperature = req.temperature ?? 0.4
  const maxTokens = req.maxTokens ?? 4096

  try {
    const rawStream = await client.messages.create({
      model: opts.model,
      system,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    })

    for await (const event of rawStream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { type: "delta", text: event.delta.text }
      }
    }

    yield { type: "done", model: opts.model }
  } catch (e: unknown) {
    yield {
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
