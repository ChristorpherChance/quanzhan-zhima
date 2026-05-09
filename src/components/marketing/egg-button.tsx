"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Input } from "@/components/ui/input"

export function EggButton() {
  const [open, setOpen] = useState(false)
  const [oneLiner, setOneLiner] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleGo = async () => {
    if (!oneLiner.trim()) return
    setLoading(true)
    try {
      const r = await fetch("/api/egg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oneLiner }),
      })
      const { data } = await r.json()
      router.push(`/projects/${data.projectId}/design`)
    } catch (e: unknown) {
      toast({ title: "彩蛋启动失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="animate-pulse bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold"
      >
        🪧 现场彩蛋
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2 animate-in slide-in-from-left-2">
      <Input
        value={oneLiner}
        onChange={(e) => setOneLiner(e.target.value)}
        placeholder="输入一句话需求..."
        className="w-64 text-sm"
        onKeyDown={(e) => e.key === "Enter" && handleGo()}
        autoFocus
      />
      <Button onClick={handleGo} disabled={loading || !oneLiner.trim()} size="sm">
        {loading ? "生成中..." : "Go!"}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
        取消
      </Button>
    </div>
  )
}
