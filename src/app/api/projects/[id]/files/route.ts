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

interface FileEntry {
  name: string
  path: string
  size: number
  mtime: string
  isDirectory: boolean
}

async function walk(dir: string, root: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = []
  const dirents = await fs.readdir(dir, { withFileTypes: true })
  for (const d of dirents) {
    if (["node_modules", ".git", ".next", "dist", ".turbo", ".pi-session"].includes(d.name)) continue
    const full = path.join(dir, d.name)
    const rel = path.relative(root, full)
    try {
      const stat = await fs.stat(full)
      entries.push({
        name: d.name,
        path: rel.replace(/\\/g, "/"),
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isDirectory: d.isDirectory(),
      })
      if (d.isDirectory()) {
        const children = await walk(full, root)
        entries.push(...children)
      }
    } catch {
      // skip inaccessible files
    }
  }
  return entries
}

export const GET = async (
  _req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const workspaceDir = paths.workspace(params.id)
  try {
    await fs.access(workspaceDir)
  } catch {
    return Response.json({ files: [] })
  }

  const files = await walk(workspaceDir, workspaceDir)
  files.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return Response.json({ files })
}
