"use client"

import { useState, useReducer, useCallback, useEffect, forwardRef, useImperativeHandle, Fragment } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { MarkdownView } from "@/components/markdown"
import { StreamingText } from "@/components/workbench/streaming-text"
import { ThinkingCard } from "@/components/workbench/thinking-card"
import { ToolCallCard } from "@/components/workbench/tool-call-card"
import { EnhancedInput } from "@/components/workbench/enhanced-input"
import { StreamingActions } from "@/components/workbench/streaming-actions"
import { useSSE } from "@/lib/use-sse"
import { cn } from "@/lib/utils"
import { Check, X, Bot, User as UserIcon, GitBranch, GitFork, ListTree, ChevronDown } from "lucide-react"
import type { SessionTreeNode } from "@/lib/pi/session-manager"

type BlockKind = "thinking" | "text" | "tool-call" | "error"

type ToolStatus = "pending" | "running" | "success" | "error"

interface MessageBlock {
  kind: BlockKind
  content: string
  toolName?: string
  ok?: boolean
  toolStatus?: ToolStatus
  toolArgs?: string
}

interface Message {
  id: number
  role: "user" | "assistant" | "system"
  blocks: MessageBlock[]
  collapsed: boolean
  timestamp: number
}

interface DraftInfo {
  type: string
  content: string
  baseVersion: number
}

type Action =
  | { type: "addUser"; text: string }
  | { type: "addAssistantBlock"; kind: BlockKind; content: string; toolName?: string; ok?: boolean; toolStatus?: ToolStatus; toolArgs?: string }
  | { type: "appendAssistantBlock"; kind: BlockKind; content: string; toolName?: string; ok?: boolean; toolStatus?: ToolStatus; toolArgs?: string }
  | { type: "finalizeAssistant" }
  | { type: "addSystem"; text: string }
  | { type: "clear" }
  | { type: "setStreaming"; streaming: boolean }
  | { type: "toggleCollapse"; id: number }
  | { type: "setDraft"; draft: DraftInfo | null }
  | { type: "setJobEnded"; ended: boolean }

interface State {
  messages: Message[]
  streaming: boolean
  draft: DraftInfo | null
  jobEnded: boolean
  currentAssistantId: number | null
}

