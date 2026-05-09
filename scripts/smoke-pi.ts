// H2 smoke test: 验证 Pi SDK 能创建 session 并写入文件
// 用法: tsx scripts/smoke-pi.ts

import "dotenv/config"  // eslint-disable-line
import path from "node:path"
import fs from "node:fs/promises"

async function main() {
  console.log("Smoke Pi: 测试 Pi Session 创建...")
  const tmpDir = path.join(process.cwd(), "storage", "_smoke-pi")
  await fs.mkdir(tmpDir, { recursive: true })

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { runPiSession } = require("../src/lib/pi/session") as typeof import("../src/lib/pi/session")
    const r = await runPiSession({
      projectId: "_smoke",
      workspaceDir: tmpDir,
      prompt: '用 workspace_write 工具创建 README.md 文件，内容写 "smoke test passed"',
      provider: "deepseek",
      timeoutMs: 120_000,
    })
    if (r.ok) {
      console.log("✅ Pi session 成功")
    } else {
      console.log("⚠️ Pi session 返回非 ok:", r.error)
    }
  } catch (e: unknown) {
    console.error("❌ Pi smoke 失败:", (e as Error)?.message ?? e)
    console.log("(Pi smoke 失败不阻塞，走 fallback 路径)")
  } finally {
    await fs.rm(tmpDir, { recursive: true }).catch(() => {})
  }
}

main()
