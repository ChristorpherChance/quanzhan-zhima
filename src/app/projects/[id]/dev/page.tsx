"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { AgentChat, type AgentChatHandle } from "@/components/workbench/agent-chat"
import { ThreePane } from "@/components/workbench/three-pane"
import { StageNav } from "@/components/workbench/stage-nav"
import { CodeBrowser } from "@/components/workbench/CodeBrowser"
import { SandboxPanel } from "@/components/workbench/SandboxPanel"
import { Wand2, Code, Play } from "lucide-react"

export default function DevPage() {
  const params = useParams()
  const pid = params.id as string
  const [loading, setLoading] = useState(false)
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [stage, setStage] = useState<"idle" | "generating" | "sandbox-starting" | "ready">("idle")
  const [viewMode, setViewMode] = useState<"code" | "run">("run")
  const [project, setProject] = useState<{ currentStage: string; name: string } | null>(null)
  const [gates, setGates] = useState<Array<{ type: string; status: string }>>([])
  const [sandboxLogs, setSandboxLogs] = useState<string[]>([])
  const chatRef = useRef<AgentChatHandle>(null)

  useEffect(() => {
    fetch(`/api/projects/${pid}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProject({ currentStage: data?.project?.currentStage ?? "dev", name: data?.project?.name ?? "" })
        setGates(data?.gates ?? [])
      })
      .catch(() => {})
  }, [pid])

  const handleRun = async () => {
    chatRef.current?.addUserMessage("一键 Run：启动代码生成和沙箱")
    setLoading(true)
    setStage("generating")
    try {
      const r = await fetch(`/api/projects/${pid}/dev/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "代码生成失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setLoading(false)
      setStage("idle")
    }
  }

  const handleJobDone = useCallback(async () => {
    setStage("sandbox-starting")
    setJobId(null)
    try {
      const sr = await fetch(`/api/projects/${pid}/dev/sandbox/run`, { method: "POST" })
      const sd = await sr.json()
      if (sd.data?.url) {
        setSandboxUrl(sd.data.url)
        setSandboxLogs(sd.data?.logs ?? [])
        setStage("ready")
        toast({ title: "沙箱已启动" })
      } else {
        setSandboxLogs(sd.data?.logs ?? [String(sd.data?.error ?? "未知错误")])
        toast({ title: "沙箱启动失败", description: "查看日志了解详情", variant: "destructive" })
        setStage("idle")
      }
    } catch (e: unknown) {
      toast({ title: "沙箱启动失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setStage("idle")
    } finally {
      setLoading(false)
    }
  }, [pid])

  const handleRestartSandbox = async () => {
    setStage("sandbox-starting")
    try {
      // stop first
      await fetch(`/api/projects/${pid}/dev/sandbox/stop`, { method: "POST" })
      // then restart
      const sr = await fetch(`/api/projects/${pid}/dev/sandbox/run`, { method: "POST" })
      const sd = await sr.json()
      if (sd.data?.url) {
        setSandboxUrl(sd.data.url)
        setSandboxLogs(sd.data?.logs ?? [])
        setStage("ready")
      } else {
        setSandboxLogs(sd.data?.logs ?? [])
        setStage("idle")
      }
    } catch (e: unknown) {
      toast({ title: "重启失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setStage("idle")
    }
  }

  const handleChatSend = useCallback(async (text: string) => {
    setLoading(true)
    setStage("generating")
    try {
      const r = await fetch(`/api/projects/${pid}/dev/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "执行失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setLoading(false)
      setStage("idle")
    }
  }, [pid])

  const handleStop = async () => {
    await fetch(`/api/projects/${pid}/dev/sandbox/stop`, { method: "POST" })
    setSandboxUrl(null)
    setSandboxLogs([])
    setStage("idle")
  }

  const handleExport = async () => {
    try {
      const r = await fetch(`/api/projects/${pid}/exports/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: ["zip"] }),
      })
      const { data } = await r.json()
      if (data?.files?.[0]?.downloadUrl) {
        window.open(data.files[0].downloadUrl, "_blank")
      }
    } catch (e: unknown) {
      toast({ title: "导出失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }

  const handleLockG3 = async () => {
    try {
      const r = await fetch(`/api/projects/${pid}/stages/G3/complete`, { method: "POST" })
      if (!r.ok) {
        const { error } = await r.json()
        toast({ title: "G3 锁定失败", description: error?.message ?? "", variant: "destructive" })
      } else {
        toast({ title: "开发阶段已锁定" })
        const pr = await fetch(`/api/projects/${pid}`).then((r) => r.json())
        setGates(pr?.data?.gates ?? [])
      }
    } catch (e: unknown) {
      toast({ title: "锁定失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }

  const streamingUrl = jobId ? `/api/jobs/${jobId}/stream` : null

  const handleOneClick = () => {
    chatRef.current?.send("请根据设计文档，完整生成项目代码，包含前端页面、后端API、数据库模型和配置文件")
  }

  return (
    <ThreePane
      left={<StageNav currentStage={project?.currentStage ?? "dev"} gates={gates} />}
      center={
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">开发</h2>
              {project?.name && (
                <p className="text-xs text-muted-foreground">{project.name}</p>
              )}
            </div>
            <div className="flex gap-2 items-center">
              {stage !== "idle" && (
                <Badge variant="secondary" className="animate-pulse">
                  {stage === "generating" ? "代码生成中..." : stage === "sandbox-starting" ? "沙箱启动中..." : "运行中"}
                </Badge>
              )}
              <Button size="sm" onClick={handleOneClick} disabled={loading} variant="default">
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                一键生成
              </Button>
              <Button size="sm" onClick={handleRun} disabled={loading || stage !== "idle"}>
                {stage === "generating" ? "生成中..." : stage === "sandbox-starting" ? "启动中..." : "一键 Run"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleStop} disabled={!sandboxUrl}>
                停止
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                导出 zip
              </Button>
              <Button variant="outline" size="sm" onClick={handleLockG3}>
                完成开发阶段
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            {stage === "ready" && sandboxUrl ? (
              <div className="flex flex-col h-full">
                {/* J4: 运行/代码 顶层 Tab */}
                <div className="flex items-center gap-1 px-3 py-1 border-b">
                  <Button
                    variant={viewMode === "run" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setViewMode("run")}
                  >
                    <Play className="w-3 h-3" />
                    运行
                  </Button>
                  <Button
                    variant={viewMode === "code" ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => setViewMode("code")}
                  >
                    <Code className="w-3 h-3" />
                    代码
                  </Button>
                </div>
                <div className="flex-1 min-h-0">
                  {viewMode === "run" ? (
                    <SandboxPanel
                      projectId={pid}
                      sandboxUrl={sandboxUrl}
                      logs={sandboxLogs}
                      onRestart={handleRestartSandbox}
                    />
                  ) : (
                    <CodeBrowser projectId={pid} sandboxUrl={sandboxUrl} />
                  )}
                </div>
              </div>
            ) : stage === "generating" ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <p>AI 正在生成代码...</p>
                <p className="text-xs">可在右侧面板查看进度日志</p>
              </div>
            ) : stage === "sandbox-starting" ? (
              <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                <p>正在启动沙箱环境...</p>
                <p className="text-xs">执行 install → build → start</p>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                点击「一键 Run」启动开发沙箱
              </div>
            )}
          </div>
        </div>
      }
      right={
        <AgentChat
          ref={chatRef}
          title="开发 Agent"
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
