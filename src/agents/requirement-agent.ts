import fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { chat, stream } from "@/lib/llm/gateway"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import type { AgentRunCtx } from "@/agents/types"
import {
  REQUIREMENT_SYSTEM,
  REQUIREMENT_CLARIFY_USER,
  REQUIREMENT_DRAFT_USER,
  REQUIREMENT_EDIT_USER,
} from "@/agents/prompts/requirement"
import { RED_LINES_BLOCK } from "@/agents/prompts/_red-lines"
import { stripMetaTalk } from "@/agents/utils/strip-meta"
import { buildSystemPrompt, loadAgentConfig } from "@/agents/registry"
import { runPiSession, type PiSessionEvent } from "@/lib/pi/session"

async function getSystemPrompt(projectId: string): Promise<string> {
  return buildSystemPrompt("requirement", projectId, RED_LINES_BLOCK + "\n\n" + REQUIREMENT_SYSTEM)
}

async function appendRequirements(projectId: string, entry: string) {
  try {
    const filePath = paths.requirementsPath(projectId)
    await fs.mkdir(dirname(filePath), { recursive: true })
    const timestamp = new Date().toISOString().replace("T", " ").slice(0, 19)
    const line = `- [${timestamp}] ${entry}\n`
    let existing = ""
    try { existing = await fs.readFile(filePath, "utf-8") } catch { /* 文件不存在 */ }
    if (!existing) existing = "# 需求记录\n\n"
    await fs.writeFile(filePath, existing + line, "utf-8")
  } catch (e) {
    console.error("[requirement-agent] appendRequirements failed:", (e as Error)?.message ?? e)
  }
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

async function autoLockArtifact(projectId: string, type: string) {
  try {
    const a = await prisma.artifact.findFirst({
      where: { projectId, type },
      orderBy: { version: "desc" },
    })
    if (a && !a.locked) {
      await prisma.artifact.update({
        where: { id: a.id },
        data: { locked: true, lockedAt: new Date() },
      })
    }
  } catch (e) {
    console.error("[requirement-agent] autoLockArtifact failed:", (e as Error)?.message ?? e)
  }
}

async function loadUploadedDocs(projectId: string): Promise<string> {
  const uploads = await prisma.artifact.findMany({
    where: { projectId, type: "requirement-upload" },
    orderBy: { version: "asc" },
  })
  if (uploads.length === 0) return ""

  const contents: string[] = []
  for (const u of uploads) {
    try {
      const raw = await fs.readFile(u.storagePath, "utf-8")
      const meta = u.meta ? JSON.parse(u.meta as string) : {}
      contents.push(`=== 上传文档: ${meta.originalName ?? "未知"} ===\n${raw.slice(0, 8000)}`)
    } catch { /* skip missing files */ }
  }
  return contents.join("\n\n")
}

export async function clarify(
  ctx: AgentRunCtx,
  oneLiner: string,
  extra?: string,
): Promise<string[]> {
  log("agent", `requirement:clarify project=${ctx.projectId}`)
  ctx.setPhase("thinking", "分析需求")
  ctx.send("progress", { phase: "clarify", message: "正在分析需求，生成探索性问题..." })

  // 加载上传文档
  const uploadedDocs = await loadUploadedDocs(ctx.projectId)
  let userMessage = REQUIREMENT_CLARIFY_USER(oneLiner, extra)
  if (uploadedDocs) {
    userMessage = `以下为用户上传的需求文档:\n\n${uploadedDocs}\n\n---\n\n${userMessage}`
  }

  try {
    const res = await chat({
      task: "clarify",
      messages: [
        { role: "system", content: await getSystemPrompt(ctx.projectId) },
        { role: "user", content: userMessage },
      ],
    })

    let questions: string[] = []
    try {
      // 尝试从响应中提取 JSON（可能包裹在 markdown 代码块中）
      const jsonMatch = res.text.match(/```(?:json)?\s*([\s\S]*?)```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : res.text.trim()
      const parsed = JSON.parse(jsonStr) as { questions?: string[] } | string[]
      questions = Array.isArray(parsed) ? parsed : (parsed.questions ?? [])
    } catch {
      // 回退：按行分割提取问题
      questions = res.text
        .split("\n")
        .map((l) => l.replace(/^\d+[\.\、\)]\s*/, "").trim())
        .filter((l) => l.length > 5 && (l.endsWith("？") || l.endsWith("?")))
    }

    ctx.send("result", { questions })
    log("agent", `requirement:clarify done questions=${questions.length}`)
    return questions
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e)
    log("agent", `requirement:clarify error=${msg}`)
    ctx.send("error", { code: "E_LLM_FAILED", message: msg })
    throw e
  }
}

