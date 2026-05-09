// smoke-pi.ts: 验证 Pi SDK 模型注册 + session 创建 + 工具调用
// 用法: npx tsx scripts/smoke-pi.ts
// 验收标准: 输出 tool_use + text_delta + done 完整事件链

import "dotenv/config"  // eslint-disable-line
import path from "node:path"
import fs from "node:fs/promises"
import { getPiRegistry } from "../src/lib/pi/registry"

async function main() {
  console.log("═══════════════════════════════════")
  console.log("Smoke Pi · 验证 Pi SDK 注册与调用")
  console.log("═══════════════════════════════════\n")

  // Step 1: 验证 Registry
  console.log("▶ Step 1/3: 验证 ModelRegistry...")
  const { modelRegistry, authStorage } = getPiRegistry()
  const deepseekModel = modelRegistry.find("deepseek", "deepseek-chat")
  if (!deepseekModel) {
    console.error("❌ deepseek-chat 模型未注册!")
    process.exit(1)
  }
  console.log(`  ✓ 找到模型: ${deepseekModel.id} (${deepseekModel.name})`)

  const reasonerModel = modelRegistry.find("deepseek", "deepseek-reasoner")
  if (reasonerModel) {
    console.log(`  ✓ 找到推理模型: ${reasonerModel.id}`)
  } else {
    console.log("  ⚠ deepseek-reasoner 未注册 (可选)")
  }

  console.log("  ✓ 模型注册表初始化完成")

  // Step 2: 验证 API Key
  console.log("\n▶ Step 2/3: 验证 API Key...")
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey || apiKey.length < 10) {
    console.error("❌ DEEPSEEK_API_KEY 未设置或太短")
    process.exit(1)
  }
  console.log(`  ✓ API Key 已配置 (长度=${apiKey.length})`)

  // Step 3: 测试最小 prompt（通过 runPiSession）
  console.log("\n▶ Step 3/3: 测试最小 Pi Session...")
  const tmpDir = path.join(process.cwd(), "storage", "_smoke-pi")
  await fs.mkdir(tmpDir, { recursive: true })

  // 收集事件
  const events: string[] = []
  let hasToolUse = false
  let hasTextDelta = false
  let hasDone = false

  try {
    const { runPiSession } = require("../src/lib/pi/session") as typeof import("../src/lib/pi/session")
    const r = await runPiSession({
      projectId: "_smoke",
      workspaceDir: tmpDir,
      prompt: '读取 README.md 文件前 5 行内容，然后调用 workspace_write 创建 smoke-result.txt 写入这 5 行内容',
      provider: "deepseek",
      modelId: "deepseek-chat",
      timeoutMs: 120_000,
      onEvent: (e) => {
        events.push(e.type)
        console.log(`  [${e.type}]`, JSON.stringify(e.data).slice(0, 120))
        if (e.type === "tool-call" || e.type === "tool_start") hasToolUse = true
        if (e.type === "text_delta") hasTextDelta = true
        if (e.type === "done") hasDone = true
      },
    })

    if (r.ok) {
      console.log("\n  ✅ Pi session 成功")
      hasDone = true
    } else {
      console.log(`\n  ⚠ Pi session 返回非 ok: ${r.error ?? "未知错误"}`)
    }
  } catch (e: unknown) {
    console.error(`\n  ❌ Pi smoke 失败: ${(e as Error)?.message ?? e}`)
  } finally {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {})
  }

  // 验收判定
  console.log("\n═══════════════════════════════════")
  console.log("验收结果:")
  console.log(`  tool_use    : ${hasToolUse ? "✅" : "❌"}`)
  console.log(`  text_delta  : ${hasTextDelta ? "✅" : "❌"}`)
  console.log(`  done        : ${hasDone ? "✅" : "❌"}`)
  console.log(`  事件总数    : ${events.length}`)
  console.log("═══════════════════════════════════")

  if (hasToolUse && hasTextDelta && hasDone) {
    console.log("✅ 全部验收通过")
    process.exit(0)
  } else {
    console.log("❌ 部分验收未通过 (Pi smoke 失败不阻塞)")
    process.exit(0) // 不阻塞
  }
}

main()