let msgId = 0
function nextId() { return ++msgId }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "addUser": {
      const msg: Message = {
        id: nextId(),
        role: "user",
        blocks: [{ kind: "text", content: action.text }],
        collapsed: false,
        timestamp: Date.now(),
      }
      return { ...state, messages: [...state.messages, msg] }
    }
    case "addAssistantBlock": {
      const block: MessageBlock = {
        kind: action.kind,
        content: action.content,
        toolName: action.toolName,
        ok: action.ok,
        toolStatus: action.toolStatus,
        toolArgs: action.toolArgs,
      }
      if (state.currentAssistantId != null) {
        return {
          ...state,
          messages: state.messages.map((m) =>
            m.id === state.currentAssistantId
              ? { ...m, blocks: [...m.blocks, block] }
              : m,
          ),
        }
      }
      // 首次创建 assistant 消息
      const id = nextId()
      const msg: Message = {
        id,
        role: "assistant",
        blocks: [block],
        collapsed: false,
        timestamp: Date.now(),
      }
      return { ...state, messages: [...state.messages, msg], currentAssistantId: id }
    }
    case "appendAssistantBlock": {
      if (state.currentAssistantId == null) {
        // 还没有 assistant 消息，创建新的
        const block: MessageBlock = {
          kind: action.kind,
          content: action.content,
          toolName: action.toolName,
          ok: action.ok,
          toolStatus: action.toolStatus,
          toolArgs: action.toolArgs,
        }
        const id = nextId()
        const msg: Message = {
          id,
          role: "assistant",
          blocks: [block],
          collapsed: false,
          timestamp: Date.now(),
        }
        return { ...state, messages: [...state.messages, msg], currentAssistantId: id }
      }
      return {
        ...state,
        messages: state.messages.map((m) => {
          if (m.id !== state.currentAssistantId) return m
          const blocks = [...m.blocks]
          const last = blocks[blocks.length - 1]
          // 如果最后一个块是同类型，追加到该块
          if (last && last.kind === action.kind) {
            blocks[blocks.length - 1] = {
              ...last,
              content: last.content + action.content,
              ok: action.ok ?? last.ok,
              toolName: action.toolName ?? last.toolName,
            }
            return { ...m, blocks }
          }
          // 不同类型，创建新块
          return {
            ...m,
            blocks: [...blocks, {
              kind: action.kind,
              content: action.content,
              toolName: action.toolName,
              ok: action.ok,
              toolStatus: action.toolStatus,
              toolArgs: action.toolArgs,
            }],
          }
        }),
      }
    }
    case "finalizeAssistant":
      return { ...state, currentAssistantId: null }
    case "addSystem": {
      const msg: Message = {
        id: nextId(),
        role: "system",
        blocks: [{ kind: "text", content: action.text }],
        collapsed: false,
        timestamp: Date.now(),
      }
      return { ...state, messages: [...state.messages, msg] }
    }
    case "clear":
      return { messages: [], streaming: false, draft: null, jobEnded: false, currentAssistantId: null }
    case "setStreaming":
      return { ...state, streaming: action.streaming }
    case "toggleCollapse":
      return {
        ...state,
        messages: state.messages.map((m) =>
          m.id === action.id ? { ...m, collapsed: !m.collapsed } : m,
        ),
      }
    case "setDraft":
      return { ...state, draft: action.draft }
    case "setJobEnded":
      return { ...state, jobEnded: action.ended }
  }
}

const COLLAPSE_LENGTH = 500

export interface AgentChatHandle {
  send: (text: string) => void
  addUserMessage: (text: string) => void
}

interface AgentChatProps {
  title: string
  projectId?: string
  jobId: string | null
  streamingUrl: string | null
  onSend: (text: string) => Promise<void>
  onAction?: (action: string) => void
  onDone?: () => void
  onConfirmDraft?: (draft: DraftInfo) => Promise<void>
  onDiscardDraft?: (draft: DraftInfo) => void
  actions?: Array<{ label: string; key: string }>
  placeholder?: string
}

