"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MarkdownView } from "@/components/markdown"
import { Skeleton } from "@/components/ui/skeleton"
import { StageNav } from "@/components/workbench/stage-nav"
import { ThreePane } from "@/components/workbench/three-pane"
import { DownloadButton } from "@/components/workbench/download-button"

const DOC_TABS = [
  { key: "changelog", label: "变更日志" },
  { key: "requirements", label: "需求记录" },
  { key: "plan", label: "实施计划" },
]

export default function DocsPage() {
  const params = useParams()
  const pid = params.id as string
  const [activeTab, setActiveTab] = useState("changelog")
  const [contents, setContents] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [project, setProject] = useState<{ currentStage: string; name: string } | null>(null)
  const [gates, setGates] = useState<Array<{ type: string; status: string }>>([])

  useEffect(() => {
    fetch(`/api/projects/${pid}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProject({ currentStage: data?.project?.currentStage ?? "docs", name: data?.project?.name ?? "" })
        setGates(data?.gates ?? [])
      })
      .catch(() => {})
  }, [pid])

  useEffect(() => {
    if (contents[activeTab]) return
    setLoading((prev) => ({ ...prev, [activeTab]: true }))
    fetch(`/api/projects/${pid}/docs/${activeTab}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setContents((prev) => ({ ...prev, [activeTab]: data?.content ?? "" }))
      })
      .catch(() => {})
      .finally(() => {
        setLoading((prev) => ({ ...prev, [activeTab]: false }))
      })
  }, [pid, activeTab, contents])

  return (
    <ThreePane
      left={<StageNav currentStage={project?.currentStage ?? "docs"} gates={gates} />}
      center={
        <div className="flex flex-col h-full min-h-0">
          <div className="p-3 border-b">
            <h2 className="text-lg font-semibold">项目文档</h2>
            {project?.name && (
              <p className="text-xs text-muted-foreground">{project.name}</p>
            )}
          </div>

          <Tabs defaultValue="changelog" value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mx-4 mt-3">
              {DOC_TABS.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {DOC_TABS.map((tab) => (
              <TabsContent key={tab.key} value={tab.key} className="flex-1 overflow-auto px-6 py-4">
                {loading[tab.key] ? (
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ) : contents[tab.key] ? (
                  <div>
                    <div className="flex justify-end mb-3">
                      <DownloadButton
                        content={contents[tab.key]}
                        filename={`${project?.name ?? "project"}-${tab.key}-${new Date().toISOString().slice(0, 10)}.md`}
                      />
                    </div>
                    <MarkdownView content={contents[tab.key]} />
                  </div>
                ) : (
                  <div className="text-center text-muted-foreground py-12">
                    暂无内容。执行操作后将自动生成记录。
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      }
    />
  )
}
