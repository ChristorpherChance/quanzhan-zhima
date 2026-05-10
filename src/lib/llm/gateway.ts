import { LLM_CONFIG, FALLBACK_ORDER } from "@/config/models"
import type { LlmProviderKey, LlmProviderCfg } from "@/config/models"
import { chat as openAiChat, stream as openAiStream } from "./openai-compat"
import { chat as anthropicChat, stream as anthropicStream } from "./anthropic"
import { getRuntimeConfig } from "./runtime-config"
import { log } from "@/lib/log"
import { AppError } from "@/lib/errors"
import type { LlmRequest, LlmResponse, LlmStreamEvent } from "./types"

// ---- error classification ----

function classifyLlmError(e: unknown): string {
  if (e !== null && typeof e === "object") {
    const status = (e as { status?: number }).status
    if (status === 401 || status === 403) return "E_LLM_AUTH"
    if (status === 400 || status === 422) return "E_LLM_BAD_REQUEST"
    if (status === 429) return "E_LLM_RATE_LIMIT"
    if (status !== undefined && status >= 500) return "E_LLM_UPSTREAM"
  }
  const msg = String((e as Error)?.message ?? e ?? "")
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)) return "E_LLM_NETWORK"
  return "E_LLM_FAILED"
}

// ---- runtime health state ----

const runtimeDisabled = new Set<LlmProviderKey>()
const failureCount = new Map<LlmProviderKey, number>()

function markFailure(key: LlmProviderKey): void {
  const cnt = (failureCount.get(key) ?? 0) + 1
  failureCount.set(key, cnt)
  if (cnt >= 3 && !runtimeDisabled.has(key)) {
    runtimeDisabled.add(key)
    log("gateway", `Provider ${key} 连续失败 ${cnt} 次，已 runtime 禁用`)
  }
}

function resetFailure(key: LlmProviderKey): void {
  failureCount.delete(key)
}

// ---- helpers ----

function isRetryable(e: unknown): boolean {
  if (e !== null && typeof e === "object") {
    const status = (e as { status?: number }).status
    if (status !== undefined && [429, 500, 502, 503, 504].includes(status)) {
      return true
    }
    const name = (e as { name?: string }).name ?? ""
    if (/ConnectionError|TimeoutError|AbortError/i.test(name)) {
      return true
    }
  }
  return false
}

function reorderForPrefer(
  prefer: string | undefined,
): LlmProviderKey[] {
  if (!prefer) return [...FALLBACK_ORDER]
  const idx = FALLBACK_ORDER.indexOf(prefer as LlmProviderKey)
  if (idx === -1) return [...FALLBACK_ORDER]
  return [
    prefer as LlmProviderKey,
    ...FALLBACK_ORDER.filter((k) => k !== prefer),
  ]
}

// ---- internal dispatch ----

async function callChat(
  req: LlmRequest,
  _key: LlmProviderKey,
  cfg: LlmProviderCfg,
): Promise<LlmResponse> {
  if (cfg.provider === "anthropic") {
    return anthropicChat(req, { model: cfg.model, envKey: cfg.envKey, maxTokensRange: cfg.maxTokensRange })
  }
  return openAiChat(req, {
    baseURL: cfg.baseURL!,
    model: cfg.model,
    envKey: cfg.envKey,
    maxTokensRange: cfg.maxTokensRange,
  })
}

function callStream(
  req: LlmRequest,
  _key: LlmProviderKey,
  cfg: LlmProviderCfg,
): AsyncIterable<LlmStreamEvent> {
  if (cfg.provider === "anthropic") {
    return anthropicStream(req, { model: cfg.model, envKey: cfg.envKey, maxTokensRange: cfg.maxTokensRange })
  }
  return openAiStream(req, {
    baseURL: cfg.baseURL!,
    model: cfg.model,
    envKey: cfg.envKey,
    maxTokensRange: cfg.maxTokensRange,
  })
}

// ---- public API ----

/**
 * 通过 fallback 链路发送 chat 请求。
 * 按 FALLBACK_ORDER 顺序尝试可用 provider，每个 provider 最多重试 2 次（仅对可重试错误）。
 */
