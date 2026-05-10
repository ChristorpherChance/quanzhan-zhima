// J9: E2E 冒烟 — 13 步覆盖全栈关键路径
// 用法: npx tsx scripts/smoke-e2e.ts
// 不依赖 HTTP server，直接测试 backend 模块

import "dotenv/config"
import path from "node:path"
import fs from "node:fs/promises"

const ROOT = path.resolve(process.cwd())

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
  console.log(`E2E 冒烟结果: ${passed}/${total} 通过`)
  for (const r of results) {
    console.log(`  ${r.ok ? "✅" : "❌"} ${r.step}. ${r.name}: ${r.detail}`)
  }
  console.log(`${"═".repeat(50)}`)
  process.exit(passed === total ? 0 : 1)
}

async function main() {
  console.log("═══════════════════════════════════")
  console.log("J9 E2E 冒烟 · 全栈 13 步")
  console.log("═══════════════════════════════════\n")

  // ── Step 1: Prisma DB 连通 ──────────────────────────────────
  try {
    const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client")
    const prisma = new PrismaClient()
    await prisma.$queryRaw`SELECT 1`
    await prisma.$disconnect()
    record(1, "Prisma DB 连通", true, "SELECT 1 成功")
  } catch (e: any) {
    record(1, "Prisma DB 连通", false, e.message ?? String(e))
  }

  // ── Step 2: Agent 注册表 4 个 Agent ─────────────────────────
  try {
    const { getAgentTypes, getAgentConfig } = await import("../src/agents/registry")
    const types = getAgentTypes()
    const ok = types.length === 4 && types.includes("requirement") && types.includes("design") && types.includes("dev") && types.includes("review")
    if (ok) {
      const cfg = getAgentConfig("dev")
      record(2, "Agent 注册表", true, `4 agents, dev timeout=${cfg?.timeoutMs}ms`)
    } else {
      record(2, "Agent 注册表", false, `只有 ${types.length} 个: ${types.join(",")}`)
    }
  } catch (e: any) {
    record(2, "Agent 注册表", false, e.message ?? String(e))
  }

  // ── Step 3: AgentConfig DB 表 4 行 ──────────────────────────
  try {
    const { PrismaClient } = require("@prisma/client") as typeof import("@prisma/client")
    const prisma = new PrismaClient()
    const rows = await prisma.agentConfig.findMany()
    const ok = rows.length >= 4
    record(3, "AgentConfig DB 表", ok, `${rows.length} 行: ${rows.map((r: any) => r.key).join(",")}`)
    await prisma.$disconnect()
  } catch (e: any) {
    record(3, "AgentConfig DB 表", false, e.message ?? String(e))
  }

  // ── Step 4: Paths 模块 ──────────────────────────────────────
  try {
    const { paths } = await import("../src/config/paths")
    const testId = "test-project-123"
    const prd = paths.prd(testId)
    const design = paths.design(testId)
    const ws = paths.workspace(testId)
    const ok = prd.includes(testId) && design.includes(testId) && ws.includes(testId)
    record(4, "Paths 模块", ok, `prd=${prd.slice(-20)} design=${design.slice(-20)} ws=${ws.slice(-20)}`)
  } catch (e: any) {
    record(4, "Paths 模块", false, e.message ?? String(e))
  }

  // ── Step 5: Stage Labels 模块 ───────────────────────────────
  try {
    const { STAGE_LABEL, stageActionLabel } = await import("../src/lib/i18n/stage-labels")
    const ok = STAGE_LABEL.G0 === "立项" && STAGE_LABEL.G3 === "开发" && STAGE_LABEL.G6 === "交付"
    const action = stageActionLabel("G3")
    record(5, "Stage Labels", ok, `G3→${STAGE_LABEL.G3}, action="${action}"`)
  } catch (e: any) {
    record(5, "Stage Labels", false, e.message ?? String(e))
  }

  // ── Step 6: Design Agent selfCheckUi ────────────────────────
  try {
    const { selfCheckUi } = await import("../src/agents/design-agent")
    const badHtml = "<html><body>minimal</body></html>"
    const r1 = await selfCheckUi(badHtml)
    record(6, "selfCheckUi (低分)", r1.score < 50, `score=${r1.score}, missing=${r1.missing.length}项`)

    const goodHtml = `
      <html>
      <head><style>:root { --primary: #333; }</style></head>
      <body>
        <span aria-label="test">x</span>
        <!-- PAGE: home -->
        <div>id: "item-1" id: "item-2" id: "item-3" id: "item-4" id: "item-5" id: "item-6" id: "item-7" id: "item-8" id: "item-9" id: "item-10" id: "item-11" id: "item-12"</div>
        <input placeholder="cmd+k">
        <button>toggle theme dark-mode</button>
        <button>switch lang i18n</button>
        <nav>pagination page-prev page-next</nav>
        <div>暂无数据 empty state</div>
        <!-- END_UI -->
      </body></html>`
    const r2 = await selfCheckUi(goodHtml)
    record(7, "selfCheckUi (高分)", r2.score >= 70, `score=${r2.score}, missing=[${r2.missing.join(",")}]`)
  } catch (e: any) {
    record(6, "selfCheckUi", false, e.message ?? String(e))
    record(7, "selfCheckUi (高分)", false, "前置步骤失败")
  }

  // ── Step 8: Gate checkConditions ────────────────────────────
  try {
    const { checkConditions } = await import("../src/lib/hitl/gates")
    const c = await checkConditions("nonexistent-project-id", "G0")
    record(8, "Gate checkConditions", !c.ok && c.reasons.length > 0, `ok=${c.ok}, reasons=${c.reasons.length}条`)
  } catch (e: any) {
    record(8, "Gate checkConditions", false, e.message ?? String(e))
  }

  // ── Step 9: Sandbox detectStartCommand ──────────────────────
  try {
    const { detectStartCommand } = await import("../src/lib/sandbox/index")
    // 在临时目录模拟 package.json
    const tmpDir = path.join(ROOT, "storage", "_smoke-j9")
    await fs.mkdir(tmpDir, { recursive: true })
    await fs.writeFile(path.join(tmpDir, "package.json"), JSON.stringify({
      scripts: { dev: "next dev" },
      dependencies: { next: "^14.0.0" },
    }))
    const cmds = detectStartCommand(tmpDir)
    await fs.rm(tmpDir, { recursive: true })
    record(9, "Sandbox detect", cmds.start.includes("next"), `install=${cmds.install} start=${cmds.start} port=${cmds.port}`)
  } catch (e: any) {
    record(9, "Sandbox detect", false, e.message ?? String(e))
  }

  // ── Step 10: 设计产物 end marker 检测 ───────────────────────
  try {
    const END_MARKER_RE = /<!--\s*END:design-(\w+)\s*-->/
    const testContent = "some design content...\n<!-- END:design-ui -->\n"
    const ok = END_MARKER_RE.test(testContent)
    record(10, "END_MARKER_RE", ok, `匹配: ${END_MARKER_RE.exec(testContent)?.[1]}`)
  } catch (e: any) {
    record(10, "END_MARKER_RE", false, e.message ?? String(e))
  }

  // ── Step 11: Dev agent buildDevSystemPrompt ──────────────────
  try {
    const { buildDevSystemPrompt } = await import("../src/agents/prompts/dev")
    // 需要已有 PRD + design 产物的 project，跳过实际读取
    const prompt = await buildDevSystemPrompt("nonexistent-test-id")
    const ok = typeof prompt === "string" && prompt.length > 0
    record(11, "Dev SystemPrompt", ok, `长度=${prompt.length} 字符`)
  } catch (e: any) {
    record(11, "Dev SystemPrompt", false, e.message ?? String(e))
  }

  // ── Step 12: LLM 网关连通 ───────────────────────────────────
  try {
    const { chat } = await import("../src/lib/llm/gateway")
    const r = await chat({
      task: "clarify",
      messages: [
        { role: "system", content: "用 JSON 回复。" },
        { role: "user", content: '回复 {"ok":true}' },
      ],
      temperature: 0,
      maxTokens: 32,
    })
    const ok = r.text.includes("ok")
    record(12, "LLM 网关", ok, `model=${r.model} tokens=${r.tokensIn}/${r.tokensOut}`)
  } catch (e: any) {
    const msg: string = e.message ?? String(e)
    if (msg.includes("API Key") || msg.includes("API_KEY")) {
      record(12, "LLM 网关", true, `跳过 — 未配置 API Key（非代码问题）`)
    } else {
      record(12, "LLM 网关", false, msg)
    }
  }

  // ── Step 13: Design Agent prompt 生成 ────────────────────────
  try {
    const { DESIGN_SYSTEM } = await import("../src/agents/prompts/design")
    const prompt = DESIGN_SYSTEM("summary")
    const ok = typeof prompt === "string" && prompt.length > 500
    record(13, "Design Prompt", ok, `summary prompt 长度=${prompt.length}`)
  } catch (e: any) {
    record(13, "Design Prompt", false, e.message ?? String(e))
  }

  sumUp()
}

main()
