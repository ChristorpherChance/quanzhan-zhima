"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { MarkdownView } from "@/components/workbench/MarkdownView"
import { VersionSelector } from "@/components/workbench/version-selector"
import { DownloadButton } from "@/components/workbench/download-button"
import { ArtifactEditor } from "@/components/workbench/artifact-editor"
import { UiPrototypeViewer } from "@/components/workbench/UiPrototypeViewer"
import { Badge } from "@/components/ui/badge"
import { Edit3 } from "lucide-react"

interface ArtifactViewerProps {
  content: string | null
  loading?: boolean
  title?: string
  projectId?: string
  artifactType?: string
  currentVersion?: number
  isHistorical?: boolean
  onVersionChange?: (version: number) => void
  onConfirmVersion?: (type: string, content: string) => Promise<void>
}

export function ArtifactViewer({
  content,
  loading,
  title,
  projectId,
  artifactType,
  currentVersion,
  isHistorical,
  onVersionChange,
  onConfirmVersion,
}: ArtifactViewerProps) {
  const [editing, setEditing] = useState(false)

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    )
  }

  if (editing && content != null && projectId && artifactType && onConfirmVersion) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <ArtifactEditor
          content={content}
          artifactType={artifactType}
          projectId={projectId}
          onSave={async (newContent) => {
            await onConfirmVersion(artifactType, newContent)
            setEditing(false)
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {title && (
          <h1 className="text-2xl font-bold">{title}</h1>
        )}
        {projectId && artifactType && currentVersion && onVersionChange && (
          <VersionSelector
            projectId={projectId}
            artifactType={artifactType}
            currentVersion={currentVersion}
            onVersionChange={onVersionChange}
          />
        )}
        {isHistorical && (
          <Badge variant="secondary" className="text-xs">历史版本</Badge>
        )}
        {content && (
          <div className="flex items-center gap-2 ml-auto">
            {projectId && artifactType && onConfirmVersion && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)} className="gap-1">
                <Edit3 className="h-3.5 w-3.5" />
                编辑
              </Button>
            )}
            <DownloadButton
              content={content}
              filename={`${title ?? artifactType ?? "document"}-v${currentVersion ?? 1}.${artifactType === "design-ui" ? "html" : "md"}`}
              mimeType={artifactType === "design-ui" ? "text/html" : "text/markdown"}
            />
          </div>
        )}
      </div>
      {content ? (
        artifactType === "design-ui" ? (
          <UiPrototypeViewer htmlSource={content} projectId={projectId} />
        ) : (
          <MarkdownView source={content} />
        )
      ) : (
        <div className="text-center text-muted-foreground py-12">
          暂无内容。请在右侧启动 Agent 生成。
        </div>
      )}
    </div>
  )
}
