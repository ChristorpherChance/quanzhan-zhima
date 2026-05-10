/**
 * J6: Agent 配置种子脚本
 * 将 4 个内置 Agent 的默认配置写入 AgentConfig 表
 * 运行: npx tsx prisma/seed-agents.ts
 */
import { PrismaClient } from "@prisma/client"
import { listAgents, type AgentConfig } from "@/agents/registry"

const prisma = new PrismaClient()

async function main() {
  console.log("Agent 配置种子初始化...\n")

  const agents = listAgents()

  for (const agent of agents) {
    const row = await prisma.agentConfig.upsert({
      where: { key: agent.key },
      create: {
        key: agent.key,
        label: agent.label,
        description: agent.description,
        stage: agent.stage,
        modelId: agent.modelId,
        provider: agent.provider,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        timeoutMs: agent.timeoutMs,
        enabled: agent.enabled,
      },
      update: {
        label: agent.label,
        description: agent.description,
        stage: agent.stage,
        modelId: agent.modelId,
        provider: agent.provider,
        temperature: agent.temperature,
        maxTokens: agent.maxTokens,
        timeoutMs: agent.timeoutMs,
        enabled: agent.enabled,
      },
    })
    console.log(`  [OK] ${row.label} (${row.key}) → ${row.provider}/${row.modelId}`)
  }

  console.log(`\n完成! ${agents.length} 个 Agent 配置已写入。`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("Agent 种子失败:", e)
  process.exit(1)
})
