// J4: Fix-Pack #4 综合 E2E — 7 步覆盖全栈关键路径（HTTP API）
// 用法: npx tsx scripts/smoke-fixpack4.ts
// 需要 Next.js dev server 在运行，默认连接 PORTS.app
// 设置环境变量 BASE_URL 可指向其他地址
// 设置 SKIP_LLM=1 跳过需要 LLM 调用的步骤（仅测 API 结构）

import "dotenv/config"
import path from "node:path"
import fs from "node:fs/promises"
import { PORTS } from "../src/config/ports"

const BASE = process.env.BASE_URL ?? `http://localhost:${PORTS.app}`
const SKIP_LLM = process.env.SKIP_LLM === "1"
const ROOT = path.resolve(process.cwd())

// ════════════════════════════════════════════════════════════════
// 测试框架
// ════════════════════════════════════════════════════════════════

interface StepResult { step: number; name: string; ok: boolean; detail: string }
const results: StepResult[] = []

function record(step: number, name: string, ok: boolean, detail: string) {
  const icon = ok ? "✅" : "❌"
  console.log(`  ${icon} Step ${step}: ${name} — ${detail}`)
  results.push({ step, name, ok, detail })
}

function sumUp() {
  const passed = results.filter((r) => r.ok).length
  const total = results.length
  console.log(`\n${"═".repeat(50)}`)
  console.log(`Fix-Pack #4 E2E 结果: ${passed}/${total} 通过`)
  for (const r of results) {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.step}. ${r.name}: ${r.detail}`)
  }
  console.log(`${"═".repeat(50)}`)
  process.exit(passed === total ? 0 : 1)
}

async function pollJob(jobId: string, timeoutMs = 300_000): Promise<{ status: string; errorMsg?: string | null }> {
  const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client")
  const prisma = new PrismaClient()
  try {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const job = await prisma.job.findUnique({ where: { id: jobId } })
      if (!job) return { status: "not-found" }
      if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
        return { status: job.status, errorMsg: job.errorMsg }
      }
      await new Promise((r) => setTimeout(r, 2000))
    }
    return { status: "timeout" }
  } finally {
    await prisma.$disconnect()
  }
}

async function api(path: string, init?: RequestInit) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...init?.headers as Record<string, string> },
    ...init,
  })
  const body = await res.json()
  return { status: res.status, body }
}

// ════════════════════════════════════════════════════════════════

async function main() {
  console.log("═══════════════════════════════════")
  console.log("Fix-Pack #4 综合 E2E · 7 步")
  console.log(`BASE_URL=${BASE}  SKIP_LLM=${SKIP_LLM}`)
  console.log("═══════════════════════════════════\n")

  let projectId: string | null = null

  // ── Step 1: 创建项目 + oneLiner ─────────────────────────────
  try {
    const { status, body } = await api("/api/projects", {
      method: "POST",
      body: JSON.stringify({
        name: `烟雾测试 ${Date.now()}`,
        oneLiner: "一个待办事项管理应用，支持添加/删除/标记完成/搜索过滤",
      }),
    })
    if (status === 200 && body?.project?.id) {
      projectId = body.project.id as string
      record(1, "创建项目", true, `id=${projectId.slice(0, 8)}... name=${body.project.name}`)
    } else {
      record(1, "创建项目", false, `HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`)
    }
  } catch (e: any) {
    record(1, "创建项目", false, e.message ?? String(e))
  }

  if (!projectId) {
    console.log("\n⚠ 项目创建失败，跳过后续 HTTP 步骤")
    sumUp()
    return
  }

  // ── Step 2: 触发 requirement-agent → PRD 锁定（G1）─────────
  if (SKIP_LLM) {
    record(2, "Requirement → G1 锁定", true, "跳过 — SKIP_LLM=1")
  } else {
    try {
      // 2a: 触发需求澄清
      const clarifyRes = await api(`/api/projects/${projectId}/requirement/clarify`, {
        method: "POST",
        body: JSON.stringify({ extraContext: "使用 React + TypeScript 技术栈" }),
      })
      if (clarifyRes.status !== 200 || !clarifyRes.body?.jobId) {
        record(2, "Requirement → G1 锁定", false, `clarify 失败: HTTP ${clarifyRes.status}`)
      } else {
        const clarifyJob = await pollJob(clarifyRes.body.jobId, 180_000)
        if (clarifyJob.status !== "succeeded") {
          record(2, "Requirement → G1 锁定", false, `clarify job ${clarifyJob.status}: ${clarifyJob.errorMsg ?? ""}`)
        } else {
          // 2b: 生成 PRD draft
          const answerRes = await api(`/api/projects/${projectId}/requirement/answer`, {
            method: "POST",
            body: JSON.stringify({ answers: { tech: "React+TS", features: "CRUD+搜索" } }),
          })
          if (answerRes.status !== 200 || !answerRes.body?.jobId) {
            record(2, "Requirement → G1 锁定", false, `answer 失败: HTTP ${answerRes.status}`)
          } else {
            const answerJob = await pollJob(answerRes.body.jobId, 180_000)
            if (answerJob.status !== "succeeded") {
              record(2, "Requirement → G1 锁定", false, `answer job ${answerJob.status}`)
            } else {
              // 2c: 锁定 PRD artifact
              const lockArtifact = await api(`/api/projects/${projectId}/artifacts/prd/lock`, { method: "POST" })
              if (lockArtifact.status !== 200) {
                record(2, "Requirement → G1 锁定", false, `锁 PRD artifact 失败: HTTP ${lockArtifact.status}`)
              } else {
                // 2d: 锁定 G1 gate
                const lockG1 = await api(`/api/projects/${projectId}/gates/G1/lock`, { method: "POST" })
                record(2, "Requirement → G1 锁定", lockG1.status === 200,
                  `G1 ${lockG1.status === 200 ? "已锁" : "失败"}: ${JSON.stringify(lockG1.body).slice(0, 100)}`)
              }
            }
          }
        }
      }
    } catch (e: any) {
      record(2, "Requirement → G1 锁定", false, e.message ?? String(e))
    }
  }

  // ── Step 3: 触发 design-agent 5 个 subtype ──────────────────
  // 断言 J0 PAGE/END markers + selfCheck score ≥70
  if (SKIP_LLM) {
    record(3, "Design 5 subtype", true, "跳过 — SKIP_LLM=1")
  } else {
    try {
      const designRes = await api(`/api/projects/${projectId}/design/generate-all`, { method: "POST" })
      if (designRes.status !== 200 || !designRes.body?.jobId) {
        record(3, "Design 5 subtype", false, `generate-all 失败: HTTP ${designRes.status}`)
      } else {
        const designJob = await pollJob(designRes.body.jobId, 600_000)
        if (designJob.status !== "succeeded") {
          record(3, "Design 5 subtype", false, `design job ${designJob.status}: ${designJob.errorMsg ?? ""}`)
        } else {
          // 3a: 检查 UI 产物中的 PAGE/END markers
          const uiPath = path.join(ROOT, "storage", "projects", projectId, "design", "ui-prototype.html")
          let markersOk = false
          let selfCheckScore = 0
          try {
            const html = await fs.readFile(uiPath, "utf-8")
            const pageMarkers = (html.match(/<!--\s*PAGE:/g) ?? []).length
            const endMarkers = (html.match(/<!--\s*END_UI\s*-->/g) ?? []).length
            markersOk = pageMarkers >= 6 && endMarkers >= 1

            // 3b: selfCheckUi 评分
            try {
              const { selfCheckUi } = await import("../src/agents/design-agent")
              const checkResult = await selfCheckUi(html)
              selfCheckScore = checkResult.score
            } catch { /* selfCheckUi 可能因 Pi SDK 模块解析失败，非致命 */ }
          } catch { /* UI 文件可能不存在 */ }

          record(3, "Design 5 subtype",
            markersOk && selfCheckScore >= 70,
            `PAGE=${(await readMarkerCount(uiPath, /<!--\s*PAGE:/g))} END=${(await readMarkerCount(uiPath, /<!--\s*END_UI\s*-->/g))} selfCheck=${selfCheckScore}`)
        }
      }
    } catch (e: any) {
      record(3, "Design 5 subtype", false, e.message ?? String(e))
    }
  }

  // ── Step 4: 锁定 5 个设计产物 → G2 ─────────────────────────
  try {
    const designTypes = ["design-summary", "design-detail", "design-api", "design-db", "design-ui"]
    let locksOk = 0
    for (const type of designTypes) {
      const r = await api(`/api/projects/${projectId}/artifacts/${type}/lock`, { method: "POST" })
      if (r.status === 200) locksOk++
    }
    const g2Res = await api(`/api/projects/${projectId}/gates/G2/lock`, { method: "POST" })
    record(4, "设计产物 → G2 锁定", locksOk === 5 && g2Res.status === 200,
      `产物 ${locksOk}/5 已锁, G2 ${g2Res.status === 200 ? "已锁" : "失败"}`)
  } catch (e: any) {
    record(4, "设计产物 → G2 锁定", false, e.message ?? String(e))
  }

  // ── Step 5: 触发 dev-agent → 断言 workspace 干净 ────────────
  if (SKIP_LLM) {
    record(5, "Dev agent + workspace 断言", true, "跳过 — SKIP_LLM=1")
  } else {
    try {
      const devRes = await api(`/api/projects/${projectId}/dev/run`, {
        method: "POST",
        body: JSON.stringify({ instruction: "完整生成项目代码" }),
      })
      if (devRes.status !== 200 || !devRes.body?.jobId) {
        record(5, "Dev agent + workspace 断言", false, `dev/run 失败: HTTP ${devRes.status}`)
      } else {
        const devJob = await pollJob(devRes.body.jobId, 600_000)
        if (devJob.status !== "succeeded") {
          record(5, "Dev agent + workspace 断言", false, `dev job ${devJob.status}: ${devJob.errorMsg ?? ""}`)
        } else {
          // 断言 workspace 无上下文镜像文件
          const wsDir = path.join(ROOT, "storage", "projects", projectId, "workspace")
          let mirrors: string[] = []
          let planExists = false
          let coverageExists = false
          try {
            const entries = await fs.readdir(wsDir, { recursive: false })
            const fileNames = entries.filter((e) => {
              const name = path.basename(e)
              return /^(prd|prior.?context|context|design-(summary|detail|api|db|ui))(-\d+)?\.(md|html)$/i.test(name)
            })
            mirrors = fileNames
            planExists = entries.some((e) => path.basename(e) === "PLAN.md")
            coverageExists = entries.some((e) => path.basename(e) === "COVERAGE.md")
          } catch { /* workspace 可能不存在 */ }

          const noMirrors = mirrors.length === 0
          record(5, "Dev agent + workspace 断言", noMirrors,
            `无上下文镜像=${noMirrors} PLAN.md=${planExists} COVERAGE.md=${coverageExists}${mirrors.length > 0 ? ` 泄露: ${mirrors.join(",")}` : ""}`)
        }
      }
    } catch (e: any) {
      record(5, "Dev agent + workspace 断言", false, e.message ?? String(e))
    }
  }

  // ── Step 6: /dev/confirm → 断言 ok:true ────────────────────
  try {
    const confirmRes = await api(`/api/projects/${projectId}/dev/confirm`, { method: "POST" })
    const ok = confirmRes.body?.ok === true
    const nextStage = confirmRes.body?.nextStage
    const warnings = confirmRes.body?.warnings ?? []
    record(6, "/dev/confirm", ok || warnings.length > 0,
      `ok=${confirmRes.body?.ok} nextStage=${nextStage ?? "N/A"} warnings=${warnings.length}条`)
    // builtOk=false 不阻断，仅 warning — 验证 J2 软化
    if (!ok && confirmRes.body?.reasons) {
      console.log(`    └ reasons: ${JSON.stringify(confirmRes.body.reasons)}`)
    }
  } catch (e: any) {
    record(6, "/dev/confirm", false, e.message ?? String(e))
  }

  // ── Step 7: /dev/tree + /dev/file → 代码浏览器可用 ──────────
  try {
    const treeRes = await api(`/api/projects/${projectId}/dev/tree`)
    const files: Array<{ path: string; isDirectory: boolean }> = treeRes.body?.files ?? []
    const treeOk = treeRes.status === 200 && files.length > 0

    let fileOk = false
    let fileDetail = ""
    // 找第一个非目录文件验证 /dev/file
    const firstFile = files.find((f) => !f.isDirectory)
    if (firstFile) {
      const fileRes = await api(`/api/projects/${projectId}/dev/file?path=${encodeURIComponent(firstFile.path)}`)
      fileOk = fileRes.status === 200 && fileRes.body?.content != null
      fileDetail = ` ${firstFile.path} content=${(fileRes.body?.content ?? "").length}chars`
    } else {
      fileDetail = " 无可读文件"
    }

    record(7, "/dev/tree + /dev/file", treeOk && (fileOk || files.every((f) => f.isDirectory)),
      `tree=${files.length}项${fileDetail}`)
  } catch (e: any) {
    record(7, "/dev/tree + /dev/file", false, e.message ?? String(e))
  }

  // ── 清理测试项目 ───────────────────────────────────────────
  if (projectId) {
    try {
      await api(`/api/projects/${projectId}`, { method: "DELETE" })
      console.log(`\n🧹 已清理测试项目 ${projectId.slice(0, 8)}...`)
    } catch { /* 忽略清理错误 */ }
  }

  sumUp()
}

async function readMarkerCount(filePath: string, re: RegExp): Promise<number> {
  try {
    const content = await fs.readFile(filePath, "utf-8")
    return (content.match(re) ?? []).length
  } catch { return 0 }
}

main()
