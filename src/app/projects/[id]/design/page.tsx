"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Badge } from "@/components/ui/badge"
import { ArtifactViewer } from "@/components/workbench/artifact-viewer"
import { AgentChat, type AgentChatHandle } from "@/components/workbench/agent-chat"
import { ThreePane } from "@/components/workbench/three-pane"
import { StageNav } from "@/components/workbench/stage-nav"
import { StepProgress, type StepStatus } from "@/components/workbench/step-progress"
import { DesignProgressPanel, createInitialSteps, type DesignStepProgress } from "@/components/workbench/DesignProgressPanel"
import { FileUpload } from "@/components/workbench/file-upload"
import { Wand2, SkipForward, Lock, Check } from "lucide-react"

const DESIGN_STEPS = [
  { key: "summary", label: "概要设计", artifactType: "design-summary" as const },
  { key: "detail", label: "详细设计", artifactType: "design-detail" as const },
  { key: "api", label: "接口设计", artifactType: "design-api" as const },
  { key: "db", label: "数据库设计", artifactType: "design-db" as const },
  { key: "ui", label: "UI原型", artifactType: "design-ui" as const },
]

const PRESET_INSTRUCTIONS: Record<string, string> = {
  summary: "基于已锁定的 PRD 生成概要设计方案，包含整体架构、关键决策、风险点和模块分解",
  api: "基于概要设计生成 RESTful API 接口定义，包含请求/响应示例和错误码",
  db: "基于概要设计和 API 设计生成数据库 Schema，包含 Mermaid ER 图和 SQLite DDL",
  detail: "基于概要设计、API 设计和数据库设计，针对 PRD 中每个 AC 给出实现方案",
  ui: `生成一个完整的多页面交互原型（单文件 HTML），要求：
1. 使用 Tailwind CSS CDN (https://cdn.tailwindcss.com)
2. 使用 <!-- page: 页面名称 --> 分隔不同页面
3. 每个页面必须包含完整的 UI 布局、表单、按钮等交互元素
4. 使用 Alpine.js CDN 或原生 JS 实现页面内的交互效果（如弹窗、Tab切换、表单验证、数据过滤、分页等）
5. 页面之间支持导航切换
6. 包含模拟数据让原型看起来真实
7. 确保可在 iframe 中预览`,
}

