"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CodeBrowser } from "@/components/workbench/CodeBrowser"
import { ExternalLink, RefreshCw, RotateCw, Terminal } from "lucide-react"

interface Props {
  projectId: string
  sandboxUrl: string | null
  logs?: string[]
  onRestart?: () => void
  onReinstall?: () => void
}

export function SandboxPanel({ projectId, sandboxUrl, logs = [], onRestart, onReinstall }: Props) {
  const [tab, setTab] = useState<"preview" | "code" | "logs">("preview")

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b">
        <div className="flex items-center gap-1">
          <Button
            variant={tab === "preview" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTab("preview")}
          >
            运行
          </Button>
          <Button
            variant={tab === "code" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setTab("code")}
          >
            代码
          </Button>
          <Button
            variant={tab === "logs" ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setTab("logs")}
          >
            <Terminal className="w-3 h-3" />
            日志
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {onRestart && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onRestart}>
              <RefreshCw className="w-3 h-3" />
              重启
            </Button>
          )}
          {onReinstall && (
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onReinstall}>
              <RotateCw className="w-3 h-3" />
              重装依赖
            </Button>
          )}
          {sandboxUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => window.open(sandboxUrl, "_blank")}
            >
              <ExternalLink className="w-3 h-3" />
              新标签
            </Button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {tab === "preview" && sandboxUrl && (
          <iframe src={sandboxUrl} className="w-full h-full border-0" title="Sandbox Preview" />
        )}
        {tab === "preview" && !sandboxUrl && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            沙箱未启动
          </div>
        )}
        {tab === "code" && <CodeBrowser projectId={projectId} sandboxUrl={sandboxUrl} />}
        {tab === "logs" && (
          <div className="overflow-auto p-3 font-mono text-xs bg-muted/30 h-full">
            {logs.length > 0 ? (
              logs.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith("✗") ? "text-red-600" : line.startsWith("✓") ? "text-green-600" : "text-muted-foreground"
                  }
                >
                  {line}
                </div>
              ))
            ) : (
              <span className="text-muted-foreground">暂无日志</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
