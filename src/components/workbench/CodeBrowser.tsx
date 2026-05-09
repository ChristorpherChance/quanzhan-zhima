"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Editor from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import {
  File, Folder, FolderOpen, ChevronRight, ChevronDown,
  Download, Copy, ExternalLink, AlertTriangle, RefreshCw,
} from "lucide-react"

interface FileEntry {
  name: string
  path: string
  size: number
  mtime: string
  isDirectory: boolean
}

interface FileContent {
  path: string
  size: number
  mtime: string
  language: string
  content: string | null
  truncated?: boolean
  maxSize?: number
}

interface TreeNode {
  name: string
  path: string
  isDirectory: boolean
  size: number
  children: TreeNode[]
  expanded?: boolean
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode[] = []
  const dirMap = new Map<string, TreeNode>()

  for (const f of files) {
    const parts = f.path.split("/")
    let parent = root
    let currentPath = ""

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      currentPath = currentPath ? `${currentPath}/${part}` : part
      const isDir = i < parts.length - 1 || f.isDirectory

      if (isDir) {
        let dir = dirMap.get(currentPath)
        if (!dir) {
          dir = {
            name: part,
            path: currentPath,
            isDirectory: true,
            size: 0,
            children: [],
            expanded: false,
          }
          parent.push(dir)
          dirMap.set(currentPath, dir)
        }
        parent = dir.children
      } else {
        parent.push({
          name: part,
          path: currentPath,
          isDirectory: false,
          size: f.size,
          children: [],
        })
      }
    }
  }

  return root
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  }).map((n) => {
    if (n.isDirectory) n.children = sortTree(n.children)
    return n
  })
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

interface CodeBrowserProps {
  projectId: string
  sandboxUrl?: string | null
  className?: string
}

