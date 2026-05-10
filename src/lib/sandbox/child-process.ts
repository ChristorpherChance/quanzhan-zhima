import { spawn, type ChildProcess } from "node:child_process"
import { acquirePort, releasePort } from "./port-pool"
import { log } from "@/lib/log"
import type { SandboxHandle, SandboxStartOpts } from "./types"

const registry = new Map<string, SandboxHandle>()

function sanitizedEnv(port: number): NodeJS.ProcessEnv {
  // 白名单策略：仅传递必要的 env vars，防止 API key/baseURL 泄漏到子进程
  const allow = ["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "NODE_OPTIONS", "LANG", "SYSTEMROOT", "USERPROFILE"]
  const e: Record<string, string> = { PORT: String(port) }
  for (const k of allow) {
    const v = process.env[k]
    if (v) e[k] = v
  }
  return e as unknown as NodeJS.ProcessEnv
}

async function waitPort(port: number, timeout: number) {
  const net = await import("node:net")
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const ok = await new Promise<boolean>((res) => {
      const s = net.connect({ port, host: "127.0.0.1" })
      s.once("connect", () => { s.destroy(); res(true) })
      s.once("error", () => res(false))
    })
    if (ok) return
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error("port not ready: " + port)
}

export async function startChild(opts: SandboxStartOpts): Promise<SandboxHandle> {
  const exists = registry.get(opts.projectId)
  if (exists) return exists

  const port = await acquirePort("sandbox")
  log("sandbox", `start: project=${opts.projectId} port=${port} cmd=${opts.command} cwd=${opts.workspaceDir}`)

  // J3.4: 全平台开 shell，确保 $PORT / && 等能正确解析
  const child: ChildProcess = spawn(opts.command, [], {
    cwd: opts.workspaceDir,
    env: sanitizedEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
  })

  child.stdout?.on("data", (b: Buffer) => log("sandbox", "out", b.toString().slice(0, 500)))
  child.stderr?.on("data", (b: Buffer) => log("sandbox", "err", b.toString().slice(0, 500)))
  child.on("error", (err: Error) => log("sandbox", "spawn-error", err.message))
  child.on("exit", (code: number | null) => log("sandbox", `exit: pid=${child.pid} code=${code}`))

  // J3.4: 超时延长到 180s，给 install + build 足够时间
  await waitPort(port, 180_000)

  const h: SandboxHandle = {
    projectId: opts.projectId,
    port,
    url: `http://localhost:${port}`,
    pid: child.pid,
    startedAt: Date.now(),
    async stop() {
      try { child.kill("SIGTERM") } catch { /* ignore */ }
      releasePort(port)
      registry.delete(opts.projectId)
    },
  }
  registry.set(opts.projectId, h)

  // auto-recycle after 30 min idle
  setTimeout(() => h.stop().catch(() => {}), 30 * 60 * 1000).unref()
  return h
}

export function getRunning(projectId: string) {
  return registry.get(projectId)
}

// cleanup on exit
process.on("SIGINT", () => { for (const [, h] of registry) h.stop().catch(() => {}) })
process.on("SIGTERM", () => { for (const [, h] of registry) h.stop().catch(() => {}) })
