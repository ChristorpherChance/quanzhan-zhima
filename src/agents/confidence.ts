import { chat } from "@/lib/llm/gateway"
import { log } from "@/lib/log"

export async function confidenceFor(
  projectId: string,
  gateType: string,
): Promise<number> {
  try {
    const r = await chat({
      task: "review",
      messages: [
        {
          role: "system",
          content:
            `你是评审员。给定刚生成的产物，输出 0-1 之间的浮点 confidence。\n` +
            `标准：完整性、内部一致性、是否覆盖 PRD 全部 AC。\n` +
            `仅输出 JSON：{"score": number, "reasons": string[]}.`,
        },
        {
          role: "user",
          content: `项目 ${projectId} 的 Gate ${gateType} 产物已生成。请评分。`,
        },
      ],
      temperature: 0.1,
      maxTokens: 256,
    })
    const parsed = JSON.parse(r.text) as { score: number }
    return typeof parsed.score === "number" ? parsed.score : 0.5
  } catch (e: unknown) {
    log("agent", "confidence scoring failed, defaulting to 0.5", e)
    return 0.5
  }
}
