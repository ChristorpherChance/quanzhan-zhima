import { execSync } from "node:child_process"

const checks: Array<{ name: string; cmd: string; required: boolean }> = [
  { name: "node", cmd: "node --version", required: true },
  { name: "pnpm", cmd: "pnpm --version", required: true },
  { name: "git", cmd: "git --version", required: true },
  { name: "pandoc", cmd: "pandoc --version 2>&1 | head -1", required: false },
  { name: "xelatex", cmd: "xelatex --version 2>&1 | head -1", required: false },
]

let hardFail = false
for (const c of checks) {
  try {
    const out = execSync(c.cmd, { stdio: ["ignore", "pipe", "ignore"], shell: "bash" }).toString().trim()
    console.log(`✅ ${c.name.padEnd(8)} ${out}`)
  } catch {
    const tag = c.required ? "❌" : "⚠️"
    console.log(`${tag} ${c.name.padEnd(8)} 未安装`)
    if (c.required) hardFail = true
  }
}

const envs = ["DEEPSEEK_API_KEY"]
for (const e of envs) {
  if (!process.env[e]) { console.log(`❌ env ${e} 未设置`); hardFail = true }
  else console.log(`✅ env ${e} OK`)
}

if (hardFail) { console.error("verify failed"); process.exit(1) }
console.log("环境检查通过")
