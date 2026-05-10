import fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { stream } from "@/lib/llm/gateway"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import type { AgentRunCtx } from "@/agents/types"
import { DESIGN_SYSTEM } from "@/agents/prompts/design"
import { reopenFromGate } from "@/lib/hitl/gates"

const DESIGN_ORDER = ["summary", "detail", "api", "db", "ui"] as const
const PRIOR_CONTEXT_LIMIT = 8000

async function appendPlan(projectId: string, entry: string) {
  try {
    const filePath = paths.planPath(projectId)
    await fs.mkdir(dirname(filePath), { recursive: true })
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19)
    const line = `- [${timestamp}] ${entry}\n`
    let existing = ""
    try { existing = await fs.readFile(filePath, "utf-8") } catch { /* 文件不存在 */ }
    if (!existing) existing = "# 实施计划\n\n"
    await fs.writeFile(filePath, existing + line, "utf-8")
  } catch { /* 静默失败 */ }
}

async function upsertArtifact(
  projectId: string,
  type: string,
  content: string,
  storagePath: string,
  meta?: Record<string, unknown>,
) {
  const existing = await prisma.artifact.findFirst({
    where: { projectId, type },
    orderBy: { version: "desc" },
  })
  if (existing && !existing.locked) {
    await prisma.artifact.update({
      where: { id: existing.id },
      data: {
        storagePath,
        meta: meta ? J.stringify(meta) : null,
        version: existing.version + 1,
      },
    })
  } else {
    await prisma.artifact.create({
      data: {
        projectId,
        type,
        version: existing ? existing.version + 1 : 1,
        storagePath,
        meta: meta ? J.stringify(meta) : null,
      },
    })
  }
}

function getOutputExt(subtype: string): string {
  return subtype === "ui" ? "html" : "md"
}

function getOutputPath(projectId: string, subtype: string): string {
  return join(paths.design(projectId), `${subtype}.${getOutputExt(subtype)}`)
}

const END_MARKER_RE = /<!--\s*END:design-(\w+)\s*-->/

async function hasEndMarker(content: string, subtype: string): Promise<boolean> {
  return END_MARKER_RE.test(content)
}

async function loadPriorContext(projectId: string, currentSubtype: string): Promise<string> {
  const idx = DESIGN_ORDER.indexOf(currentSubtype as typeof DESIGN_ORDER[number])
  if (idx <= 0) return ""
  const parts: string[] = []
  for (let i = 0; i < idx; i++) {
    const path = getOutputPath(projectId, DESIGN_ORDER[i])
    try {
      const raw = await fs.readFile(path, "utf-8")
      const truncated = raw.slice(0, PRIOR_CONTEXT_LIMIT)
      parts.push(`=== 前置产物: ${DESIGN_ORDER[i]} ===\n${truncated}${raw.length > PRIOR_CONTEXT_LIMIT ? "\n...(截断)" : ""}`)
    } catch { /* 前置产物不存在则跳过 */ }
  }
  return parts.join("\n\n")
}

export async function generate(
  ctx: AgentRunCtx,
  subtype: string,
): Promise<string> {
  log("agent", `design:generate project=${ctx.projectId} subtype=${subtype}`)
  ctx.setPhase("thinking", `生成 ${subtype} 设计`)
  ctx.send("progress", {
    phase: `design-${subtype}`,
    message: `正在生成 ${subtype} 设计...`,
  })

  try {
    // 读取 PRD
    const prdPath = paths.prd(ctx.projectId)
    let prdContent = ""
    try {
      prdContent = await fs.readFile(prdPath, "utf-8")
    } catch {
      log("agent", `design:generate no PRD found at ${prdPath}`)
      ctx.send("error", { code: "E_PRD_NOT_FOUND", message: "PRD 不存在，请先生成 PRD" })
      throw new Error("PRD 不存在，请先生成 PRD")
    }

    const priorContext = await loadPriorContext(ctx.projectId, subtype)
    const systemPrompt = DESIGN_SYSTEM(subtype)
    let content = ""
    const MAX_CONTINUATIONS = 2

    // 构建首轮 user message，包含 PRD + 前置产物
    let userMessage = prdContent
    if (priorContext) {
      userMessage = `PRD 内容:\n\n${prdContent}\n\n---\n\n前置设计产物:\n\n${priorContext}\n\n请基于以上上下文生成 ${subtype} 设计。`
    }

    // 第一轮生成
    content = await streamOnce(ctx, subtype, systemPrompt, userMessage, content)

    // 自动续写：检查 END 标记，最多续写 3 次
    for (let i = 0; i < MAX_CONTINUATIONS; i++) {
      if (await hasEndMarker(content, subtype)) break

      ctx.send("progress", {
        phase: `design-${subtype}-continue`,
        message: `检测到截断，自动续写第 ${i + 1}/${MAX_CONTINUATIONS} 次...`,
      })
      log("agent", `design:generate continuation #${i + 1} for ${subtype}`)

      content = await streamOnce(
        ctx,
        subtype,
        systemPrompt,
        `请从上次中断处继续，不要重复已写内容。上次输出结尾:\n\n${content.slice(-500)}\n\n请继续完成剩余内容，完成后输出 <!-- END:design-${subtype} --> 标记。`,
        content,
      )
    }

    // 写入文件
    ctx.setPhase("writing", `写入 ${subtype} 文件`)
    const outputPath = getOutputPath(ctx.projectId, subtype)
    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, content, "utf-8")

    // Upsert artifact
    await upsertArtifact(
      ctx.projectId,
      `design-${subtype}`,
      content,
      outputPath,
      { subtype, truncated: !(await hasEndMarker(content, subtype)) },
    )

    // 更新 PLAN.md
    await appendPlan(ctx.projectId, `设计生成: ${subtype} (${content.length} 字符)`)
    void reopenFromGate(ctx.projectId, "G2").catch(() => {})

    ctx.send("result", { subtype, filePath: outputPath, length: content.length })
    log("agent", `design:generate done subtype=${subtype} length=${content.length}`)
    return content
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e)
    log("agent", `design:generate error=${msg}`)
    ctx.send("error", { code: "E_LLM_FAILED", message: msg })
    throw e
  }
}

