import OpenAI from "openai"
import { AppError } from "@/lib/errors"
import { clampMaxTokens } from "@/config/models"
import type { LlmRequest, LlmResponse, LlmStreamEvent } from "./types"

export interface OpenAiCompatOpts {
  baseURL: string
  model: string
  envKey: string
  maxTokensRange?: { min: number; max: number; default: number }
}

function getClient(opts: OpenAiCompatOpts): OpenAI {
  const apiKey = process.env[opts.envKey]
  if (!apiKey) {
    throw new AppError("E_GATE_CLOSED", `缺少 API Key: ${opts.envKey}`)
  }
  return new OpenAI({ baseURL: opts.baseURL, apiKey })
}

export async function chat(
  req: LlmRequest,
  opts: OpenAiCompatOpts,
): Promise<LlmResponse> {
  const client = getClient(opts)
  const temperature = req.temperature ?? 0.4
  const maxTokens = clampMaxTokens(req.maxTokens, opts.maxTokensRange)

  const completion = await client.chat.completions.create({
    model: opts.model,
    messages: req.messages,
    temperature,
    max_tokens: maxTokens,
  })

  return {
    text: completion.choices[0]?.message?.content ?? "",
    model: completion.model,
    tokensIn: completion.usage?.prompt_tokens ?? 0,
    tokensOut: completion.usage?.completion_tokens ?? 0,
  }
}

export async function* stream(
  req: LlmRequest,
  opts: OpenAiCompatOpts,
): AsyncIterable<LlmStreamEvent> {
  let client: OpenAI
  try {
    client = getClient(opts)
  } catch (e: unknown) {
    yield {
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    }
    return
  }

  const temperature = req.temperature ?? 0.4
  const maxTokens = clampMaxTokens(req.maxTokens, opts.maxTokensRange)

  try {
    const rawStream = await client.chat.completions.create({
      model: opts.model,
      messages: req.messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    })

    let modelName = opts.model
    for await (const chunk of rawStream) {
      const delta = chunk.choices[0]?.delta?.content
      if (delta) {
        yield { type: "delta", text: delta }
      }
      if (chunk.model) {
        modelName = chunk.model
      }
    }

    yield { type: "done", model: modelName }
  } catch (e: unknown) {
    yield {
      type: "error",
      error: e instanceof Error ? e.message : String(e),
    }
  }
}
