import { withErrorBoundary } from "@/lib/errors"
import { startSandbox, getRunning, detectStartCommand } from "@/lib/sandbox"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { existsSync, mkdirSync, copyFileSync, readdirSync } from "node:fs"
import { execSync } from "node:child_process"
import { NextRequest } from "next/server"

function copyDirSync(src: string, dest: string) {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const sp = `${src}/${entry.name}`
    const dp = `${dest}/${entry.name}`
    if (entry.isDirectory()) copyDirSync(sp, dp)
    else copyFileSync(sp, dp)
  }
}

function ensureSkeletonWorkspace(workspaceDir: string) {
  if (existsSync(`${workspaceDir}/package.json`)) return

  const skeletonDir = paths.workspace("_skeleton")
  try {
    copyDirSync(skeletonDir, workspaceDir)
  } catch {
    mkdirSync(workspaceDir, { recursive: true })
    throw new Error("skeleton template missing – run `mkdir -p storage/projects/_skeleton` with minimal node project files")
  }
}

/** Mount design/ui-prototype/ into workspace preview/ for static serving */
function mountPreviewPrototype(projectId: string, workspaceDir: string) {
  const protoSrc = `${paths.design(projectId)}/ui-prototype`
  const protoDest = `${workspaceDir}/preview`
  try {
    copyDirSync(protoSrc, protoDest)
  } catch {
    // 原型目录不存在时静默跳过
  }
}

function execIn(cwd: string, cmd: string, ms = 10 * 60_000): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, { cwd, stdio: "pipe", timeout: ms, encoding: "utf-8" })
    return { ok: true, out: out.toString() }
  } catch (e: any) {
    return {
      ok: false,
      out: ((e as any)?.stdout?.toString?.() ?? "") + ((e as any)?.stderr?.toString?.() ?? ""),
    }
  }
}

export const POST = withErrorBoundary(async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  // 早返：复用已运行的沙箱
  const existing = getRunning(params.id)
  if (existing) {
    await prisma.job.upsert({
      where: { id: `sb-${params.id}` },
      create: {
        id: `sb-${params.id}`,
        projectId: params.id,
        agentType: "dev",
        type: "sandbox-run",
        status: "succeeded",
      },
      update: { status: "succeeded" },
    })
    return { url: existing.url, port: existing.port, sandboxId: params.id }
  }

  const workspaceDir = paths.workspace(params.id)
  ensureSkeletonWorkspace(workspaceDir)
  mountPreviewPrototype(params.id, workspaceDir)

  // J4: 检测启动命令
  const cmds = detectStartCommand(workspaceDir)
  const logs: string[] = []

  // 创建 sandbox-run Job
  const job = await prisma.job.create({
    data: { projectId: params.id, agentType: "dev", type: "sandbox-run", status: "running" },
  })

  try {
    // J4: 三段式 install → build → start
    if (cmds.install) {
      logs.push(`[install] ${cmds.install}`)
      const r = execIn(workspaceDir, cmds.install, 10 * 60_000)
      logs.push(r.ok ? "✓ install 完成" : `✗ install 失败:\n${r.out.slice(-2000)}`)
    }

    if (cmds.build) {
      logs.push(`[build] ${cmds.build}`)
      const r = execIn(workspaceDir, cmds.build, 10 * 60_000)
      logs.push(r.ok ? "✓ build 完成" : `✗ build 失败:\n${r.out.slice(-2000)}`)
      if (!r.ok) {
        // build 失败但继续尝试启动（可能 dev 模式不需要 build）
        logs.push("⚠ build 失败，尝试继续启动...")
      }
    }

    logs.push(`[start] ${cmds.start}`)
    // 替换骨架 server 路径（如需要）
    const startCmd = cmds.start.replace("$SKELETON_SERVER", `${workspaceDir}/server.js`)

    const h = await startSandbox({
      projectId: params.id,
      workspaceDir,
      command: startCmd,
    })

    logs.push(`✓ 沙箱已启动: ${h.url}`)
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "succeeded", logs: logs.join("\n") },
    })
    return { url: h.url, port: h.port, sandboxId: params.id, jobId: job.id, logs }
  } catch (e: unknown) {
    const errMsg = String((e as Error)?.message ?? e)
    logs.push(`✗ 启动失败: ${errMsg}`)
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "failed", logs: logs.join("\n"), errorMsg: errMsg },
    })
    return { url: null, message: "sandbox unavailable, use export zip", error: errMsg, logs }
  }
})
