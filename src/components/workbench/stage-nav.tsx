"use client"

import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STAGES = [
  { key: "requirement", label: "需求", icon: "📋" },
  { key: "design", label: "设计", icon: "🎨" },
  { key: "dev", label: "开发", icon: "⚡" },
  { key: "review", label: "审查", icon: "🔍" },
  { key: "exports", label: "导出", icon: "📦" },
  { key: "docs", label: "文档", icon: "📄" },
]

const GATE_FOR_STAGE: Record<string, string> = {
  requirement: "G1",
  design: "G2",
  dev: "G3",
}

interface StageNavProps {
  currentStage: string
  gates?: Array<{ type: string; status: string }>
}

export function StageNav({ currentStage, gates = [] }: StageNavProps) {
  const params = useParams()
  const pathname = usePathname()

  return (
    <nav className="p-3 space-y-1">
      <div className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
        阶段导航
      </div>
      {STAGES.map((stage) => {
        const href = `/projects/${params.id}/${stage.key}`
        const isActive = pathname.startsWith(href)
        const gateKey = GATE_FOR_STAGE[stage.key]
        const gate = gates.find((g) => g.type === gateKey)

        return (
          <Link
            key={stage.key}
            href={href}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
              isActive
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
              currentStage === stage.key && "border-l-2 border-primary",
            )}
          >
            <span>{stage.icon}</span>
            <span className="flex-1">{stage.label}</span>
            {gate && (
              <Badge variant={gate.status === "locked" ? "default" : gate.status === "reopened" ? "destructive" : "secondary"}>
                {gate.status === "locked" ? "✓" : "○"}
              </Badge>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
