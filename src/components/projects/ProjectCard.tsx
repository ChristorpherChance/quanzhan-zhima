"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/toast"
import { Trash2 } from "lucide-react"

const STAGE_LABELS: Record<string, string> = {
  requirement: "需求",
  design: "设计",
  dev: "开发",
  review: "审查",
  done: "完成",
}

interface ProjectCardProps {
  id: string
  name: string
  oneLiner: string
  currentStage: string
  seedType?: string
}

export function ProjectCard({ id, name, oneLiner, currentStage, seedType }: ProjectCardProps) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmName, setConfirmName] = useState("")
  const [deleting, setDeleting] = useState(false)

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    try {
      const r = await fetch(`/api/projects/${id}`, { method: "DELETE" })
      const data = await r.json()
      if (!data.ok) {
        toast({ title: "删除失败", description: data.error ?? "未知错误", variant: "destructive" })
        setDeleting(false)
        setDialogOpen(false)
        return
      }
      toast({ title: "项目已删除" })
      router.refresh()
    } catch (e: unknown) {
      toast({ title: "删除请求失败", description: (e as Error)?.message ?? "未知错误", variant: "destructive" })
      setDeleting(false)
    }
  }, [id, router])

  return (
    <>
      <div className="relative group">
        <Link href={`/projects/${id}`}>
          <Card
            className="hover:border-primary/50 transition-colors cursor-pointer h-full"
            style={deleting ? { opacity: 0.5 } : undefined}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg pr-8">{name}</CardTitle>
                {seedType && (
                  <Badge variant="secondary">{seedType === "egg" ? "🪧" : "🌱"}</Badge>
                )}
              </div>
              <CardDescription>{oneLiner}</CardDescription>
            </CardHeader>
            <CardContent>
              <Badge>{STAGE_LABELS[currentStage] ?? currentStage}</Badge>
            </CardContent>
          </Card>
        </Link>

        {/* 悬浮删除按钮 */}
        <button
          className="absolute top-3 right-3 p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
          aria-label="删除项目"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setDialogOpen(true)
          }}
        >
          {deleting ? (
            <span className="size-4 block animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : (
            <Trash2 className="size-4" />
          )}
        </button>
      </div>

      {/* 删除确认对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目</DialogTitle>
            <DialogDescription>
              此操作不可恢复。请输入项目名 <strong>{name}</strong> 以确认删除。
            </DialogDescription>
          </DialogHeader>
          <Input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={name}
            disabled={deleting}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={confirmName !== name || deleting}
              onClick={handleDelete}
            >
              {deleting ? "删除中..." : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
