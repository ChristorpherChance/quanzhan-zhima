"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/toast"
import { Lock, LockOpen, ChevronRight, Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface GateInfo {
  type: string
  status: string
  mode: string
  confidence: number | null
}

interface StageBarProps {
  projectId: string
  currentStage: string
  gates: GateInfo[]
  className?: string
}

const GATE_SEQUENCE = ["G0", "G1", "G2", "G3", "G4", "G5", "G6"]
const GATE_LABELS: Record<string, string> = {
  G0: "立项", G1: "需求", G2: "设计", G3: "开发", G4: "审查", G5: "导出", G6: "交付",
}

export function StageBar({ projectId, currentStage, gates, className }: StageBarProps) {
  const [loading, setLoading] = useState<string | null>(null)
  const [gateMap, setGateMap] = useState<Record<string, GateInfo>>({})

  useEffect(() => {
    const map: Record<string, GateInfo> = {}
    for (const g of gates) map[g.type] = g
    setGateMap(map)
  }, [gates])

  const handleLock = useCallback(async (gate: string) => {
    setLoading(gate)
    try {
      const r = await fetch(`/api/projects/${projectId}/gates/${gate}/lock`, { method: "POST" })
      if (!r.ok) {
        const { error } = await r.json()
        const reasons = error?.reasons as string[] | undefined
        toast({
          title: `${GATE_LABELS[gate]} 锁定失败`,
          description: reasons?.join("; ") ?? "条件未满足",
          variant: "destructive",
        })
      } else {
        toast({ title: `${GATE_LABELS[gate]} 已锁定` })
        window.location.reload()
      }
    } catch (e: unknown) {
      toast({ title: "锁定失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }, [projectId])

  const handleReopen = useCallback(async (gate: string) => {
    setLoading(gate)
    try {
      await fetch(`/api/projects/${projectId}/gates/${gate}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "手动重开" }),
      })
      toast({ title: `${GATE_LABELS[gate]} 已重开` })
      window.location.reload()
    } catch (e: unknown) {
      toast({ title: "重开失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }, [projectId])

  const handleAutoEvaluate = useCallback(async () => {
    setLoading("auto")
    try {
      const r = await fetch(`/api/projects/${projectId}/gates/auto-evaluate`, { method: "POST" })
      const d = await r.json()
      if (d.locked) {
        toast({ title: "自动通关成功" })
      } else {
        toast({ title: "条件未满足", description: d.reasons?.join("; "), variant: "destructive" })
      }
      window.location.reload()
    } catch (e: unknown) {
      toast({ title: "自动评估失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(null)
    }
  }, [projectId])

  // 找到当前应锁定的关卡
  const stageToGate: Record<string, string> = {
    requirement: "G0",
    design: "G1",
    dev: "G2",
    review: "G3",
    export: "G4",
    done: "G5",
  }
  const currentGateIdx = GATE_SEQUENCE.indexOf(stageToGate[currentStage] ?? "G1")

  return (
    <div className={cn("flex items-center gap-2 px-4 py-2 bg-muted/50 border-t", className)}>
      {/* 6 段进度条 */}
      <div className="flex items-center gap-0.5 flex-1">
        {GATE_SEQUENCE.slice(0, 6).map((gate, idx) => {
          const info = gateMap[gate]
          const locked = info?.status === "locked"
          const isCurrent = idx === currentGateIdx
          return (
            <div key={gate} className="flex items-center">
              <div
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors",
                  locked && "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                  isCurrent && !locked && "bg-primary/10 text-primary ring-1 ring-primary",
                  !isCurrent && !locked && "bg-muted text-muted-foreground",
                )}
              >
                {locked ? <Check className="w-3 h-3" /> : <span className="w-3 h-3 flex items-center justify-center text-[10px]">{idx}</span>}
                <span className="hidden sm:inline">{GATE_LABELS[gate]}</span>
              </div>
              {idx < 5 && <ChevronRight className="w-3 h-3 text-muted-foreground/50 mx-0.5" />}
            </div>
          )
        })}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1 shrink-0">
        {GATE_SEQUENCE.map((gate) => {
          const info = gateMap[gate]
          if (!info) return null
          const isLocked = info.status === "locked"
          const gIdx = GATE_SEQUENCE.indexOf(gate)

          // 只有当前/上一个未锁的关卡才显示可操作
          if (gIdx > currentGateIdx + 1) return null

          if (isLocked) {
            return (
              <Button
                key={gate}
                variant="ghost"
                size="sm"
                onClick={() => handleReopen(gate)}
                disabled={loading === gate}
                className="text-xs"
              >
                <LockOpen className="w-3 h-3 mr-1" />
                重开 {GATE_LABELS[gate]}
              </Button>
            )
          }
          if (gIdx <= currentGateIdx) {
            return (
              <Button
                key={gate}
                variant="default"
                size="sm"
                onClick={() => handleLock(gate)}
                disabled={loading === gate}
                className="text-xs"
              >
                <Lock className="w-3 h-3 mr-1" />
                {loading === gate ? "..." : `锁定 ${GATE_LABELS[gate]}`}
              </Button>
            )
          }
          return null
        })}
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoEvaluate}
          disabled={loading === "auto"}
          className="text-xs"
        >
          自动评估
        </Button>
      </div>
    </div>
  )
}
