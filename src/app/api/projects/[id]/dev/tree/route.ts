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
  name: string; path: string; size: number; mtime: string; isDirectory: boolean
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
      entries.push({ name: d.name, path: rel.replace(/\\/g, "/"), size: stat.size, mtime: stat.mtime.toISOString(), isDirectory: d.isDirectory() })
      if (d.isDirectory()) entries.push(...await walk(full, root))
    } catch { /* skip */ }
  }
  return entries
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const dir = paths.workspace(params.id)
  try { await fs.access(dir) } catch { return Response.json({ files: [] }) }
  const files = await walk(dir, dir)
  return Response.json({ files })
}
