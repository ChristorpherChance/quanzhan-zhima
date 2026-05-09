export function sseResponse(
  handler: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>,
) {
  let aborter: AbortController | null = null
  const stream = new ReadableStream({
    async start(controller) {
      aborter = new AbortController()
      const enc = new TextEncoder()
      const send = (event: string, data: unknown) => {
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
        } catch {
          // 客户端已断开
        }
      }
      try {
        await handler(send, aborter.signal)
        send("end", {})
      } catch (e: unknown) {
        if (aborter.signal.aborted) return
        send("error", { code: "E_INTERNAL", message: String((e as Error)?.message ?? e) })
      } finally {
        try { controller.close() } catch { /* 已关闭 */ }
      }
    },
    cancel() {
      aborter?.abort()
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  })
}