export async function chat(req: LlmRequest): Promise<LlmResponse> {
  log(
    "gateway",
    `chat 请求 task=${req.task} prefer=${req.preferModel ?? "none"}`,
  )

  const runtimeConfig = await getRuntimeConfig()
  const order = reorderForPrefer(req.preferModel)
  const errors: string[] = []

  for (const key of order) {
    const cfg = runtimeConfig[key]
    if (!cfg.enabled || runtimeDisabled.has(key)) {
      log(
        "gateway",
        `跳过 ${key}: enabled=${cfg.enabled} runtimeDisabled=${runtimeDisabled.has(key)}`,
      )
      continue
    }

    log("gateway", `尝试 ${key} (${cfg.provider})`)

    let lastErr: unknown
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await callChat(req, key, cfg)
        resetFailure(key)
        log(
          "gateway",
          `${key} 成功 model=${resp.model} tokens=${resp.tokensIn}/${resp.tokensOut}`,
        )
        return resp
      } catch (e: unknown) {
        lastErr = e
        if (!isRetryable(e)) {
          log(
            "gateway",
            `${key} 第${attempt}次失败 (non-retryable): ${String(e instanceof Error ? e.message : e)}`,
          )
          break
        }
        log(
          "gateway",
          `${key} 第${attempt}次失败 (retryable): ${String(e instanceof Error ? e.message : e)}`,
        )
      }
    }

    markFailure(key)
    const code = classifyLlmError(lastErr)
    errors.push(
      `${key}[${code}]: ${String(lastErr instanceof Error ? (lastErr as Error).message : lastErr)}`,
    )
  }

  // 用最具体的错误码
  const allCodes = errors.map((e) => e.match(/\[(E_LLM_\w+)\]/)?.[1]).filter(Boolean) as string[]
  const code = allCodes.find((c) => c === "E_LLM_AUTH") ??
               allCodes.find((c) => c === "E_LLM_BAD_REQUEST") ??
               allCodes.find((c) => c === "E_LLM_RATE_LIMIT") ??
               allCodes.find((c) => c === "E_LLM_UPSTREAM") ??
               allCodes.find((c) => c === "E_LLM_NETWORK") ??
               "E_GATE_CLOSED"

  throw new AppError(code, `所有 LLM 提供商均不可用: ${errors.join("; ")}`)
}

/**
 * 通过 fallback 链路发送 stream 请求。
 * 仅在没有 yield 任何 delta 之前发生错误时才进行 fallback/重试；
 * 一旦开始 yield delta，则跟随当前流不会回退。
 */
export async function* stream(
  req: LlmRequest,
): AsyncIterable<LlmStreamEvent> {
  log(
    "gateway",
    `stream 请求 task=${req.task} prefer=${req.preferModel ?? "none"}`,
  )

  const runtimeConfig = await getRuntimeConfig()
  const order = reorderForPrefer(req.preferModel)
  const errors: string[] = []

  for (const key of order) {
    const cfg = runtimeConfig[key]
    if (!cfg.enabled || runtimeDisabled.has(key)) continue

    log("gateway", `stream 尝试 ${key} (${cfg.provider})`)

    let lastErr: Error | null = null

    for (let attempt = 1; attempt <= 2; attempt++) {
      let hasDelta = false
      let failed = false

      try {
        const iter = callStream(req, key, cfg)
        for await (const event of iter) {
          if (event.type === "error") {
            failed = true
            lastErr = new Error(event.error ?? "stream error")
            if (hasDelta) {
              yield event
              return
            }
            break
          }
          if (event.type === "delta") {
            hasDelta = true
          }
          yield event
        }

        if (!failed) {
          resetFailure(key)
          log("gateway", `stream ${key} 完成`)
          return
        }
      } catch (e: unknown) {
        failed = true
        lastErr = e instanceof Error ? e : new Error(String(e))
        if (hasDelta) {
          yield { type: "error", error: lastErr.message }
          return
        }
      }

      if (failed && lastErr && !isRetryable(lastErr)) {
        break
      }
      if (failed) {
        log(
          "gateway",
          `stream ${key} 第${attempt}次重试: ${lastErr?.message ?? ""}`,
        )
      }
    }

    markFailure(key)
    if (lastErr) {
      const code = classifyLlmError(lastErr)
      errors.push(`${key}[${code}]: ${lastErr.message}`)
    }
  }

  yield {
    type: "error",
    error: `所有 LLM 提供商均不可用: ${errors.join("; ")}`,
  }
}
