"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { ArtifactViewer } from "@/components/workbench/artifact-viewer"
import { AgentChat, type AgentChatHandle } from "@/components/workbench/agent-chat"
import { ThreePane } from "@/components/workbench/three-pane"
import { StageNav } from "@/components/workbench/stage-nav"
import { Badge } from "@/components/ui/badge"
import { Wand2 } from "lucide-react"

export default function ReviewPage() {
  const params = useParams()
  const pid = params.id as string
  const [loading, setLoading] = useState(false)
  const [report, setReport] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [exportFormats, setExportFormats] = useState<string[]>(["md", "xlsx"])
  const [project, setProject] = useState<{ currentStage: string; name: string } | null>(null)
  const [gates, setGates] = useState<Array<{ type: string; status: string }>>([])
  const [draftReady, setDraftReady] = useState(false)
  const chatRef = useRef<AgentChatHandle>(null)

  // Load project info and existing review report on mount
  useEffect(() => {
    fetch(`/api/projects/${pid}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProject({ currentStage: data?.project?.currentStage ?? "review", name: data?.project?.name ?? "" })
        setGates(data?.gates ?? [])
      })
      .catch(() => {})

    fetch(`/api/projects/${pid}/artifacts/review-report`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) setReport(data.content)
      })
      .catch(() => {})
  }, [pid])

  const handleRun = async () => {
    chatRef.current?.addUserMessage("运行审查：对项目代码进行全面审查")
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${pid}/review/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: ["lint", "types", "audit"] }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "审查失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setLoading(false)
    }
  }

  const reloadReport = useCallback(() => {
    fetch(`/api/projects/${pid}/artifacts/review-report`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) setReport(data.content)
      })
      .catch(() => {})
  }, [pid])

  const handleJobDone = useCallback(() => {
    setJobId(null)
    setLoading(false)
    setDraftReady(true)
  }, [])

  const handleConfirmDraft = useCallback(() => {
    reloadReport()
    setDraftReady(false)
    toast({ title: "内容已替换" })
  }, [reloadReport])

  const handleDiscardDraft = useCallback(() => {
    setDraftReady(false)
    toast({ title: "已放弃替换" })
  }, [])

  const handleChatSend = useCallback(async (text: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${pid}/review/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severityFilter: ["P0", "P1"], instruction: text }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "处理失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setLoading(false)
    }
  }, [pid])

  const handleFix = async () => {
    chatRef.current?.addUserMessage("修复 P0/P1：自动修复高优先级问题")
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${pid}/review/fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severityFilter: ["P0", "P1"] }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "修复失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (exportFormats.length === 0) return
    try {
      const r = await fetch(`/api/projects/${pid}/exports/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: exportFormats }),
      })
      const { data } = await r.json()
      const files = data?.files ?? []
      for (const f of files) {
        if (f.downloadUrl) window.open(f.downloadUrl, "_blank")
      }
      if (files.length === 0) {
        toast({ title: "导出完成", description: "无文件生成" })
      }
    } catch (e: unknown) {
      toast({ title: "导出失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }

  const toggleFormat = (fmt: string) => {
    setExportFormats((prev) =>
      prev.includes(fmt) ? prev.filter((f) => f !== fmt) : [...prev, fmt],
    )
  }

  const streamingUrl = jobId ? `/api/jobs/${jobId}/stream` : null
  const ALL_FORMATS = ["md", "docx", "xlsx"]

  const handleOneClick = () => {
    chatRef.current?.send("请对项目代码进行全面审查，包括代码规范、类型安全、安全性、性能优化建议和最佳实践检查")
  }

  return (
    <ThreePane
      left={<StageNav currentStage={project?.currentStage ?? "review"} gates={gates} />}
      center={
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">审查</h2>
              {project?.name && (
                <p className="text-xs text-muted-foreground">{project.name}</p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              <Button size="sm" onClick={handleOneClick} disabled={loading} variant="default">
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                一键生成
              </Button>
              <Button size="sm" onClick={handleRun} disabled={loading}>
                运行审查
              </Button>
              <Button variant="outline" size="sm" onClick={handleFix}>
                修复 P0/P1
              </Button>
            </div>
          </div>

          {/* Export format selector */}
          <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
            <span className="text-xs text-muted-foreground">导出格式:</span>
            {ALL_FORMATS.map((fmt) => (
              <label key={fmt} className="flex items-center gap-1 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={exportFormats.includes(fmt)}
                  onChange={() => toggleFormat(fmt)}
                  className="rounded"
                />
                {fmt.toUpperCase()}
              </label>
            ))}
            <Button variant="ghost" size="sm" onClick={handleExport} disabled={exportFormats.length === 0}>
              导出
            </Button>
          </div>

          <div className="flex-1 overflow-auto">
            {/* 草稿确认栏 */}
            {draftReady && (
              <div className="flex items-center justify-center gap-3 px-6 pt-3 pb-1">
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    AI 已生成新内容，是否替换当前审查报告？
                  </span>
                  <Button size="sm" onClick={handleConfirmDraft} variant="default">
                    确认替换
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleDiscardDraft}>
                    放弃
                  </Button>
                </div>
              </div>
            )}
            <ArtifactViewer content={report} loading={loading} title="审查报告" />
          </div>
        </div>
      }
      right={
        <AgentChat
          ref={chatRef}
          title="审查 Agent"
          projectId={pid}
          jobId={jobId}
          streamingUrl={streamingUrl}
          onSend={handleChatSend}
          onDone={handleJobDone}
        />
      }
    />
  )
}
