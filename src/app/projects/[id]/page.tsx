import { headers } from "next/headers"
import { redirect } from "next/navigation"

function getBaseUrl(): string {
  try {
    const h = headers()
    const host = h.get("host") || h.get("x-forwarded-host") || "localhost:3002"
    const proto = h.get("x-forwarded-proto") || "http"
    return `${proto}://${host}`
  } catch {
    return "http://localhost:3002"
  }
}

export default async function ProjectPage({
  params,
}: {
  params: { id: string }
}) {
  const base = getBaseUrl()
  try {
    const r = await fetch(`${base}/api/projects/${params.id}`, { cache: "no-store" })
    const { data } = await r.json()
    redirect(`/projects/${params.id}/${data.project.currentStage}`)
  } catch {
    redirect(`/projects/${params.id}/requirement`)
  }
}
