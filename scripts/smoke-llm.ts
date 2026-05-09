// H2 smoke test: 验证 LLM 网关能调 Deepseek
// 用法: tsx scripts/smoke-llm.ts

import "dotenv/config"  // eslint-disable-line
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { chat } = require("../src/lib/llm/gateway") as typeof import("../src/lib/llm/gateway")

async function main() {
  console.log("Smoke LLM: 测试 Deepseek 连通性...")
  try {
    const r = await chat({
      task: "clarify",
      messages: [
        { role: "system", content: "你是一个助手，请用 JSON 回复。" },
        { role: "user", content: '回复 {"ok":true,"msg":"hello"}' },
      ],
      temperature: 0.1,
      maxTokens: 64,
    })
    console.log(`✅ LLM 联通: model=${r.model}, tokens in=${r.tokensIn}, out=${r.tokensOut}`)
    console.log(`   Response: ${r.text.slice(0, 80)}`)
  } catch (e: unknown) {
    console.error("❌ LLM smoke 失败:", (e as Error)?.message ?? e)
    process.exit(1)
  }
}

main()
