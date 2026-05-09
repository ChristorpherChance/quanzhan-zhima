import fs from "node:fs/promises"
import { dirname, join } from "node:path"
import { stream } from "@/lib/llm/gateway"
import { prisma } from "@/lib/db/prisma"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"
import { J } from "@/lib/db/json"
import type { AgentRunCtx } from "@/agents/types"
import { DESIGN_SYSTEM } from "@/agents/prompts/design"

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

export async function generate(
  ctx: AgentRunCtx,
  subtype: string,
): Promise<string> {
  log("agent", `design:generate project=${ctx.projectId} subtype=${subtype}`)
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

    const systemPrompt = DESIGN_SYSTEM(subtype)
    const streamGen = stream({
      task: "reason-heavy",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `以下为 PRD 内容，请据此生成 ${subtype} 设计方案:\n\n${prdContent}`,
        },
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

    // 写入文件
    const outputPath = getOutputPath(ctx.projectId, subtype)
    await fs.mkdir(dirname(outputPath), { recursive: true })
    await fs.writeFile(outputPath, content, "utf-8")

    // Upsert artifact
    await upsertArtifact(
      ctx.projectId,
      `design-${subtype}`,
      content,
      outputPath,
      { subtype },
    )

    // 更新 PLAN.md
    await appendPlan(ctx.projectId, `设计生成: ${subtype} (${content.length} 字符)`)

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
