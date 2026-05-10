#!/usr/bin/env tsx
/**
 * J9.3: 批量给已有 markdown 文件注入 mermaid 主题 init 头。
 * 用法: pnpm exec tsx scripts/inject-mermaid-theme.ts [--dry-run]
 */
import fs from "node:fs"
import path from "node:path"

const DRY_RUN = process.argv.includes("--dry-run")

function injectTheme(md: string): string {
  const header = `%%{init: {
  'theme':'base',
  'themeVariables': {
    'primaryColor':'#eef2ff',     'primaryTextColor':'#1e1b4b',  'primaryBorderColor':'#6366f1',
    'secondaryColor':'#f5f5f5',   'tertiaryColor':'#fafafa',
    'lineColor':'#4f46e5',        'textColor':'#171717',
    'mainBkg':'#eef2ff',          'nodeBorder':'#6366f1',
    'clusterBkg':'#f5f5f5',       'clusterBorder':'#d4d4d4',
    'edgeLabelBackground':'#ffffff',
    'fontFamily':'ui-sans-serif, system-ui, -apple-system'
  }
}}%%\n`

  // 覆盖已有 init 头，或为无 init 的 mermaid 块补头
  return md.replace(
    /```mermaid\s*\n(?:%%\{\s*init:[^}]*\}\s*%%\s*\n)?/g,
    "```mermaid\n" + header,
  )
}

function walkDir(dir: string, exts: Set<string>): string[] {
  const results: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (["node_modules", ".git", ".next", "dist", ".turbo"].includes(e.name)) continue
      results.push(...walkDir(full, exts))
    } else if (exts.has(path.extname(e.name).toLowerCase())) {
      results.push(full)
    }
  }
  return results
}

async function main() {
  const root = path.resolve(process.cwd())
  const dirs = [
    path.join(root, "storage/projects"),
    path.join(root, "docs"),
  ]

  const mdExts = new Set([".md", ".html"])
  let total = 0
  let injected = 0

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      console.log(`[skip] ${dir} 不存在`)
      continue
    }
    const files = walkDir(dir, mdExts)
    for (const file of files) {
      total++
      const raw = fs.readFileSync(file, "utf-8")
      // 跳过不含 mermaid 块的文件
      if (!/```mermaid/.test(raw)) continue
      const themed = injectTheme(raw)
      if (themed === raw) continue
      injected++
      if (DRY_RUN) {
        console.log(`[dry-run] ${file}`)
      } else {
        fs.writeFileSync(file, themed, "utf-8")
        console.log(`[done] ${file}`)
      }
    }
  }

  console.log(`\n扫描 ${total} 文件，注入 ${injected} 个${DRY_RUN ? " (dry-run)" : ""}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