export default function DesignPage() {
  const params = useParams()
  const pid = params.id as string
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStates, setStepStates] = useState<StepStatus[]>([
    "pending", "pending", "pending", "pending", "pending",
  ])
  const [contents, setContents] = useState<Record<string, string | null>>({})
  const [artifactVersions, setArtifactVersions] = useState<Record<string, number>>({})
  const [jobId, setJobId] = useState<string | null>(null)
  const [project, setProject] = useState<{ currentStage: string; name: string } | null>(null)
  const [gates, setGates] = useState<Array<{ type: string; status: string }>>([])
  const [draftReady, setDraftReady] = useState(false)
  const [designAllSteps, setDesignAllSteps] = useState<DesignStepProgress[]>(createInitialSteps())
  const [designAllTotalMs, setDesignAllTotalMs] = useState<number | undefined>()
  const [shellBuffer, setShellBuffer] = useState("")
  const [pageBuffers, setPageBuffers] = useState<Record<string, string>>({})
  const [previewHtml, setPreviewHtml] = useState("")
  const previewThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chatRef = useRef<AgentChatHandle>(null)
  const autoChainRef = useRef(false)
  const autoChainStepRef = useRef(0)

  // Load project info and all artifacts on mount
  useEffect(() => {
    fetch(`/api/projects/${pid}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProject({ currentStage: data?.project?.currentStage ?? "design", name: data?.project?.name ?? "" })
        setGates(data?.gates ?? [])
      })
      .catch(() => {})

    for (const s of DESIGN_STEPS) {
      fetch(`/api/projects/${pid}/artifacts/${s.artifactType}`)
        .then((r) => r.json())
        .then(({ data }) => {
          if (data?.content) {
            setContents((prev) => ({ ...prev, [s.key]: data.content }))
            setArtifactVersions((prev) => ({ ...prev, [s.key]: data.version ?? 1 }))
            // 恢复步骤状态
            setStepStates((prev) => {
              const next = [...prev]
              const idx = DESIGN_STEPS.findIndex((st) => st.key === s.key)
              if (idx >= 0 && data.locked) {
                next[idx] = "locked"
              } else if (idx >= 0 && data.content) {
                next[idx] = "draft"
              }
              return next
            })
          }
        })
        .catch(() => {})
    }
  }, [pid])

  const reloadArtifact = useCallback((stepKey: string) => {
    const s = DESIGN_STEPS.find((st) => st.key === stepKey)
    if (!s) return
    fetch(`/api/projects/${pid}/artifacts/${s.artifactType}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) {
          setContents((prev) => ({ ...prev, [stepKey]: data.content }))
          setArtifactVersions((prev) => ({ ...prev, [stepKey]: data.version ?? 1 }))
        }
      })
      .catch(() => {})
  }, [pid])

  // 自动生成下一个步骤（一键生成串行模式用）
  const autoGenerateNext = useCallback(async (stepIdx: number) => {
    if (stepIdx >= 4) {
      autoChainRef.current = false
      toast({ title: "全部设计步骤已完成" })
      return
    }
    const nextIdx = stepIdx + 1
    autoChainStepRef.current = nextIdx
    setCurrentStep(nextIdx)
    const nextS = DESIGN_STEPS[nextIdx]
    chatRef.current?.addUserMessage(`生成${nextS.label}：${PRESET_INSTRUCTIONS[nextS.key]}`)
    setStepStates((prev) => {
      const next = [...prev]
      next[nextIdx] = "generating"
      return next
    })
    try {
      const gr = await fetch(`/api/projects/${pid}/design/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtype: nextS.key }),
      })
      const gd = await gr.json()
      setJobId(gd.data.jobId)
    } catch (e: unknown) {
      toast({ title: "自动生成失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      autoChainRef.current = false
    }
  }, [pid])

  const handleJobDone = useCallback(() => {
    setJobId(null)

    if (autoChainRef.current) {
      autoChainRef.current = false
      // 一键生成模式：根据 designAllSteps 状态汇总结果
      let okCount = 0
      for (const s of DESIGN_STEPS) {
        const ps = designAllSteps.find((d) => d.key === s.key)
        if (ps?.status === "done") okCount++
        // 加载产物内容
        fetch(`/api/projects/${pid}/artifacts/${s.artifactType}`)
          .then((r) => r.json())
          .then(({ data }) => {
            if (data?.content) {
              setContents((prev) => ({ ...prev, [s.key]: data.content }))
              setArtifactVersions((prev) => ({ ...prev, [s.key]: data.version ?? 1 }))
            }
          })
          .catch(() => {})
      }
      setStepStates((prev) => {
        const next = [...prev]
        for (let i = 0; i < DESIGN_STEPS.length; i++) {
          const ps = designAllSteps.find((d) => d.key === DESIGN_STEPS[i].key)
          next[i] = ps?.status === "done" ? "locked" : ps?.status === "failed" ? "pending" : "draft"
        }
        return next
      })
      toast({ title: `一键生成完成: ${okCount}/${DESIGN_STEPS.length} 成功` })
    } else {
      setDraftReady(true)
      setStepStates((prev) => {
        const next = [...prev]
        if (next[currentStep] !== "locked") next[currentStep] = "draft"
        return next
      })
    }
  }, [currentStep, pid, designAllSteps])

  const handleConfirmDraft = useCallback(() => {
    const stepKey = DESIGN_STEPS[currentStep].key
    reloadArtifact(stepKey)
    setDraftReady(false)
    toast({ title: "内容已替换" })
  }, [currentStep, reloadArtifact])

  const handleDiscardDraft = useCallback(() => {
    setDraftReady(false)
    toast({ title: "已放弃替换" })
  }, [])

  const handleGenerate = async (stepKey: string) => {
    const s = DESIGN_STEPS.find((st) => st.key === stepKey)
    if (!s) return
    chatRef.current?.addUserMessage(`生成${s.label}：${PRESET_INSTRUCTIONS[stepKey]}`)
    setStepStates((prev) => {
      const next = [...prev]
      next[currentStep] = "generating"
      return next
    })
    try {
      const r = await fetch(`/api/projects/${pid}/design/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtype: s.key }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "生成失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
      setStepStates((prev) => {
        const next = [...prev]
        next[currentStep] = "pending"
        return next
      })
    }
  }

  const handleChatSend = useCallback(async (text: string) => {
    const s = DESIGN_STEPS[currentStep]
    setStepStates((prev) => {
      const next = [...prev]
      next[currentStep] = "generating"
      return next
    })
    try {
      const r = await fetch(`/api/projects/${pid}/design/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subtype: s.key, instruction: text }),
      })
      const { data } = await r.json()
      setJobId(data.jobId)
    } catch (e: unknown) {
      toast({ title: "编辑失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }, [pid, currentStep])

  const handleSkip = async () => {
    const s = DESIGN_STEPS[currentStep]
    const placeholder = `# ${s.label} - 已跳过\n\n此设计步骤已被用户跳过。`
    try {
      const r = await fetch(`/api/projects/${pid}/artifacts/${s.artifactType}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: placeholder }),
      })
      const { data } = await r.json()
      setContents((prev) => ({ ...prev, [s.key]: placeholder }))
      setArtifactVersions((prev) => ({ ...prev, [s.key]: data.version }))
      setStepStates((prev) => {
        const next = [...prev]
        next[currentStep] = "skipped"
        return next
      })
      // 自动推进到下一步
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1)
      }
    } catch (e: unknown) {
      toast({ title: "操作失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }

  const handleLock = async () => {
    const s = DESIGN_STEPS[currentStep]
    const content = contents[s.key]
    if (!content) return
    try {
      const r = await fetch(`/api/projects/${pid}/artifacts/${s.artifactType}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      const { data } = await r.json()
      setArtifactVersions((prev) => ({ ...prev, [s.key]: data.version }))
      setStepStates((prev) => {
        const next = [...prev]
        next[currentStep] = "locked"
        return next
      })
      toast({ title: `${s.label}已定稿`, description: `版本 v${data.version}` })
      // 自动推进到下一步
      if (currentStep < 4) {
        setCurrentStep(currentStep + 1)
      }
    } catch (e: unknown) {
      toast({ title: "定稿失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    }
  }

  const handleFileParsed = useCallback((content: string, fileName: string) => {
    // 将上传的文件内容作为上下文发送给 Agent
    handleChatSend(`以下是上传的文档内容（${fileName}），请基于此内容生成当前步骤的设计：\n\n${content.slice(0, 5000)}`)
  }, [handleChatSend])

  const handleVersionChange = useCallback((version: number) => {
    const s = DESIGN_STEPS[currentStep]
    fetch(`/api/projects/${pid}/artifacts/${s.artifactType}?version=${version}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) {
          setContents((prev) => ({ ...prev, [s.key]: data.content }))
        }
      })
      .catch(() => {})
  }, [pid, currentStep])

  const handleStepClick = (idx: number) => {
    setCurrentStep(idx)
    // 刷新该步骤内容
    const s = DESIGN_STEPS[idx]
    fetch(`/api/projects/${pid}/artifacts/${s.artifactType}`)
      .then((r) => r.json())
      .then(({ data }) => {
        if (data?.content) {
          setContents((prev) => ({ ...prev, [s.key]: data.content }))
          setArtifactVersions((prev) => ({ ...prev, [s.key]: data.version ?? 1 }))
        }
      })
      .catch(() => {})
  }

  const handleLockG2 = async () => {
    try {
      const r = await fetch(`/api/projects/${pid}/stages/G2/complete`, { method: "POST" })
      if (!r.ok) {
        const { error } = await r.json()
        toast({ title: "G2 锁定失败", description: error?.message ?? "", variant: "destructive" })
      } else {
        toast({ title: "设计阶段已锁定", description: "进入开发阶段" })
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
  const currentStepDef = DESIGN_STEPS[currentStep]
  const currentState = stepStates[currentStep]
  const allDone = stepStates.every((s) => s === "locked" || s === "skipped")

  const handleProgress = useCallback((data: {
    phase?: string; step?: number; total?: number; subtype?: string; done?: boolean; failed?: boolean
    message?: string; elapsedMs?: number; results?: Record<string, string>
    subPhase?: string; delta?: string; cumulativeBytes?: number
  }) => {
    const phase = data.phase ?? ""
    if (phase === "design-plan") {
      setDesignAllSteps(createInitialSteps())
      setDesignAllTotalMs(undefined)
      setShellBuffer("")
      setPageBuffers({})
      setPreviewHtml("")
    } else if (phase === "design-step-start" && data.subtype != null) {
      const idx = DESIGN_STEPS.findIndex((s) => s.key === data.subtype)
      if (idx >= 0) {
        setDesignAllSteps((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], status: "running" }
          return next
        })
      }
    } else if (phase === "design-step-done" && data.subtype != null) {
      const idx = DESIGN_STEPS.findIndex((s) => s.key === data.subtype)
      if (idx >= 0) {
        setDesignAllSteps((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], status: "done", elapsedMs: data.elapsedMs }
          return next
        })
      }
      // UI 完成时拉最终 artifact 覆盖预览
      if (data.subtype === "ui") {
        fetch(`/api/projects/${pid}/artifacts/design-ui`)
          .then((r) => r.json())
          .then(({ data: d }) => { if (d?.content) setPreviewHtml(d.content) })
          .catch(() => {})
      }
    } else if (phase === "design-step-failed" && data.subtype != null) {
      const idx = DESIGN_STEPS.findIndex((s) => s.key === data.subtype)
      if (idx >= 0) {
        setDesignAllSteps((prev) => {
          const next = [...prev]
          next[idx] = { ...next[idx], status: "failed", error: data.message }
          return next
        })
      }
    } else if (phase === "design-ui-stream" && data.subPhase && data.delta != null) {
      // 将 delta 按 subPhase 分类写入 shellBuffer 或 pageBuffers
      const sp = data.subPhase
      if (sp === "ui-shell") {
        setShellBuffer((prev) => prev + data.delta!)
      } else {
        const pageKey = sp.replace(/^ui-/, "")
        setPageBuffers((prev) => ({ ...prev, [pageKey]: (prev[pageKey] ?? "") + data.delta! }))
      }
      // throttle 200ms 合成 iframe srcdoc
      if (previewThrottleRef.current) clearTimeout(previewThrottleRef.current)
      previewThrottleRef.current = setTimeout(() => {
        setShellBuffer((shell) => {
          setPageBuffers((pages) => {
            const allPages = Object.values(pages).join("\n\n")
            const assembled = shell.replace(
              '<main id="page-root"></main>',
              `<main id="page-root">\n${allPages}\n</main>`,
            )
            setPreviewHtml(assembled)
            return pages
          })
          return shell
        })
      }, 200)
    } else if (phase === "result" && data.results) {
      if (data.elapsedMs != null) setDesignAllTotalMs(data.elapsedMs)
    }
  }, [pid])

  const handleOneClick = () => {
    autoChainRef.current = true
    autoChainStepRef.current = 0
    setCurrentStep(0)
    setDraftReady(false)
    // 重置进度面板
    setDesignAllSteps(createInitialSteps().map((s, i) => ({ ...s, status: i === 0 ? "running" : "pending" })))
    setDesignAllTotalMs(undefined)
    setStepStates((prev) => {
      const next = [...prev]
      for (let i = 0; i < next.length; i++) {
        if (next[i] !== "locked") next[i] = "pending"
      }
      next[0] = "generating"
      return next
    })
    chatRef.current?.addUserMessage("一键生成全部：基于 PRD 文档，依次生成概要设计、接口设计、数据库设计、详细设计和 UI 原型")
    fetch(`/api/projects/${pid}/design/generate-all`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .then((r) => r.json())
      .then(({ data }) => setJobId(data.jobId))
      .catch((e: unknown) => {
        toast({ title: "生成失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
        autoChainRef.current = false
      })
  }

  return (
    <ThreePane
      left={<StageNav currentStage={project?.currentStage ?? "design"} gates={gates} />}
      center={
        <div className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between p-3 border-b">
            <div>
              <h2 className="text-lg font-semibold">设计</h2>
              {project?.name && (
                <p className="text-xs text-muted-foreground">{project.name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleOneClick} disabled={currentState === "generating"} variant="default">
                <Wand2 className="w-3.5 h-3.5 mr-1" />
                一键生成全部
              </Button>
              <FileUpload projectId={pid} onParsed={handleFileParsed} />
              <Button size="sm" onClick={handleLockG2} disabled={!allDone}>
                <Lock className="w-3.5 h-3.5 mr-1" />
                完成设计阶段
              </Button>
            </div>
          </div>

          <StepProgress
            steps={DESIGN_STEPS.map((s) => ({ key: s.key, label: s.label }))}
            currentStep={currentStep}
            states={stepStates}
            onStepClick={handleStepClick}
          />

          <div className="flex-1 overflow-auto">
            {/* 一键生成进度面板 */}
            {autoChainRef.current && (
              <>
                <DesignProgressPanel
                  steps={designAllSteps}
                  totalMs={designAllTotalMs}
                  onRetry={(stepKey) => {
                    // 重试单个失败步骤
                    handleGenerate(stepKey)
                  }}
                />
                {previewHtml && (
                  <div className="mx-4 mb-3 border rounded-lg overflow-hidden" style={{ height: 420 }}>
                    <iframe
                      className="w-full h-full"
                      srcDoc={previewHtml}
                      title="UI 原型实时预览"
                      sandbox="allow-scripts allow-same-origin"
                    />
                  </div>
                )}
              </>
            )}
            <ArtifactViewer
              content={contents[currentStepDef.key] ?? null}
              loading={currentState === "generating" && !autoChainRef.current}
              title={currentStepDef.label}
              projectId={pid}
              artifactType={currentStepDef.artifactType}
              currentVersion={artifactVersions[currentStepDef.key]}
              onVersionChange={handleVersionChange}
              onConfirmVersion={async (type, content) => {
                await fetch(`/api/projects/${pid}/artifacts/${type}/confirm`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ content }),
                })
                reloadArtifact(currentStepDef.key)
              }}
            />

            {/* 草稿确认栏（手动对话模式才显示） */}
            {!autoChainRef.current && draftReady && currentState !== "generating" && (
              <div className="flex items-center justify-center gap-3 px-6 pb-2">
                <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2.5">
                  <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    AI 已生成新内容，是否替换当前内容？
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

            {/* 操作按钮 */}
            <div className="flex gap-2 px-6 pb-6 justify-center">
              {currentState === "locked" ? (
                <Badge variant="default" className="gap-1.5">
                  <Check className="w-3 h-3" /> 已定稿
                </Badge>
              ) : currentState === "skipped" ? (
                <Badge variant="secondary">已跳过</Badge>
              ) : (
                <>
                  <Button
                    onClick={() => handleGenerate(currentStepDef.key)}
                    disabled={currentState === "generating"}
                  >
                    <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                    {currentState === "generating" ? "生成中..." : "生成"}
                  </Button>
                  <Button variant="outline" onClick={handleSkip}>
                    <SkipForward className="w-3.5 h-3.5 mr-1.5" />
                    跳过
                  </Button>
                  {(currentState === "draft" || contents[currentStepDef.key]) && currentState !== "generating" && (
                    <Button variant="default" onClick={handleLock}>
                      <Lock className="w-3.5 h-3.5 mr-1.5" />
                      确认定稿
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      }
      right={
        <AgentChat
          ref={chatRef}
          title="设计 Agent"
          projectId={pid}
          jobId={jobId}
          streamingUrl={streamingUrl}
          onSend={handleChatSend}
          onDone={handleJobDone}
          onProgress={handleProgress}
          placeholder={`输入设计指令（当前: ${currentStepDef.label}）...`}
        />
      }
    />
  )
}
