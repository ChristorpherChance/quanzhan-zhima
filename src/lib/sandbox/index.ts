import { startChild, getRunning } from "./child-process"
import type { SandboxHandle, SandboxStartOpts } from "./types"
import { existsSync, readFileSync } from "node:fs"
import { PORTS } from "@/config/ports"

export async function startSandbox(opts: SandboxStartOpts): Promise<SandboxHandle> {
  const exists = getRunning(opts.projectId)
  if (exists) return exists
  // Docker disabled by default (SANDBOX_DOCKER=0), always use child process
  return startChild(opts)
}

export { getRunning } from "./child-process"
export type { SandboxHandle, SandboxStartOpts }

export async function stopSandbox(projectId: string) {
  const h = getRunning(projectId)
  if (h) await h.stop()
}

// J4: 自动检测项目框架 → 返回 install/build/start 命令
export interface StartCommands {
  install: string
  build?: string
  start: string
  port: number
}

export function detectStartCommand(workspaceDir: string): StartCommands {
  const pkgPath = `${workspaceDir}/package.json`
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    const hasNext = !!deps.next
    const hasVite = !!deps.vite
    const hasReact = !!deps.react

    if (hasNext) {
      return {
        install: "pnpm install --no-frozen-lockfile",
        build: "pnpm exec next build",
        start: "pnpm exec next start -p $PORT",
        port: PORTS.uiPreview[0],
      }
    }
    if (hasVite) {
      return {
        install: "pnpm install --no-frozen-lockfile",
        build: "pnpm exec vite build",
        start: "pnpm exec vite preview --host 0.0.0.0 --port $PORT",
        port: PORTS.uiPreview[0],
      }
    }
    // 通用 npm start / dev
    if (pkg.scripts?.start) {
      const startScript = pkg.scripts.start
      const portIncluded = startScript.includes("$PORT") || startScript.includes("--port")
      return {
        install: "pnpm install --no-frozen-lockfile",
        start: portIncluded ? startScript : `${startScript} -- --port $PORT`,
        port: PORTS.uiPreview[0],
      }
    }
    if (pkg.scripts?.dev) {
      return {
        install: "pnpm install --no-frozen-lockfile",
        start: pkg.scripts.dev.includes("$PORT")
          ? pkg.scripts.dev
          : `${pkg.scripts.dev} -- --port $PORT`,
        port: PORTS.uiPreview[0],
      }
    }
  }

  // 静态站点兜底：根有 index.html
  if (existsSync(`${workspaceDir}/index.html`)) {
    return {
      install: "",
      start: "node $SKELETON_SERVER", // 由调用方替换为实际 server.js 路径
      port: PORTS.uiPreview[0],
    }
  }

  // 最后兜底
  return { install: "", start: "node server.js", port: PORTS.uiPreview[0] }
}
