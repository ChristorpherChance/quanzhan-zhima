import { NextRequest } from "next/server"
import fs from "node:fs/promises"
import path from "node:path"
import { paths } from "@/config/paths"

function guardPath(target: string, rootDir: string): string {
  const resolved = path.resolve(rootDir, target)
  const normalizedRoot = path.resolve(rootDir) + path.sep
  if (!resolved.startsWith(normalizedRoot) && resolved !== path.resolve(rootDir)) {
    throw new Error(`Path escape detected: ${target}`)
  }
  return resolved
}

const MAX_SIZE = 1_048_576 // 1 MB

export const GET = async (
  _req: NextRequest,
  { params }: { params: { id: string; path: string[] } },
) => {
  const workspaceDir = paths.workspace(params.id)
  const filePath = params.path.join("/")

  let resolved: string
  try {
    resolved = guardPath(filePath, workspaceDir)
  } catch {
    return Response.json({ error: "Invalid path" }, { status: 403 })
  }

  try {
    const stat = await fs.stat(resolved)
    if (stat.isDirectory()) {
      return Response.json({ error: "Path is a directory" }, { status: 400 })
    }

    if (stat.size > MAX_SIZE) {
      return Response.json({
        truncated: true,
        size: stat.size,
        maxSize: MAX_SIZE,
        hint: `文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，仅显示元数据`,
        content: null,
      })
    }

    const content = await fs.readFile(resolved, "utf-8")
    const ext = path.extname(resolved).toLowerCase()
    // Map extension to language for Monaco
    const langMap: Record<string, string> = {
      ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
      ".json": "json", ".html": "html", ".css": "css", ".md": "markdown",
      ".prisma": "graphql", ".sql": "sql", ".yaml": "yaml", ".yml": "yaml",
      ".env": "plaintext", ".gitignore": "plaintext",
    }
    const language = langMap[ext] ?? "plaintext"

    return Response.json({
      path: filePath,
      size: stat.size,
      mtime: stat.mtime.toISOString(),
      language,
      content,
    })
  } catch {
    return Response.json({ error: "File not found" }, { status: 404 })
  }
}
