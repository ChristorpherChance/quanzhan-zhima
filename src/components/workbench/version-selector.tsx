"use client"

import { useState, useEffect } from "react"
import { ChevronDown, Lock } from "lucide-react"
import { cn } from "@/lib/utils"

interface VersionInfo {
  id: string
  version: number
  locked: boolean
  createdAt: string
  lockedAt: string | null
}

interface VersionSelectorProps {
  projectId: string
  artifactType: string
  currentVersion: number
  onVersionChange: (version: number) => void
}

export function VersionSelector({
  projectId,
  artifactType,
  currentVersion,
  onVersionChange,
}: VersionSelectorProps) {
  const [versions, setVersions] = useState<VersionInfo[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/artifacts/${artifactType}/versions`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.versions) setVersions(data.versions)
      })
      .catch(() => {})
  }, [projectId, artifactType])

  if (versions.length <= 1) return null

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border bg-background"
      >
        <span>v{currentVersion}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-background border rounded-md shadow-lg min-w-[200px]">
          <div className="p-1.5 text-xs text-muted-foreground border-b">历史版本</div>
          {versions.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onVersionChange(v.version)
                setOpen(false)
              }}
              className={cn(
                "w-full text-left px-3 py-2 text-xs hover:bg-muted flex items-center justify-between gap-2",
                v.version === currentVersion && "bg-muted font-medium",
              )}
            >
              <span>
                v{v.version} — {new Date(v.createdAt).toLocaleDateString("zh-CN")}
              </span>
              {v.locked && <Lock className="w-3 h-3 text-green-500 shrink-0" />}
            </button>
          ))}
        </div>
      )}
      {/* 点击外部关闭 */}
      {open && (
        <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
      )}
    </div>
  )
}
