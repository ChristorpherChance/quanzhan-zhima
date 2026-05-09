"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "@/components/ui/toast"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"

export default function NewProjectPage() {
  const [name, setName] = useState("")
  const [oneLiner, setOneLiner] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleCreate = async () => {
    if (!name.trim() || !oneLiner.trim()) return
    setLoading(true)
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, oneLiner }),
      })
      const { data } = await r.json()
      router.push(`/projects/${data.project.id}`)
    } catch (e: unknown) {
      toast({ title: "创建失败", description: String((e as Error)?.message ?? e), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle>新建项目</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="name">项目名称</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：光伏电站监控系统"
            />
          </div>
          <div>
            <Label htmlFor="oneliner">一句话需求</Label>
            <Textarea
              id="oneliner"
              value={oneLiner}
              onChange={(e) => setOneLiner(e.target.value)}
              placeholder="例如：给县级光伏电站做一个实时监控页，能看功率、发电量、告警"
              rows={3}
            />
          </div>
          <Button onClick={handleCreate} disabled={loading || !name.trim() || !oneLiner.trim()} className="w-full">
            {loading ? "创建中..." : "创建项目"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
