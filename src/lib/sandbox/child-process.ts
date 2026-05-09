import { spawn, type ChildProcess } from "node:child_process"
import { acquirePort, releasePort } from "./port-pool"
import { log } from "@/lib/log"
import type { SandboxHandle, SandboxStartOpts } from "./types"

const registry = new Map<string, SandboxHandle>()

function sanitizedEnv(port: number): NodeJS.ProcessEnv {
  const e = { ...process.env } as Record<string, string | undefined>
  delete e.DEEPSEEK_API_KEY
  delete e.ANTHROPIC_API_KEY
  delete e.KIMI_API_KEY
  delete e.XIAOMI_API_KEY
  delete e.OPENAI_API_KEY
  return { ...e, PORT: String(port) } as unknown as NodeJS.ProcessEnv
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

  const port = acquirePort()
  const isWindows = process.platform === "win32"
  log("sandbox", `start: project=${opts.projectId} port=${port} cmd=${opts.command} cwd=${opts.workspaceDir}`)

  const child: ChildProcess = spawn(opts.command, [], {
    cwd: opts.workspaceDir,
    env: sanitizedEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWindows, // Windows 需要 shell 才能找到 npm.cmd
  })

  child.stdout?.on("data", (b: Buffer) => log("sandbox", "out", b.toString().slice(0, 500)))
  child.stderr?.on("data", (b: Buffer) => log("sandbox", "err", b.toString().slice(0, 500)))
  child.on("error", (err: Error) => log("sandbox", "spawn-error", err.message))
  child.on("exit", (code: number | null) => log("sandbox", `exit: pid=${child.pid} code=${code}`))

  await waitPort(port, 30_000)

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
