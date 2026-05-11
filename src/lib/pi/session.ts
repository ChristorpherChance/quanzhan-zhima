import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type CreateAgentSessionResult,
} from "@mariozechner/pi-coding-agent"
import type { ModelRegistry, AuthStorage } from "@mariozechner/pi-coding-agent"
import type { ToolDefinition } from "@mariozechner/pi-coding-agent"
import { getPiRegistry, resolvePiModelByKey } from "@/lib/pi/registry"
import { buildPiCustomTools } from "@/lib/pi/tools"
import { piFileTracker } from "@/lib/pi/file-tracker"
import { log } from "@/lib/log"

// ── Types ─────────────────────────────────────────────────────────

export interface PiRunOptions {
  /** Unique project identifier */
  projectId: string
  /** Absolute path to the project workspace directory */
  workspaceDir: string
  /** The prompt to send to the agent */
  prompt: string
  /** Provider to use (short name – maps to LLM_CONFIG keys) */
  provider?: "deepseek" | "anthropic" | "kimi" | "xiaomi" | "openai"
  /** Explicit model id override (default: from LLM_CONFIG for the provider) */
  modelId?: string
  /** System prompt override (becomes the full system prompt when set) */
  systemPromptOverride?: string
  /** Timeout in milliseconds (default: 180000 = 3 min) */
  timeoutMs?: number
  /** Callback for streaming events */
  onEvent?: (e: PiSessionEvent) => void
}

export type PiStreamEventType =
  | "delta"        // 兼容旧版：通用 delta
  | "text_delta"   // token 级文本增量
  | "thinking_delta" // token 级思考增量
  | "tool-call"     // 兼容旧版：合并的工具事件
  | "tool_start"   // 工具调用开始
  | "tool_update"  // 工具调用进度更新
  | "tool_end"     // 工具调用结束
  | "done"
  | "error"

export interface PiSessionEvent {
  type: PiStreamEventType
  data: unknown
}

// ── Provider name mapping ─────────────────────────────────────────
// PiRunOptions uses short names; Pi SDK uses canonical provider ids.

const PROVIDER_PI_NAME: Record<string, string> = {
  deepseek: "deepseek",
  anthropic: "anthropic",
  kimi: "moonshotai",
  xiaomi: "xiaomi",
  openai: "openai",
}

const PROVIDER_LLM_KEY: Record<string, string> = {
  deepseek: "deepseek",
  anthropic: "opus",
  kimi: "kimi",
  xiaomi: "xiaomi",
  openai: "gpt",
}

// ── Implementation ────────────────────────────────────────────────

/**
 * Run an embedded Pi coding agent session.
 *
 * Creates an in-memory session, injects custom workspace tools, sends
 * the prompt, and waits for the agent to finish or time out.
 *
 * Returns `{ ok: true, sessionFile }` on success, or
 * `{ ok: false, error }` on failure so callers can fall back gracefully.
 */
