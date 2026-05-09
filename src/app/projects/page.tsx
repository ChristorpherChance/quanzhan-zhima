import Link from "next/link"
import { headers } from "next/headers"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EggButton } from "@/components/marketing/egg-button"

const STAGE_LABELS: Record<string, string> = {
  requirement: "需求",
  design: "设计",
  dev: "开发",
  review: "审查",
  done: "完成",
}

async function getProjects() {
  let base: string
  try {
    const h = headers()
    const host = h.get("host") || h.get("x-forwarded-host") || "localhost:3002"
    const proto = h.get("x-forwarded-proto") || "http"
    base = `${proto}://${host}`
  } catch {
    base = `http://localhost:${process.env.PORT || 3002}`
  }
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    const r = await fetch(`${base}/api/projects?limit=20`, {
      cache: "no-store",
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    const { data } = await r.json()
    return data?.items ?? []
  } catch {
    return []
  }
}

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">项目列表</h1>
        <div className="flex items-center gap-3">
          <EggButton />
          <Link href="/projects/new">
            <Button>新建项目</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {projects.length === 0 && (
          <div className="col-span-2 text-center py-12 text-muted-foreground">
            暂无项目，点击「新建项目」开始
          </div>
        )}
        {projects.map((p: { id: string; name: string; oneLiner: string; currentStage: string; seedType?: string }) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  {p.seedType && (
                    <Badge variant="secondary">{p.seedType === "egg" ? "🪧" : "🌱"}</Badge>
                  )}
                </div>
                <CardDescription>{p.oneLiner}</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge>{STAGE_LABELS[p.currentStage] ?? p.currentStage}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