export async function draft(
  ctx: AgentRunCtx,
  oneLiner: string,
  answers: Record<string, string>,
): Promise<string> {
  log("agent", `requirement:draft project=${ctx.projectId}`)
  ctx.setPhase("thinking", "生成 PRD 文档")
  ctx.send("progress", { phase: "draft", message: "正在生成 PRD 文档..." })

  // 加载上传文档
  const uploadedDocs = await loadUploadedDocs(ctx.projectId)
  let userMessage = REQUIREMENT_DRAFT_USER(oneLiner, answers)
  if (uploadedDocs) {
    userMessage = `以下为用户上传的需求文档:\n\n${uploadedDocs}\n\n---\n\n${userMessage}`
  }

  try {
    const systemPrompt = await getSystemPrompt(ctx.projectId)

    // K6: Pi 生成模式
    const filePath = paths.prd(ctx.projectId)
    const workspaceDir = join(paths.workspace(ctx.projectId), "requirement", "draft")
    await fs.mkdir(workspaceDir, { recursive: true })
    // 写入上下文文件
    if (uploadedDocs) await fs.writeFile(join(workspaceDir, "UPLOADED_DOCS.md"), uploadedDocs, "utf-8")
    if (oneLiner) await fs.writeFile(join(workspaceDir, "ONELINER.txt"), oneLiner, "utf-8")

    const cfg = await loadAgentConfig("requirement")
    let content = ""
    let piOk = false

    try {
      const r = await runPiSession({
        projectId: ctx.projectId,
        workspaceDir,
        prompt: `请基于上传的需求文档和项目简述，生成完整的 PRD 文档，输出到 prd.md。完成后追加 <!-- END:requirement --> 标记。\n\n${userMessage}`,
        provider: cfg.provider as "deepseek" | "anthropic" | "kimi" | "xiaomi" | "openai",
        modelId: cfg.modelId,
        timeoutMs: cfg.timeoutMs,
        systemPromptOverride: systemPrompt,
        onEvent: (e: PiSessionEvent) => {
          if (e.type === "text_delta") {
            const d = e.data as { text?: string }
            if (d?.text) ctx.send("text_delta", { text: d.text })
          }
        },
      })
      piOk = r.ok
      if (r.ok) {
        try { content = await fs.readFile(join(workspaceDir, "prd.md"), "utf-8") } catch { content = "" }
      }
    } catch { /* Pi 失败 */ }

    // Fallback to gateway.stream()
    if (!piOk || !content) {
      ctx.send("log", { line: "Pi 不可用，回退到传统流式生成 PRD" })
      const streamGen = stream({
        task: "reason-heavy",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      })

      for await (const event of streamGen) {
        if (event.type === "delta" && event.text) {
          content += event.text
          ctx.send("text_delta", { text: event.text })
        } else if (event.type === "error") {
          throw new Error(event.error ?? "stream error")
        }
      }

      const mdMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
      if (mdMatch) {
        content = mdMatch[1]
      }
    }

    content = stripMetaTalk(content)

    // 写入文件
    ctx.setPhase("writing", "写入 PRD 文档")
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf-8")

    // Upsert artifact
    await upsertArtifact(ctx.projectId, "prd", content, filePath, {
      oneLiner,
      answerCount: Object.keys(answers).length,
    })

    // 自动锁定 PRD
    await autoLockArtifact(ctx.projectId, "prd")

    // 追加到 REQUIREMENTS.md
    await appendRequirements(ctx.projectId, `PRD 生成完成 (${content.length} 字符)`)

    ctx.send("result", { filePath, length: content.length })
    log("agent", `requirement:draft done length=${content.length}`)
    return content
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e)
    log("agent", `requirement:draft error=${msg}`)
    ctx.send("error", { code: "E_LLM_FAILED", message: msg })
    throw e
  }
}

