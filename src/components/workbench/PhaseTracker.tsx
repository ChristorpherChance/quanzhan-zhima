"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { Clock, Zap, ChevronDown } from "lucide-react"

export type TrackerPhase =
  | "queued"
  | "thinking"
  | "tool_running"
  | "writing"
  | "reviewing"
  | "done"
  | "error"
  | "aborted"

export interface PhaseTrackerData {
  phase: TrackerPhase
  label: string
  tokenIn?: number
  tokenOut?: number
  elapsedMs: number
}

interface HeartbeatEntry {
  ts: number
  summary: string
}

export interface ProgressInfo {
  step: number
  total: number
  label?: string
}

interface PhaseTrackerProps {
  data: PhaseTrackerData | null
  heartbeats?: HeartbeatEntry[]
  progress?: ProgressInfo | null
  className?: string
}

const PHASES: { key: TrackerPhase; label: string }[] = [
  { key: "thinking", label: "思考" },
  { key: "tool_running", label: "工具" },
  { key: "writing", label: "写入" },
  { key: "reviewing", label: "审查" },
  { key: "done", label: "完成" },
]

const PHASE_ORDER: Record<string, number> = {
  queued: -1,
  thinking: 0,
  tool_running: 1,
  writing: 2,
  reviewing: 3,
  done: 4,
  error: -1,
  aborted: -1,
}

export function PhaseTracker({ data, heartbeats = [], progress, className }: PhaseTrackerProps) {
  const [expanded, setExpanded] = useState(false)
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const handleDoubleClick = useCallback(() => {
    setExpanded((p) => !p)
  }, [])

  // 点击外部关闭心跳日志
  useEffect(() => {
    if (!expanded) return
    const handler = (e: MouseEvent) => {
      if (expandedRef.current) {
        setExpanded(false)
      }
    }
    // 延迟绑定以避免双击时立即关闭
    const t = setTimeout(() => document.addEventListener("click", handler), 200)
    return () => {
      clearTimeout(t)
      document.removeEventListener("click", handler)
    }
  }, [expanded])

  if (!data) {
    return (
      <div className={cn("px-3 py-1.5 text-xs text-muted-foreground", className)}>
        等待任务...
      </div>
    )
  }

  const { phase, label, tokenIn = 0, tokenOut = 0, elapsedMs } = data
  const currentIdx = PHASE_ORDER[phase] ?? -1
  const isTerminal = phase === "done" || phase === "error" || phase === "aborted"
  const isActive = !isTerminal && phase !== "queued"

  const fmtTime = (ms: number) => {
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const rs = s % 60
    return `${m}m ${rs}s`
  }

  const fmtTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
    return String(n)
  }

  return (
    <div className={cn("relative", className)}>
      {/* 主条 */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-xs border-b transition-colors",
          phase === "error" && "bg-red-50 border-red-200",
          phase === "aborted" && "bg-red-50 border-red-200",
          phase === "done" && "bg-green-50 border-green-200",
          isActive && "bg-blue-50/50 border-blue-100",
          phase === "queued" && "bg-muted",
        )}
      >
        {/* 5 段步骤条 */}
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {PHASES.map((p, i) => {
            const isPassed = i < currentIdx
            const isCurrent = i === currentIdx
            const isFuture = i > currentIdx

            return (
              <div key={p.key} className="flex items-center gap-0.5 flex-1 min-w-0">
                {/* 连接线 */}
                {i > 0 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 min-w-[4px] rounded-full transition-colors",
                      isPassed && "bg-emerald-400",
                      isCurrent && "bg-blue-400",
                      isFuture && "bg-gray-200",
                    )}
                  />
                )}
                {/* 节点 */}
                <button
                  type="button"
                  className={cn(
                    "relative shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium transition-all select-none",
                    isPassed && "bg-emerald-500 text-white",
                    isCurrent && (isActive ? "bg-blue-500 text-white animate-pulse" : "bg-blue-500 text-white"),
                    isFuture && "bg-gray-100 text-gray-400",
                    phase === "error" && isCurrent && "bg-red-500 text-white animate-pulse",
                    phase === "aborted" && isCurrent && "bg-red-500 text-white",
                  )}
                  onDoubleClick={handleDoubleClick}
                  title={p.label}
                >
                  {isPassed ? "✓" : i + 1}
                </button>
              </div>
            )
          })}
        </div>

        {/* 右侧统计 */}
        <div className="flex items-center gap-2 shrink-0 text-[10px] text-muted-foreground">
          {(tokenIn > 0 || tokenOut > 0) && (
            <span className="flex items-center gap-0.5" title="Token 输入/输出">
              <Zap className="w-3 h-3" />
              {fmtTokens(tokenIn)}/{fmtTokens(tokenOut)}
            </span>
          )}
          <span className="flex items-center gap-0.5" title="已用时间">
            <Clock className="w-3 h-3" />
            {fmtTime(elapsedMs)}
          </span>
        </div>
      </div>

      {/* 进度条（当有 step/total 信息时） */}
      {progress && (
        <div className="px-3 py-1 border-b">
          <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
            <span>{progress.label ?? "进度"}</span>
            <span>{progress.step}/{progress.total}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-1">
            <div
              className="bg-primary h-1 rounded-full transition-all duration-300"
              style={{ width: `${(progress.step / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* 子标签 */}
      <div className="px-3 py-0.5 text-[10px] text-muted-foreground truncate">
        {phase === "error" ? (
          <span className="text-red-600">{label || "错误"}</span>
        ) : phase === "aborted" ? (
          <span className="text-red-600 font-medium">⏹ 已终止</span>
        ) : phase === "done" ? (
          <span className="text-emerald-600 font-medium">✅ 完成</span>
        ) : (
          <span className={cn(isActive && "animate-pulse")}>{label || PHASES[currentIdx]?.label}</span>
        )}
      </div>

      {/* 心跳日志下拉面板 */}
      {expanded && heartbeats.length > 0 && (
        <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          <div className="px-3 py-2 text-[10px] font-medium text-muted-foreground border-b flex items-center gap-1">
            最近操作
            <ChevronDown className="w-3 h-3" />
          </div>
          {heartbeats.slice(-10).reverse().map((h, i) => (
            <div
              key={i}
              className="px-3 py-1 text-[10px] text-muted-foreground border-b last:border-b-0 flex items-center gap-2"
            >
              <span className="shrink-0 text-[9px] text-muted-foreground/60">
                {new Date(h.ts).toLocaleTimeString()}
              </span>
              <span className="truncate">{h.summary}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
