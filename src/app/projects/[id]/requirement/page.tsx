"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { ArtifactViewer } from "@/components/workbench/artifact-viewer"
import { AgentChat, type AgentChatHandle } from "@/components/workbench/agent-chat"
import { ThreePane } from "@/components/workbench/three-pane"
import { StageNav } from "@/components/workbench/stage-nav"
import { RequirementUploader } from "@/components/workbench/RequirementUploader"
import { Wand2 } from "lucide-react"

export default function RequirementPage() {
  const params = useParams()
  const pid = params.id as string
  const [prd, setPrd] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [project, setProject] = useState<{ currentStage: string; name: string } | null>(null)
  const [gates, setGates] = useState<Array<{ type: string; status: string }>>([])
  const [draftReady, setDraftReady] = useState(false)
  const chatRef = useRef<AgentChatHandle>(null)

  // Load project info and PRD on mount
  useEffect(() => {
    fetch(`/api/projects/${pid}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProject({ currentStage: data?.project?.currentStage ?? "requirement", name: data?.project?.name ?? "" })
        setGates(data?.gates ?? [])
      })
      .catch(() => {})

    fetch(`/api/projects/${pid}/artifacts/prd`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) setPrd(data.content)
      })
      .catch(() => {})
  }, [pid])

  // Reload PRD after job completes
  const reloadPrd = useCallback(() => {
    fetch(`/api/projects/${pid}/artifacts/prd`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) setPrd(data.content)
      })
      .catch(() => {})
  }, [pid])

  const handleClarify = useCallback(async () => {
    chatRef.current?.addUserMessage("需求澄清：请分析需求中的模糊点和遗漏点")
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${pid}/requirement/clarify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "澄清失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [pid])

  const handleAnswer = useCallback(async (text: string) => {
    setLoading(true)
    try {
      const answers: Record<string, string> = { "补充说明": text }
      const r = await fetch(`/api/projects/${pid}/requirement/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "生成失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [pid])

  const handleJobDone = useCallback(() => {
    setJobId(null)
    setDraftReady(true)
  }, [])

  const handleConfirmDraft = useCallback(() => {
    reloadPrd()
    setDraftReady(false)
    toast({ title: "内容已替换" })
  }, [reloadPrd])

  const handleDiscardDraft = useCallback(() => {
    setDraftReady(false)
    toast({ title: "已放弃替换" })
  }, [])

  const handleLock = async () => {
    try {
      const r = await fetch(`/api/projects/${pid}/stages/G1/complete`, { method: "POST" })
      if (!r.ok) {
        const { error } = await r.json()
        toast({ title: "锁定失败", description: error?.message ?? "", variant: "destructive" })
      } else {
        toast({ title: "PRD 已锁定", description: "进入设计阶段" })
        // Reload project to get updated gates
        const pr = await fetch(`/api/projects/${pid}`).then((r) => r.json())
        setGates(pr?.data?.gates ?? [])
        if (pr?.data?.project) {
          setProject({ currentStage: pr.data.project.currentStage, name: pr.data.project.name })
        }
      }
    } catch (e: unknown) {
      toast({ title: "锁定失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }

  const streamingUrl = jobId ? `/api/jobs/${jobId}/stream` : null

  const handleOneClick = () => {
    chatRef.current?.send("请帮我分析项目需求，生成完整的 PRD 文档，包含用户故事、功能需求、非功能需求和验收标准")
  }

  return (
    <ThreePane
      left={<StageNav currentStage={project?.currentStage ?? "requirement"} gates={gates} />}
      center={
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">需求分析</h2>
              {project?.name && (
                <p className="text-xs text-muted-foreground">{project.name}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleOneClick} disabled={loading} variant="default">
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                一键生成
              </Button>
              <Button variant="outline" size="sm" onClick={handleClarify} disabled={loading}>
                需求澄清
              </Button>
              <Button size="sm" onClick={handleLock} disabled={!prd}>
                完成需求阶段
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {/* 文档上传区域 */}
            <div className="px-4 pt-3">
              <RequirementUploader projectId={pid} />
            </div>
            {/* 草稿确认栏 */}
            {draftReady && (
              <div className="flex items-center justify-center gap-3 px-6 pt-3 pb-1">
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    AI 已生成新内容，是否替换当前 PRD？
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
            <ArtifactViewer content={prd} loading={loading} title="PRD 文档" />
          </div>
        </div>
      }
      right={
        <AgentChat
          ref={chatRef}
          title="需求 Agent"
          projectId={pid}
          jobId={jobId}
          streamingUrl={streamingUrl}
          onSend={handleAnswer}
          onDone={handleJobDone}
        />
      }
    />
  )
}
