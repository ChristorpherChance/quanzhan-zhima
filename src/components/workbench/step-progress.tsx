"use client"

import { cn } from "@/lib/utils"
import { Check, Lock, SkipForward, Loader2, Circle } from "lucide-react"

export type StepStatus = "pending" | "generating" | "draft" | "locked" | "skipped"

interface StepDef {
  key: string
  label: string
}

interface StepProgressProps {
  steps: StepDef[]
  currentStep: number
  states: StepStatus[]
  onStepClick: (index: number) => void
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "locked":
      return <Lock className="w-4 h-4 text-green-500" />
    case "generating":
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
    case "draft":
      return <Check className="w-4 h-4 text-orange-500" />
    case "skipped":
      return <SkipForward className="w-4 h-4 text-muted-foreground" />
    default:
      return <Circle className="w-4 h-4 text-muted-foreground/40" />
  }
}

export function StepProgress({ steps, currentStep, states, onStepClick }: StepProgressProps) {
  return (
    <div className="flex items-center gap-1 px-4 py-3 border-b overflow-x-auto">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onStepClick(i)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
              i === currentStep
                ? "bg-primary text-primary-foreground"
                : states[i] === "locked"
                  ? "bg-green-50 text-green-700 border border-green-200"
                  : states[i] === "skipped"
                    ? "bg-muted text-muted-foreground line-through"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted",
            )}
          >
            <StepIcon status={states[i]} />
            <span>{step.label}</span>
          </button>
          {i < steps.length - 1 && (
            <span className="text-muted-foreground/30 text-xs">→</span>
          )}
        </div>
      ))}
    </div>
  )
}
