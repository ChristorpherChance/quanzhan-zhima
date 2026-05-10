"use client"

import { Check, X, Loader2, Clock, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"

export interface DesignStepProgress {
  key: string
  label: string
  status: "pending" | "running" | "done" | "failed"
  elapsedMs?: number
  error?: string
}

interface Props {
  steps: DesignStepProgress[]
  totalMs?: number
  summary?: string
  onRetry?: (stepKey: string) => void
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function stepStatusClass(status: string) {
  return cn(
    "flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs transition-colors",
    status === "running" && "bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800",
    status === "failed" && "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800",
    status === "done" && "bg-green-50/50 dark:bg-green-950/30",
  )
}

function stepNumClass(status: string) {
  return cn(
    "w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0",
    status === "done" && "bg-green-500 text-white border-green-500",
    status === "failed" && "bg-red-500 text-white border-red-500",
    status === "running" && "bg-blue-500 text-white border-blue-500",
    status === "pending" && "border-muted-foreground/30 text-muted-foreground",
  )
}

function stepLabelClass(status: string) {
  return cn(
    "flex-1 font-medium",
    status === "running" && "text-blue-700 dark:text-blue-300",
    status === "failed" && "text-red-700 dark:text-red-300",
    status === "done" && "text-green-700 dark:text-green-300",
    status === "pending" && "text-muted-foreground",
  )
}

export function DesignProgressPanel({ steps, totalMs, summary, onRetry }: Props) {
  const hasRunning = steps.some((s) => s.status === "running")

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        {hasRunning ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <span>{summary ?? "全部完成"}</span>
        )}
        {totalMs != null && (
          <span className="text-xs text-muted-foreground">
            总耗时: {formatElapsed(totalMs)}
          </span>
        )}
      </div>

      <div className="space-y-1">
        {steps.map((step, idx) => (
          <div key={step.key} className={stepStatusClass(step.status)}>
            <span className={stepNumClass(step.status)}>
              {step.status === "done" ? (
                <Check className="w-3 h-3" />
              ) : step.status === "failed" ? (
                <X className="w-3 h-3" />
              ) : step.status === "running" ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                idx + 1
              )}
            </span>

            <span className={stepLabelClass(step.status)}>
              {step.label}
            </span>

            {step.status === "done" && step.elapsedMs != null && (
              <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <Clock className="w-3 h-3" />
                {formatElapsed(step.elapsedMs)}
              </span>
            )}
            {step.status === "failed" && step.error && (
              <span className="text-red-600 dark:text-red-400 truncate max-w-[120px]" title={step.error}>
                {step.error}
              </span>
            )}
            {step.status === "failed" && onRetry && (
              <button
                type="button"
                className="ml-auto p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                title="重试此步"
                onClick={() => onRetry(step.key)}
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {step.status === "running" && (
              <span className="text-blue-600 dark:text-blue-400 animate-pulse text-[10px]">
                生成中...
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

const DESIGN_STEP_DEFS = [
  { key: "summary", label: "概要设计" },
  { key: "detail", label: "详细设计" },
  { key: "api", label: "接口设计" },
  { key: "db", label: "数据库设计" },
  { key: "ui", label: "UI原型" },
]

export function createInitialSteps(): DesignStepProgress[] {
  return DESIGN_STEP_DEFS.map((s) => ({ key: s.key, label: s.label, status: "pending" as const }))
}
