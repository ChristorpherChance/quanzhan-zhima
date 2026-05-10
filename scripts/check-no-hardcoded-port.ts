import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, extname } from "node:path"

const WHITELIST = new Set([
  "src/config/ports.ts",
  ".env.example",
  "README.md",
  "scripts/check-no-hardcoded-port.ts",
  "src/lib/pi/ui-templates.ts", // setTimeout 3000ms is a timeout, not a port
])

const SRC_EXTS = new Set([".ts", ".tsx", ".js", ".mjs", ".json"])
const PORT_PATTERN = /\b30(00|10|99|100|199|200|249)\b/g

function walk(dir: string, files: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, files)
    } else if (SRC_EXTS.has(extname(entry.name))) {
      files.push(full)
    }
  }
}

function run() {
  const allFiles: string[] = []
  walk(join(process.cwd(), "src"), allFiles)
  walk(join(process.cwd(), "scripts"), allFiles)
  walk(join(process.cwd(), "e2e"), allFiles)

  // root-level config files
  for (const f of ["playwright.config.ts", "next.config.mjs", "package.json"]) {
    allFiles.push(join(process.cwd(), f))
  }

  const errors: string[] = []

  const root = process.cwd().replace(/\\/g, "/")
  for (const abs of allFiles) {
    const rel = abs.replace(/\\/g, "/").replace(root + "/", "")
    if (WHITELIST.has(rel)) continue

    const content = readFileSync(abs, "utf-8")
    let match
    while ((match = PORT_PATTERN.exec(content)) !== null) {
      const lineNum = content.slice(0, match.index).split("\n").length
      errors.push(`${rel}:${lineNum}: ${match[0]}`)
    }
  }

  if (errors.length > 0) {
    console.error("❌ 发现硬编码端口，请替换为 PORTS 配置引用：")
    for (const e of errors) console.error(`  ${e}`)
    process.exit(1)
  }

  console.log("✓ 无硬编码端口")
}

run()
