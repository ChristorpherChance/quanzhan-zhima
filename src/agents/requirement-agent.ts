import fs from "node:fs/promises"
import { dirname } from "node:path"
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

export async function clarify(
  ctx: AgentRunCtx,
  oneLiner: string,
  extra?: string,
): Promise<string[]> {
  log("agent", `requirement:clarify project=${ctx.projectId}`)
  ctx.setPhase("thinking", "分析需求")
  ctx.send("progress", { phase: "clarify", message: "正在分析需求，生成探索性问题..." })

  const userMessage = REQUIREMENT_CLARIFY_USER(oneLiner, extra)

  try {
    const res = await chat({
      task: "clarify",
      messages: [
        { role: "system", content: REQUIREMENT_SYSTEM },
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

  const userMessage = REQUIREMENT_DRAFT_USER(oneLiner, answers)

  try {
    const streamGen = stream({
      task: "reason-heavy",
      messages: [
        { role: "system", content: REQUIREMENT_SYSTEM },
        { role: "user", content: userMessage },
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

    // 如果 LLM 返回的内容包裹在 markdown 代码块中，去掉外层包裹
    const mdMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
    if (mdMatch) {
      content = mdMatch[1]
    }

    // 写入文件
    ctx.setPhase("writing", "写入 PRD 文档")
    const filePath = paths.prd(ctx.projectId)
    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf-8")

    // Upsert artifact
    await upsertArtifact(ctx.projectId, "prd", content, filePath, {
      oneLiner,
      answerCount: Object.keys(answers).length,
    })

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

    const userMessage = REQUIREMENT_EDIT_USER(instruction, section)
    const fullUserMessage = existingContent
      ? `当前 PRD 内容:\n\n${existingContent}\n\n---\n\n${userMessage}`
      : userMessage

    const streamGen = stream({
      task: "reason-heavy",
      messages: [
        { role: "system", content: REQUIREMENT_SYSTEM },
        { role: "user", content: fullUserMessage },
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
    const mdMatch = content.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/)
    if (mdMatch) {
      content = mdMatch[1]
    }

    await fs.mkdir(dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, "utf-8")

    await upsertArtifact(ctx.projectId, "prd", content, filePath, {
      editInstruction: instruction,
      editSection: section ?? null,
    })

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
