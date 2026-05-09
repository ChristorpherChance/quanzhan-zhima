import { withErrorBoundary } from "@/lib/errors"
import { eggSchema } from "@/lib/api-schemas"
import { prisma } from "@/lib/db/prisma"
import { startJob } from "@/agents/orchestrator"
import { draft } from "@/agents/requirement-agent"
import { generate } from "@/agents/design-agent"
import { NextRequest } from "next/server"

export const POST = withErrorBoundary(async (req: NextRequest) => {
  const body = eggSchema.parse(await req.json())

  // Create project with auto HITL mode
  const project = await prisma.project.create({
    data: {
      name: `彩蛋: ${body.oneLiner.slice(0, 30)}`,
      oneLiner: body.oneLiner,
      seedType: "egg",
      hitlMode: "auto",
      currentStage: "requirement",
    },
  })

  // Kick off parallel: draft PRD + generate UI prototype
  const job = await startJob({
    projectId: project.id,
    agentType: "requirement",
    type: "draft",
    run: async (ctx) => {
      // Use default answers to skip clarify
      const defaultAnswers: Record<string, string> = {
        "目标用户是谁？": "现场观众（演示用，1 用户即可）",
        "最关键的 1 个使用场景？": body.oneLiner,
        "是否需要持久化？": "内存即可",
        "是否需要导出？": "先不导出",
        "现场演示要看到什么？": "一个能交互的单页",
      }
      const _prdResult = await draft(ctx, body.oneLiner, defaultAnswers)
      ctx.send("log", { line: "PRD 起草完成，开始生成 UI 原型..." })

      // Also trigger UI generation
      try {
        await generate(ctx, "ui")
      } catch (e: unknown) {
        ctx.send("log", { line: `UI 原型生成失败: ${String((e as Error)?.message ?? e)}，使用 fallback` })
      }
    },
  })

  return { projectId: project.id, jobId: job.id }
})
