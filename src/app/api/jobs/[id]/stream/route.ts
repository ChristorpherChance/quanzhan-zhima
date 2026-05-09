import { sseResponse } from "@/lib/sse"
import { getJobEvents, getJobEventTarget } from "@/agents/orchestrator"
import { prisma } from "@/lib/db/prisma"
import { NextRequest } from "next/server"

export const GET = (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  return sseResponse(async (send, signal) => {
    const jobId = params.id

    // 1. 重放已有事件
    const existing = getJobEvents(jobId)
    for (const e of existing) {
      if (signal.aborted) return
      send(e.event, e.data)
    }

    // 2. 检查 job 是否已完成
    const job = await prisma.job.findUnique({ where: { id: jobId } })
    if (!job || job.status === "succeeded" || job.status === "failed") {
      if (job?.status === "succeeded") {
        const hasResult = existing.some((e) => e.event === "result")
        if (!hasResult) send("result", { jobId })
      } else if (job?.status === "failed") {
        const hasError = existing.some((e) => e.event === "error")
        if (!hasError) send("error", { message: job?.errorMsg ?? "job failed" })
      }
      return
    }

    // 3. 监听新事件（EventTarget 推流）
    const target = getJobEventTarget(jobId)
    const handler = (e: Event) => {
      if (signal.aborted) return
      const detail = (e as CustomEvent).detail
      if (detail) send(detail.event, detail.data)
    }
    target.addEventListener("job-event", handler)

    // 4. 定期检查 job 完成状态（低频），客户端断开则退出
    const deadline = Date.now() + 300_000
    while (Date.now() < deadline && !signal.aborted) {
      const current = await prisma.job.findUnique({ where: { id: jobId } })
      if (!current || current.status === "succeeded" || current.status === "failed") {
        if (current?.status === "succeeded") {
          const events = getJobEvents(jobId)
          const hasResult = events.some((e) => e.event === "result")
          if (!hasResult) send("result", { jobId })
        } else if (current?.status === "failed") {
          const events = getJobEvents(jobId)
          const hasError = events.some((e) => e.event === "error")
          if (!hasError) send("error", { message: current?.errorMsg ?? "job failed" })
        }
        break
      }
      // 等待 2 秒后重试检查
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, 2000)
        const onAbort = () => { clearTimeout(t); resolve() }
        signal.addEventListener("abort", onAbort, { once: true })
      })
    }

    // 5. 清理
    target.removeEventListener("job-event", handler)
    if (!signal.aborted) {
      if (Date.now() >= deadline) send("error", { message: "请求超时，请重试" })
    }
  })
}
