import { headers } from "next/headers"
import { Button } from "@/components/ui/button"
import { EggButton } from "@/components/marketing/egg-button"
import { ProjectCard } from "@/components/projects/ProjectCard"
import { PORTS } from "@/config/ports"
import Link from "next/link"

async function getProjects() {
  let base: string
  try {
    const h = headers()
    const host = h.get("host") || h.get("x-forwarded-host") || `localhost:${PORTS.app}`
    const proto = h.get("x-forwarded-proto") || "http"
    base = `${proto}://${host}`
  } catch {
    base = `http://localhost:${PORTS.app}`
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
          <ProjectCard
            key={p.id}
            id={p.id}
            name={p.name}
            oneLiner={p.oneLiner}
            currentStage={p.currentStage}
            seedType={p.seedType}
          />
        ))}
      </div>
    </div>
  )
}