export async function edit(
  ctx: AgentRunCtx,
  instruction: string,
  section?: string,
): Promise<string> {
  log("agent", `requirement:edit project=${ctx.projectId} section=${section ?? "all"}`)
  ctx.send("progress", { phase: "edit", message: "正在编辑 PRD..." })

  try {
    // 读取现存的 PRD
    const filePath = paths.prd(ctx.projectId)
    let existingContent = ""
    try {
      existingContent = await fs.readFile(filePath, "utf-8")
    } catch {
      log("agent", `requirement:edit no existing PRD found, will create new`)
    }

    const systemPrompt = await getSystemPrompt(ctx.projectId)
    const userMessage = REQUIREMENT_EDIT_USER(instruction, section)

    // K6: Pi 编辑模式
    const workspaceDir = join(paths.workspace(ctx.projectId), "requirement", "edit")
    await fs.mkdir(workspaceDir, { recursive: true })
    if (existingContent) await fs.writeFile(join(workspaceDir, "prd.md"), existingContent, "utf-8")

    const cfg = await loadAgentConfig("requirement")
    let content = ""
    let piOk = false

    try {
      const r = await runPiSession({
        projectId: ctx.projectId,
        workspaceDir,
        prompt: existingContent
          ? `编辑 PRD。${userMessage}\n请修改 prd.md 并保存。完成后追加 <!-- END:requirement --> 标记。`
          : `生成 PRD。${userMessage}\n请输出到 prd.md。完成后追加 <!-- END:requirement --> 标记。`,
        provider: cfg.provider as "deepseek" | "anthropic" | "kimi" | "xiaomi" | "openai",
        modelId: cfg.modelId,
        timeoutMs: cfg.timeoutMs,
        systemPromptOverride: systemPrompt,
        onEvent: (e: PiSessionEvent) => {
          if (e.type === "text_delta") {
            const d = e.data as { text?: string }
            if (d?.text) ctx.send("text_delta", { text: d.text })
          }
        },
      })
      piOk = r.ok
      if (r.ok) {
        try { content = await fs.readFile(join(workspaceDir, "prd.md"), "utf-8") } catch { content = "" }
      }
    } catch { /* Pi 失败 */ }

    // Fallback to gateway.stream()
    if (!piOk || !content) {
      ctx.send("log", { line: "Pi 不可用，回退到传统流式编辑 PRD" })
      const fullUserMessage = existingContent
        ? `当前 PRD 内容:\n\n${existingContent}\n\n---\n\n${userMessage}`
        : userMessage

      const streamGen = stream({
        task: "reason-heavy",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: fullUserMessage },
        ],
      })

      for await (const event of streamGen) {
        if (event.type === "delta" && event.text) {
          content += event.text
          ctx.send("text_delta", { text: event.text })
        } else if (event.type === "error") {
          throw new Error(event.error ?? "stream error")
        }
      }
      const mdMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
      if (mdMatch) {
        content = mdMatch[1]
      }
    }

    content = stripMetaTalk(content)

    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf-8")

    await upsertArtifact(ctx.projectId, "prd", content, filePath, {
      editInstruction: instruction,
      editSection: section ?? null,
    })

    // 自动锁定 PRD
    await autoLockArtifact(ctx.projectId, "prd")

    // 追加到 REQUIREMENTS.md
    await appendRequirements(ctx.projectId, `PRD 编辑: ${instruction.slice(0, 80)}`)

    ctx.send("result", { filePath, length: content.length })
    log("agent", `requirement:edit done length=${content.length}`)
    return content
  } catch (e: unknown) {
    const msg = String((e as Error)?.message ?? e)
    log("agent", `requirement:edit error=${msg}`)
    ctx.send("error", { code: "E_LLM_FAILED", message: msg })
    throw e
  }
}