/** 单次流式调用，支持追加模式 */
async function streamOnce(
  ctx: AgentRunCtx,
  subtype: string,
  systemPrompt: string,
  userMessage: string,
  existingContent: string,
): Promise<string> {
  const streamGen = stream({
    task: "reason-heavy",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  })

  let buffer = existingContent
  for await (const event of streamGen) {
    if (event.type === "delta" && event.text) {
      buffer += event.text
      ctx.send("text_delta", { text: event.text })
    } else if (event.type === "error") {
      throw new Error(event.error ?? "stream error")
    }
  }

  return buffer
}

export async function edit(
  ctx: AgentRunCtx,
  subtype: string,
  instruction: string,
): Promise<string> {
  log("agent", `design:edit project=${ctx.projectId} subtype=${subtype}`)
  ctx.send("progress", {
    phase: `design-edit-${subtype}`,
    message: `正在编辑 ${subtype} 设计...`,
  })

  try {
    // 读取现存设计产出
    const outputPath = getOutputPath(ctx.projectId, subtype)
    let existingContent = ""
    try {
      existingContent = await fs.readFile(outputPath, "utf-8")
    } catch {
      log("agent", `design:edit no existing ${subtype} design found, will create new`)
    }

    const prdPath = paths.prd(ctx.projectId)
    let prdContent = ""
    try {
      prdContent = await fs.readFile(prdPath, "utf-8")
    } catch {
      // 编辑模式不强制要求 PRD，但需要记录
      log("agent", `design:edit no PRD found, editing without PRD context`)
    }

    const systemPrompt = DESIGN_SYSTEM(subtype)
    const contextParts: string[] = []
    if (prdContent) contextParts.push(`PRD 内容:\n\n${prdContent}`)
    if (existingContent) contextParts.push(`当前设计产出:\n\n${existingContent}`)
    contextParts.push(`编辑指令: ${instruction}`)

    const streamGen = stream({
      task: "reason-heavy",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: contextParts.join("\n\n---\n\n") },
      ],
    })

    let content = ""
    for await (const event of streamGen) {
      if (event.type === "delta" && event.text) {
        content += event.text
        ctx.send("text_delta", { text: event.text })
      } else if (event.type === "error") {
        throw new Error(event.error ?? "stream error")
      }
    }

    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, content, "utf-8")

    await upsertArtifact(
      ctx.projectId,
      `design-${subtype}`,
      content,
      outputPath,
      { subtype, editInstruction: instruction },
    )

    // 更新 PLAN.md
    await appendPlan(ctx.projectId, `设计编辑: ${subtype} - ${instruction.slice(0, 80)}`)

    ctx.send("result", { subtype, filePath: outputPath, length: content.length })
    log("agent", `design:edit done subtype=${subtype} length=${content.length}`)
    return content
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e)
    log("agent", `design:edit error=${msg}`)
    ctx.send("error", { code: "E_LLM_FAILED", message: msg })
    throw e
  }
}

// J2: UI 原型自检 — 10 项检查清单，score < 70 自动补写
export async function selfCheckUi(html: string): Promise<{ score: number; missing: string[] }> {
  const CHECKLIST: Array<[string, RegExp | ((h: string) => boolean)]> = [
    ["含 design tokens CSS 变量", /:root\s*\{[^}]*--/],
    ["含 mock 数据 ≥12 条", (h: string) => (h.match(/id\s*:\s*['\"][\w-]+/g)?.length ?? 0) >= 12],
    ["含命令面板", /cmd\+k|command\s+palette/i],
    ["含主题切换", /toggle.*theme|dark[-\s]?mode/i],
    ["含语言切换", /i18n|locale|switch.*lang/i],
    ["含分页", /pagination|page-(prev|next)/i],
    ["含空状态", /empty[-\s]?state|暂无|没有数据/i],
    ["页面分隔注释", /<!--\s*PAGE:/],
    ["END_UI 标记", /<!--\s*END_UI\s*-->/],
    ["a11y aria-*", /aria-/],
  ]
  const missing: string[] = []
  let score = 0
  for (const [name, m] of CHECKLIST) {
    const ok = typeof m === "function" ? m(html) : m.test(html)
    if (ok) score += 10
    else missing.push(name)
  }
  return { score, missing }
}
