import { withErrorBoundary } from "@/lib/errors"
import { startSandbox, getRunning } from "@/lib/sandbox"
import { paths } from "@/config/paths"
import { existsSync, mkdirSync, writeFileSync, copyFileSync, readdirSync } from "node:fs"
import { NextRequest } from "next/server"

function ensureSkeletonWorkspace(workspaceDir: string) {
  if (existsSync(`${workspaceDir}/package.json`)) return

  // 尝试从骨架复制
  const skeletonDir = paths.workspace("_skeleton")
  try {
    copyDirSync(skeletonDir, workspaceDir)
    return
  } catch { /* 骨架不存在，动态生成 */ }

  // 动态生成最小项目
  mkdirSync(workspaceDir, { recursive: true })
  writeFileSync(`${workspaceDir}/package.json`, JSON.stringify({
    name: "ai-generated-app", version: "1.0.0", private: true,
    scripts: { dev: "node server.js" },
  }, null, 2), "utf-8")
  writeFileSync(`${workspaceDir}/server.js`, MINIMAL_SERVER_JS, "utf-8")
}

function copyDirSync(src: string, dest: string) {
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const sp = `${src}/${entry.name}`
    const dp = `${dest}/${entry.name}`
    if (entry.isDirectory()) copyDirSync(sp, dp)
    else copyFileSync(sp, dp)
  }
}

const MINIMAL_SERVER_JS = `const http = require("http")
const PORT = process.env.PORT || 3000
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" })
  res.end(\`<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>AI 生成的应用</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#667eea,#764ba2)}.card{background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-width:500px;margin:20px}h1{color:#333;margin-bottom:16px}p{color:#666;line-height:1.6}.status{margin-top:24px;padding:10px 20px;background:#e8f5e9;color:#2e7d32;border-radius:8px;font-size:14px}</style></head><body><div class="card"><h1>🚀 应用已启动</h1><p>这是一个由 AI 生成的骨架应用。</p><div class="status">✓ 沙箱运行中</div></div></body></html>\`)
})
server.listen(PORT, () => console.log(\`http://localhost:\${PORT}\`))`

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const existing = getRunning(params.id)
  if (existing) return { url: existing.url, port: existing.port, sandboxId: params.id }

  const workspaceDir = paths.workspace(params.id)
  ensureSkeletonWorkspace(workspaceDir)

  try {
    const h = await startSandbox({
      projectId: params.id,
      workspaceDir,
      command: "npm run dev",
    })
    return { url: h.url, port: h.port, sandboxId: params.id }
  } catch (e: unknown) {
    return { url: null, message: "sandbox unavailable, use export zip", error: String((e as Error)?.message ?? e) }
  }
})