export function CodeBrowser({ projectId, sandboxUrl, className }: CodeBrowserProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<FileContent | null>(null)
  const [contentLoading, setContentLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/projects/${projectId}/files`)
      const data = await r.json()
      setFiles(data.files ?? [])
      setTree(sortTree(buildTree(data.files ?? [])))
    } catch {
      setError("无法加载文件列表")
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  const openFile = useCallback(async (filePath: string) => {
    setSelectedPath(filePath)
    setContentLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/projects/${projectId}/files/${filePath}`)
      const data = await r.json()
      if (data.error) {
        setError(data.error)
        setFileContent(null)
      } else {
        setFileContent(data)
      }
    } catch {
      setError("无法加载文件内容")
      setFileContent(null)
    } finally {
      setContentLoading(false)
    }
  }, [projectId])

  const handleCopy = useCallback(() => {
    if (fileContent?.content) {
      navigator.clipboard.writeText(fileContent.content)
    }
  }, [fileContent])

  const handleDownload = useCallback(() => {
    if (fileContent?.content && fileContent.path) {
      const blob = new Blob([fileContent.content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = fileContent.path.split("/").pop() ?? "file"
      a.click()
      URL.revokeObjectURL(url)
    }
  }, [fileContent])

  // Toggle directory expand/collapse
  const toggleDir = useCallback((dirPath: string) => {
    const update = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map((n) => {
        if (n.path === dirPath && n.isDirectory) {
          return { ...n, expanded: !n.expanded }
        }
        if (n.children.length > 0) {
          return { ...n, children: update(n.children) }
        }
        return n
      })
    setTree((prev) => update(prev))
  }, [])

  const sandboxFileUrl = useMemo(() => {
    if (!sandboxUrl || !selectedPath) return null
    const base = sandboxUrl.replace(/\/$/, "")
    return `${base}/${selectedPath}`
  }, [sandboxUrl, selectedPath])

  return (
    <div className={cn("flex h-full min-h-0", className)}>
      {/* 左：文件树 */}
      <div className="w-56 shrink-0 border-r flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b">
          <span className="text-xs font-medium">文件</span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={fetchFiles} title="刷新">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-2 space-y-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          ) : (
            <FileTree nodes={tree} selectedPath={selectedPath} onToggle={toggleDir} onOpen={openFile} />
          )}
        </ScrollArea>
      </div>

      {/* 中：编辑器 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 工具栏 */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
          {selectedPath ? (
            <>
              <span className="text-xs text-muted-foreground truncate flex-1">{selectedPath}</span>
              {fileContent?.truncated && (
                <Badge variant="destructive" className="gap-1 text-[10px]">
                  <AlertTriangle className="w-3 h-3" />
                  文件过大 ({(fileContent.size / 1024 / 1024).toFixed(1)}MB)
                </Badge>
              )}
              {fileContent?.size && !fileContent.truncated && (
                <span className="text-[10px] text-muted-foreground">{fmtSize(fileContent.size)}</span>
              )}
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy} title="复制">
                <Copy className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleDownload} title="下载">
                <Download className="w-3 h-3" />
              </Button>
              {sandboxUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 text-[10px] gap-1"
                  onClick={() => {
                    if (sandboxFileUrl) window.open(sandboxFileUrl, "_blank")
                  }}
                >
                  <ExternalLink className="w-3 h-3" />
                  沙箱中打开
                </Button>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground">选择一个文件查看</span>
          )}
        </div>

        {/* 编辑器内容 */}
        <div className="flex-1 min-h-0">
          {contentLoading ? (
            <div className="flex items-center justify-center h-full">
              <Skeleton className="h-full w-full" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <AlertTriangle className="w-8 h-8" />
              <p className="text-sm">{error}</p>
            </div>
          ) : fileContent?.truncated ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2 p-8">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
              <p className="text-sm">文件过大无法在编辑器中显示</p>
              <p className="text-xs">
                大小: {fmtSize(fileContent.size)}（上限: {fmtSize(fileContent.maxSize ?? 1_048_576)}）
              </p>
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="w-3.5 h-3.5 mr-1" />
                下载文件
              </Button>
            </div>
          ) : fileContent?.content != null ? (
            <Editor
              height="100%"
              language={fileContent.language}
              value={fileContent.content}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                wordWrap: "on",
                scrollBeyondLastLine: false,
                lineNumbers: "on",
                renderWhitespace: "selection",
                automaticLayout: true,
              }}
              loading={<Skeleton className="h-full w-full" />}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">点击左侧文件树查看代码</p>
            </div>
          )}
        </div>
      </div>

      {/* 右：沙箱预览 iframe */}
      {sandboxUrl && (
        <div className="w-80 shrink-0 border-l flex flex-col">
          <div className="px-3 py-2 border-b text-xs font-medium">预览</div>
          <iframe
            src={sandboxUrl}
            className="flex-1 w-full border-0"
            title="Sandbox Preview"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  )
}

// ── 递归文件树 ────────────────────────────────────────────────

function FileTree({
  nodes,
  selectedPath,
  onToggle,
  onOpen,
  depth = 0,
}: {
  nodes: TreeNode[]
  selectedPath: string | null
  onToggle: (path: string) => void
  onOpen: (path: string) => void
  depth?: number
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          {node.isDirectory ? (
            <>
              <button
                type="button"
                className={cn(
                  "flex items-center gap-1 w-full text-left px-2 py-0.5 text-xs hover:bg-muted transition-colors",
                  depth === 0 && "font-medium",
                )}
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
                onClick={() => onToggle(node.path)}
              >
                {node.expanded ? (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                )}
                {node.expanded ? (
                  <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                ) : (
                  <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                )}
                <span className="truncate">{node.name}</span>
              </button>
              {node.expanded && (
                <FileTree
                  nodes={node.children}
                  selectedPath={selectedPath}
                  onToggle={onToggle}
                  onOpen={onOpen}
                  depth={depth + 1}
                />
              )}
            </>
          ) : (
            <button
              type="button"
              className={cn(
                "flex items-center gap-1 w-full text-left px-2 py-0.5 text-xs hover:bg-muted transition-colors",
                selectedPath === node.path && "bg-primary/10 text-primary font-medium",
              )}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
              onClick={() => onOpen(node.path)}
            >
              <File className="w-3.5 h-3.5 shrink-0 text-blue-400" />
              <span className="truncate">{node.name}</span>
              {node.size > 0 && (
                <span className="text-[9px] text-muted-foreground ml-auto">{fmtSize(node.size)}</span>
              )}
            </button>
          )}
        </div>
      ))}
    </>
  )
}
