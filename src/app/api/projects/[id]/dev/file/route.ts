import { NextRequest, NextResponse } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { paths } from "@/config/paths"

const MAX_FILE = 1_048_576 // 1MB

function guardPath(target: string, rootDir: string): string {
  const resolved = path.resolve(rootDir, target)
  const normalizedRoot = path.resolve(rootDir) + path.sep
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(rootDir)) {
    throw new Error(`Path escape detected: ${target}`)
  }
  return resolved
}

function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const map: Record<string, string> = {
    ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
    ".json": "json", ".css": "css", ".html": "html", ".md": "markdown",
    ".prisma": "graphql", ".sql": "sql", ".yaml": "yaml", ".yml": "yaml",
    ".mjs": "javascript", ".cjs": "javascript",
  }
  return map[ext] ?? "plaintext"
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const filePath = req.nextUrl.searchParams.get("path")
  if (!filePath) return NextResponse.json({ error: "missing path param" }, { status: 400 })

  const dir = paths.workspace(params.id)
  const resolved = guardPath(filePath, dir)
  try {
    const stat = await fs.stat(resolved)
    if (stat.isDirectory()) return NextResponse.json({ error: "is a directory" }, { status: 400 })
    if (stat.size > MAX_FILE) {
      return NextResponse.json({ path: filePath, size: stat.size, mtime: stat.mtime.toISOString(), language: detectLanguage(filePath), content: null, truncated: true, maxSize: MAX_FILE })
    }
    const content = await fs.readFile(resolved, "utf-8")
    return NextResponse.json({ path: filePath, size: stat.size, mtime: stat.mtime.toISOString(), language: detectLanguage(filePath), content })
  } catch {
    return NextResponse.json({ error: "file not found" }, { status: 404 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { path: filePath, content } = await req.json() as { path?: string; content?: string }
  if (!filePath || content == null) return NextResponse.json({ error: "missing path or content" }, { status: 400 })

  const dir = paths.workspace(params.id)
  const resolved = guardPath(filePath, dir)
  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, content, "utf-8")
  return NextResponse.json({ ok: true, path: filePath })
}
