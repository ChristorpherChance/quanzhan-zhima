// PiSessionPool — 管理持久化 Pi AgentSession 的单例
// 替代原来一次性的 runPiSession()

import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
  type CreateAgentSessionResult,
  type AgentSession,
} from "@mariozechner/pi-coding-agent"
import type { ModelRegistry, AuthStorage, ToolDefinition } from "@mariozechner/pi-coding-agent"
import { getPiRegistry, resolvePiModelByKey } from "@/lib/pi/registry"
import { buildPiCustomTools } from "@/lib/pi/tools"
import { log } from "@/lib/log"

const PROVIDER_PI_NAME: Record<string, string> = {
  deepseek: "deepseek", anthropic: "anthropic", kimi: "moonshotai",
  xiaomi: "xiaomi", openai: "openai",
}
const PROVIDER_LLM_KEY: Record<string, string> = {
  deepseek: "deepseek", anthropic: "opus", kimi: "kimi",
  xiaomi: "xiaomi", openai: "gpt",
}

export interface SessionTreeNode {
  id: string
  label: string
  children: SessionTreeNode[]
  active: boolean
  messageCount: number
  createdAt: number
}

interface ActiveSession {
  session: AgentSession
  sessionManager: SessionManager
  workspaceDir: string
  projectId: string
  createdAt: number
  lastUsedAt: number
  dispose: () => void
}

class PiSessionPool {
  private sessions = new Map<string, ActiveSession>()
  private idleTimeoutMs = 30 * 60 * 1000 // 30 分钟空闲回收

  /** Composite key for per-agentType session isolation */
  private key(projectId: string, agentType?: string): string {
    return agentType ? `${projectId}:${agentType}` : projectId
  }

  async getOrCreate(opts: {
    projectId: string
    agentType?: string
    workspaceDir: string
    provider?: string
    modelId?: string
    systemPromptOverride?: string
  }): Promise<ActiveSession> {
    const sessionKey = this.key(opts.projectId, opts.agentType)
    const existing = this.sessions.get(sessionKey)
    if (existing) {
      existing.lastUsedAt = Date.now()
      return existing
    }

    const provider = opts.provider ?? "deepseek"
    await fs.mkdir(opts.workspaceDir, { recursive: true })

    const registry = getPiRegistry()
    const llmKey = PROVIDER_LLM_KEY[provider] ?? "deepseek"
    const piProvider = PROVIDER_PI_NAME[provider] ?? "deepseek"

    let model: ReturnType<ModelRegistry["find"]>
    if (opts.modelId) {
      model = registry.modelRegistry.find(piProvider, opts.modelId)
    } else {
      model = resolvePiModelByKey(llmKey as Parameters<typeof resolvePiModelByKey>[0])
    }
    if (!model) throw new Error(`Model not found: provider=${piProvider}`)

    const customTools = buildPiCustomTools({ workspaceDir: opts.workspaceDir })
    const sessionDir = path.join(opts.workspaceDir, ".pi-session")
    await fs.mkdir(sessionDir, { recursive: true })

    const settingsManager = SettingsManager.inMemory({
      defaultProvider: piProvider,
      defaultModel: model.id,
    })

    const sessionManager = SessionManager.create(opts.workspaceDir, sessionDir)
    const resourceLoader = new DefaultResourceLoader({
      cwd: opts.workspaceDir,
      agentDir: path.join(os.tmpdir(), "pi-agent", opts.projectId),
      settingsManager,
      noExtensions: true, noSkills: true, noPromptTemplates: true,
      noThemes: true, noContextFiles: true,
      systemPrompt: opts.systemPromptOverride,
    })

    await resourceLoader.reload()

    const result: CreateAgentSessionResult = await createAgentSession({
      cwd: opts.workspaceDir,
      authStorage: registry.authStorage,
      modelRegistry: registry.modelRegistry,
      model,
      customTools,
      resourceLoader,
      sessionManager,
      settingsManager,
    })

    const active: ActiveSession = {
      session: result.session,
      sessionManager,
      workspaceDir: opts.workspaceDir,
      projectId: opts.projectId,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      dispose: () => {
        result.session.dispose()
        this.sessions.delete(opts.projectId)
      },
    }

    this.sessions.set(sessionKey, active)
    log("pi", `PiSessionPool: created session for ${sessionKey}`)
    return active
  }

  get(projectId: string, agentType?: string): ActiveSession | undefined {
    const k = this.key(projectId, agentType)
    const s = this.sessions.get(k)
    if (s) s.lastUsedAt = Date.now()
    return s
  }

  dispose(projectId: string, agentType?: string) {
    const k = this.key(projectId, agentType)
    const s = this.sessions.get(k)
    if (s) {
      s.dispose()
      this.sessions.delete(k)
      log("pi", `PiSessionPool: disposed session ${k}`)
    }
  }

  disposeAll() {
    for (const [key, s] of this.sessions) {
      s.dispose()
      this.sessions.delete(key)
    }
  }

  startIdleCleanup() {
    setInterval(() => {
      const now = Date.now()
      for (const [key, s] of this.sessions) {
        if (now - s.lastUsedAt > this.idleTimeoutMs) {
          s.dispose()
          this.sessions.delete(key)
        }
      }
    }, 60_000).unref()
  }

  // ── 会话树操作 ──────────────────────────────────────────

  async getTree(projectId: string, agentType?: string): Promise<SessionTreeNode[]> {
    const active = this.get(projectId, agentType)
    if (!active) return []

    const rawTree = active.sessionManager.getTree()

    // Pi SDK SessionTreeNode has: entry (SessionEntry), children (SessionTreeNode[]), label?
    interface RawNode {
      entry: { id: string; parentId?: string | null; type?: string }
      children?: RawNode[]
      label?: string
      labelTimestamp?: string
    }

    const mapNode = (n: RawNode): SessionTreeNode => {
      const entryId = n.entry?.id ?? ""
      const timestamp = n.labelTimestamp ? new Date(n.labelTimestamp).getTime() : 0
      return {
        id: entryId,
        label: n.label ?? `节点 ${entryId.slice(0, 8)}`,
        children: (n.children ?? []).map(mapNode),
        active: active.sessionManager.getLeafId() === entryId,
        messageCount: 0,
        createdAt: timestamp,
      }
    }

    return rawTree.map(mapNode)
  }

  async compact(projectId: string, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    return active.session.compact()
  }

  async navigate(projectId: string, nodeId: string, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    return active.session.navigateTree(nodeId)
  }

  async fork(projectId: string, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    active.sessionManager.branch(active.sessionManager.getLeafId() ?? "")
  }

  // ── Steer / Follow-up ───────────────────────────────────

  async sendMessage(projectId: string, message: string, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    return active.session.prompt(message)
  }

  async steer(projectId: string, message: string, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    return active.session.steer(message)
  }

  async followUp(projectId: string, message: string, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    return active.session.followUp(message)
  }

  // ── 模型 / Thinking 切换 ─────────────────────────────────

  async setModel(projectId: string, model: ReturnType<ModelRegistry["find"]>, agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    if (!model) throw new Error("Model not found")
    return active.session.setModel(model)
  }

  async setThinkingLevel(projectId: string, level: "off" | "low" | "high", agentType?: string) {
    const active = this.get(projectId, agentType)
    if (!active) throw new Error("No active session")
    return active.session.setThinkingLevel(level)
  }

  /** List all session keys for a project */
  listProjectSessions(projectId: string): string[] {
    const prefix = `${projectId}:`
    return [...this.sessions.keys()].filter(k => k === projectId || k.startsWith(prefix))
  }
}

export const piSessionPool = new PiSessionPool()