export const AgentChat = forwardRef<AgentChatHandle, AgentChatProps>(function AgentChat({
  title,
  projectId,
  jobId,
  streamingUrl,
  onSend,
  onAction,
  onDone,
  onConfirmDraft,
  onDiscardDraft,
  actions,
  placeholder = "输入指令...",
}, ref) {
  const [state, dispatch] = useReducer(reducer, {
    messages: [],
    streaming: false,
    draft: null,
    jobEnded: false,
    currentAssistantId: null,
  })
  const [input, setInput] = useState("")
  const onDoneRef = useCallback(() => onDone?.(), [onDone])

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    send: (text: string) => {
      dispatch({ type: "addUser", text })
      dispatch({ type: "setStreaming", streaming: true })
      dispatch({ type: "setJobEnded", ended: false })
      onSend(text).catch(() => {
        dispatch({ type: "setStreaming", streaming: false })
      })
    },
    addUserMessage: (text: string) => {
      dispatch({ type: "addUser", text })
    },
  }), [onSend])

  // 会话分支选择器状态
  const [sessionTree, setSessionTree] = useState<SessionTreeNode[]>([])
  const [showSessions, setShowSessions] = useState(false)

  const fetchSessionTree = useCallback(() => {
    if (!projectId) return
    fetch(`/api/projects/${projectId}/sessions/tree`)
      .then((r) => r.json())
      .then((d) => setSessionTree(d.tree ?? []))
      .catch(() => {})
  }, [projectId])

  useEffect(() => {
    fetchSessionTree()
    const interval = setInterval(fetchSessionTree, 30_000)
    return () => clearInterval(interval)
  }, [fetchSessionTree])

  const activeSession = sessionTree.find((n) => n.active) ?? sessionTree[0]

  const handleFork = async () => {
    if (!projectId) return
    try {
      await fetch(`/api/projects/${projectId}/sessions/fork`, { method: "POST" })
      fetchSessionTree()
    } catch { /* 静默 */ }
  }

  const handleCompact = async () => {
    if (!projectId) return
    try {
      await fetch(`/api/projects/${projectId}/sessions/compact`, { method: "POST" })
      fetchSessionTree()
    } catch { /* 静默 */ }
  }

  const handleNavigate = async (nodeId: string) => {
    if (!projectId) return
    try {
      await fetch(`/api/projects/${projectId}/sessions/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId }),
      })
      fetchSessionTree()
      setShowSessions(false)
    } catch { /* 静默 */ }
  }

  const renderSessionNode = (node: SessionTreeNode, depth: number) => {
    return (
      <Fragment key={node.id}>
        <button
          type="button"
          className={cn(
            "flex items-center gap-1.5 w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors",
            node.active && "bg-primary/10 font-medium border-l-2 border-l-primary",
            !node.active && "border-l-2 border-l-transparent",
          )}
          style={{ paddingLeft: `${depth * 14 + 12}px` }}
          onClick={() => handleNavigate(node.id)}
        >
          <span className="truncate flex-1">{node.label}</span>
          {node.messageCount > 0 && (
            <span className="text-[10px] text-muted-foreground shrink-0">{node.messageCount}</span>
          )}
          {node.active && (
            <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
          )}
        </button>
        {node.children.map((c) => renderSessionNode(c, depth + 1))}
      </Fragment>
    )
  }

  useSSE(streamingUrl, useCallback((event: string, raw: unknown) => {
    if (event === "progress") {
      const d = raw as { phase?: string; message?: string }
      dispatch({
        type: "addAssistantBlock",
        kind: "thinking",
        content: d.message ?? `${d.phase ?? "处理中"}...`,
      })
    } else if (event === "text_delta") {
      const d = raw as { text?: string }
      if (d.text) {
        dispatch({ type: "appendAssistantBlock", kind: "text", content: d.text })
      }
    } else if (event === "thinking_delta") {
      const d = raw as { text?: string }
      if (d.text) {
        dispatch({ type: "appendAssistantBlock", kind: "thinking", content: d.text })
      }
    } else if (event === "log" && typeof (raw as { line?: string })?.line === "string") {
      const line = (raw as { line: string }).line
      if (line.length > 100) {
        dispatch({ type: "addAssistantBlock", kind: "thinking", content: line })
      } else {
        dispatch({ type: "addAssistantBlock", kind: "text", content: line })
      }
    } else if (event === "result") {
      const d = raw as { filePath?: string; length?: number; content?: string }
      if (d.content) {
        dispatch({ type: "addAssistantBlock", kind: "text", content: d.content })
      }
      dispatch({ type: "addSystem", text: "✅ 任务完成" })
      dispatch({ type: "finalizeAssistant" })
      dispatch({ type: "setStreaming", streaming: false })
      dispatch({ type: "setJobEnded", ended: true })
      onDoneRef()
    } else if (event === "error") {
      const msg = (raw as { message?: string })?.message ?? "未知错误"
      dispatch({ type: "addAssistantBlock", kind: "error", content: msg })
      dispatch({ type: "addSystem", text: `❌ ${msg}` })
      dispatch({ type: "finalizeAssistant" })
      dispatch({ type: "setStreaming", streaming: false })
    } else if (event === "end") {
      dispatch({ type: "finalizeAssistant" })
      dispatch({ type: "setStreaming", streaming: false })
      onDoneRef()
    } else if (event === "tool_start") {
      const d = raw as { toolCallId?: string; name?: string; args?: unknown }
      dispatch({
        type: "addAssistantBlock",
        kind: "tool-call",
        content: "",
        toolName: d.name ?? "unknown",
        toolStatus: "pending",
        toolArgs: JSON.stringify(d.args ?? {}, null, 2),
      })
    } else if (event === "tool_update") {
      const d = raw as { name?: string; result?: unknown }
      dispatch({
        type: "appendAssistantBlock",
        kind: "tool-call",
        content: JSON.stringify(d.result ?? {}, null, 2),
        toolName: d.name,
        toolStatus: "running",
      })
    } else if (event === "tool_end") {
      const d = raw as { name?: string; ok?: boolean; result?: unknown }
      dispatch({
        type: "appendAssistantBlock",
        kind: "tool-call",
        content: JSON.stringify(d.result ?? {}, null, 2),
        toolName: d.name,
        ok: d.ok,
        toolStatus: d.ok !== false ? "success" : "error",
      })
    } else if (event === "tool-call") {
      const d = raw as { name?: string; ok?: boolean; args?: unknown; result?: unknown }
      dispatch({
        type: "addAssistantBlock",
        kind: "tool-call",
        content: JSON.stringify(d.args ?? d.result ?? {}, null, 2),
        toolName: d.name ?? "unknown",
        ok: d.ok,
        toolStatus: d.ok !== undefined ? (d.ok ? "success" : "error") : undefined,
        toolArgs: d.args ? JSON.stringify(d.args, null, 2) : undefined,
      })
    } else if (event === "draft") {
      const d = raw as DraftInfo
      dispatch({ type: "setDraft", draft: d })
      dispatch({
        type: "addAssistantBlock",
        kind: "text",
        content: d.content,
      })
    }
  }, [onDoneRef]))

  const handleSend = async () => {
    if (!input.trim()) return
    dispatch({ type: "addUser", text: input })
    dispatch({ type: "setStreaming", streaming: true })
    dispatch({ type: "setJobEnded", ended: false })
    const text = input
    setInput("")
    try {
      await onSend(text)
    } catch (e: unknown) {
      dispatch({
        type: "addSystem",
        text: `❌ ${String((e as Error)?.message ?? e)}`,
      })
      dispatch({ type: "setStreaming", streaming: false })
    }
  }

  const renderBlocks = (msg: Message) => {
    if (msg.role === "user") {
      return <p className="text-sm whitespace-pre-wrap break-words">{msg.blocks[0]?.content}</p>
    }

    // 判断这条消息是否仍在流式生成中
    const isStreaming = state.streaming && state.currentAssistantId === msg.id

    return msg.blocks.map((block, i) => {
      // 判断当前块是否是最后一个（流式追加目标）
      const isLast = i === msg.blocks.length - 1

      if (block.kind === "thinking") {
        return (
          <ThinkingCard
            key={i}
            content={block.content}
            streaming={isStreaming && isLast}
          />
        )
      }
      if (block.kind === "tool-call") {
        return (
          <ToolCallCard
            key={i}
            toolName={block.toolName ?? "unknown"}
            status={block.toolStatus ?? (block.ok === undefined ? "running" : block.ok ? "success" : "error")}
            args={block.toolArgs}
            result={block.content || undefined}
            defaultOpen={block.toolStatus === "running" || block.toolStatus === "pending"}
          />
        )
      }
      if (block.kind === "error") {
        return (
          <div key={i} className="text-xs text-red-600 bg-red-50 rounded p-2 my-1">
            {block.content}
          </div>
        )
      }
      // text block — 流式时使用 StreamingText，否则 Markdown
      const text = block.content
      const isLong = text.length > COLLAPSE_LENGTH
      const displayText = isLong && msg.collapsed ? text.slice(0, COLLAPSE_LENGTH) + "\n\n...(点击展开全部)" : text

      return (
        <div key={i}>
          {isStreaming && isLast ? (
            <StreamingText content={displayText} streaming />
          ) : (
            <MarkdownView content={displayText} />
          )}
          {isLong && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground mt-1"
              onClick={() => dispatch({ type: "toggleCollapse", id: msg.id })}
            >
              {msg.collapsed ? "展开全部" : "收起"}
            </Button>
          )}
        </div>
      )
    })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex flex-col border-b">
        {/* 标题栏 */}
        <div className="flex items-center justify-between p-3 pb-2">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            {title}
            {state.streaming && (
              <span className="thinking-dots">
                <span /><span /><span />
              </span>
            )}
          </h3>
          {jobId && state.streaming && (
            <Badge variant="secondary" className="animate-pulse">运行中</Badge>
          )}
        </div>

        {/* 会话分支选择器 */}
        {projectId && (
          <div className="px-3 pb-2 relative">
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded hover:bg-muted w-full"
                onClick={() => setShowSessions(!showSessions)}
              >
                <GitBranch className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate flex-1 text-left">
                  {activeSession?.label ?? "默认会话"}
                </span>
                <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform", showSessions && "rotate-180")} />
              </button>
              <button
                type="button"
                className="shrink-0 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                onClick={handleFork}
                title="分叉新会话"
              >
                <GitFork className="w-3 h-3" />
              </button>
              <button
                type="button"
                className="shrink-0 p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                onClick={handleCompact}
                title="压缩会话"
              >
                <ListTree className="w-3 h-3" />
              </button>
            </div>

            {/* 下拉会话列表 */}
            {showSessions && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSessions(false)} />
                <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-popover border rounded-md shadow-md max-h-64 overflow-y-auto">
                  {sessionTree.length === 0 && (
                    <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                      暂无会话分支
                    </div>
                  )}
                  {sessionTree.map((n) => renderSessionNode(n, 0))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <ScrollArea className="flex-1 p-3">
        <div className="space-y-3">
          {state.messages.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              在此与 Agent 对话。输入指令或回答问题。
            </p>
          )}
          {state.messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex gap-2",
                m.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {/* AI 头像 */}
              {m.role === "assistant" && (
                <div className="shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
              )}

              <div
                className={cn(
                  "rounded-lg px-3 py-2 max-w-[88%]",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : m.role === "system"
                      ? "bg-muted text-center w-full"
                      : "bg-muted",
                )}
              >
                {renderBlocks(m)}
              </div>

              {/* 用户头像 */}
              {m.role === "user" && (
                <div className="shrink-0 w-6 h-6 rounded-full bg-primary flex items-center justify-center mt-1">
                  <UserIcon className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {/* 草案确认/放弃按钮 */}
          {state.draft && state.jobEnded && onConfirmDraft && (
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="default" onClick={() => onConfirmDraft(state.draft!)}>
                <Check className="w-3.5 h-3.5 mr-1" /> 确认修改
              </Button>
              <Button size="sm" variant="outline" onClick={() => {
                dispatch({ type: "setDraft", draft: null })
                onDiscardDraft?.(state.draft!)
              }}>
                <X className="w-3.5 h-3.5 mr-1" /> 放弃修改
              </Button>
            </div>
          )}

          {state.streaming && !state.messages.some(m => m.role === "assistant") && (
            <Skeleton className="h-4 w-2/3" />
          )}
        </div>
      </ScrollArea>

      {actions && actions.length > 0 && (
        <div className="px-3 py-2 border-t flex flex-wrap gap-1">
          {actions.map((a) => (
            <Button
              key={a.key}
              variant="outline"
              size="sm"
              onClick={() => onAction?.(a.key)}
              disabled={state.streaming}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}

      {projectId && (
        <StreamingActions
          projectId={projectId}
          streaming={state.streaming}
        />
      )}

      <div className="p-3 border-t">
        <EnhancedInput
          value={input}
          onChange={setInput}
          onSend={handleSend}
          disabled={state.streaming}
          placeholder={placeholder}
        />
      </div>
    </div>
  )
})