export async function runPiSession(
  opts: PiRunOptions,
): Promise<{ ok: boolean; sessionFile?: string; error?: string }> {
  const timeoutMs = opts.timeoutMs ?? 900_000
  const provider = opts.provider ?? "deepseek"

  // ── 1. Ensure workspaceDir exists ──────────────────────────────
  await fs.mkdir(opts.workspaceDir, { recursive: true })

  // ── 2. Get Pi registry ─────────────────────────────────────────
  let registry: { modelRegistry: ModelRegistry; authStorage: AuthStorage }
  try {
    registry = getPiRegistry()
  } catch (e: unknown) {
    return { ok: false, error: `Registry init failed: ${(e as Error)?.message ?? e}` }
  }

  // ── 3. Resolve model ───────────────────────────────────────────
  const llmKey = PROVIDER_LLM_KEY[provider] ?? "deepseek"
  const piProvider = PROVIDER_PI_NAME[provider] ?? "deepseek"

  let model: ReturnType<ModelRegistry["find"]>
  if (opts.modelId) {
    model = registry.modelRegistry.find(piProvider, opts.modelId)
  } else {
    model = resolvePiModelByKey(llmKey as any)
  }

  if (!model) {
    return {
      ok: false,
      error: `Model not found: provider=${piProvider} modelId=${opts.modelId ?? "default"} – check LLM_CONFIG and Pi registry`,
    }
  }

  // ── 4. Build custom tools ──────────────────────────────────────
  let customTools: ToolDefinition[]
  try {
    customTools = buildPiCustomTools({ workspaceDir: opts.workspaceDir })
  } catch (e: unknown) {
    return { ok: false, error: `Custom tools build failed: ${(e as Error)?.message ?? e}` }
  }

  // ── 5. Create managers (in-memory – no persistent session file) ─
  const settingsManager = SettingsManager.inMemory({
    defaultProvider: piProvider,
    defaultModel: model.id,
  })

  const sessionManager = SessionManager.inMemory(opts.workspaceDir)

  // ── 6. Create resource loader ──────────────────────────────────
  const resourceLoader = new DefaultResourceLoader({
    cwd: opts.workspaceDir,
    agentDir: path.join(os.tmpdir(), "pi-agent", opts.projectId),
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: opts.systemPromptOverride,
  })

  // ── 6.5 Reload resource loader (CRITICAL: loads systemPrompt) ─
  await resourceLoader.reload()

  // ── 7. Create agent session ────────────────────────────────────
  const abortController = new AbortController()
  let result: CreateAgentSessionResult
  try {
    result = await createAgentSession({
      cwd: opts.workspaceDir,
      authStorage: registry.authStorage,
      modelRegistry: registry.modelRegistry,
      model,
      customTools,
      resourceLoader,
      sessionManager,
      settingsManager,
    })
  } catch (e: unknown) {
    return {
      ok: false,
      error: `createAgentSession failed: ${(e as Error)?.message ?? e}`,
    }
  }

  const session = result.session
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let unsubEvents: (() => void) | undefined
  let settled = false

  // ── 8. Set up completion watcher BEFORE prompt() ────────────────
  const completionPromise = new Promise<void>((resolve, reject) => {
    timeoutId = setTimeout(() => {
      if (settled) return
      settled = true
      session.abort().catch(() => {})
      abortController.abort()
      reject(new Error(`Pi session timed out after ${timeoutMs}ms`))
    }, timeoutMs)

    // 追踪 workspace_write 参数（tool_start 时捕获，tool_end 时记录）
    let pendingWrite: { filePath: string; content: string } | null = null

    unsubEvents = session.subscribe((event) => {
      switch (event.type) {
        case "agent_end":
          if (settled) return
          settled = true
          if (timeoutId) clearTimeout(timeoutId)
          unsubEvents?.()
          opts.onEvent?.({ type: "done", data: event })
          resolve()
          break
        case "message_update": {
          const delta = (event as { delta?: { text_delta?: string; thinking_delta?: string } }).delta
          if (delta?.text_delta) {
            opts.onEvent?.({ type: "text_delta", data: { text: delta.text_delta, raw: event } })
          }
          if (delta?.thinking_delta) {
            opts.onEvent?.({ type: "thinking_delta", data: { text: delta.thinking_delta, raw: event } })
          }
          opts.onEvent?.({ type: "delta", data: event })
          break
        }
        case "tool_execution_start": {
          opts.onEvent?.({ type: "tool_start", data: event })
          // 捕获 workspace_write 参数
          const startEvt = event as { name?: string; params?: { path?: string; content?: string } }
          if (startEvt.name === "workspace_write" && startEvt.params?.path && startEvt.params?.content) {
            pendingWrite = { filePath: startEvt.params.path, content: startEvt.params.content }
          }
          break
        }
        case "tool_execution_update":
          opts.onEvent?.({ type: "tool_update", data: event })
          break
        case "tool_execution_end": {
          opts.onEvent?.({ type: "tool_end", data: event })
          // 记录 workspace_write 完成的文件
          const endEvt = event as { name?: string; ok?: boolean }
          if (endEvt.name === "workspace_write" && pendingWrite && endEvt.ok !== false) {
            piFileTracker.record(opts.projectId, pendingWrite.filePath, pendingWrite.content)
          }
          pendingWrite = null
          break
        }
      }
    })
  })

  // ── 9. Send prompt and wait ────────────────────────────────────
  try {
    await session.prompt(opts.prompt)
    await completionPromise
    return { ok: true, sessionFile: session.sessionFile }
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? String(e)
    log("pi", `Pi session failed: ${msg}`)
    return { ok: false, error: msg }
  } finally {
    // Always clean up
    if (timeoutId) clearTimeout(timeoutId)
    if (unsubEvents) unsubEvents()
    session.dispose()
  }
}
