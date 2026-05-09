import fs from "node:fs/promises"
import path from "node:path"
import { paths } from "@/config/paths"

export interface WorkspaceStatus {
  fileCount: number
  hasPackageJson: boolean
  totalLOC: number
  lastSandboxOk: boolean
  fileList: string[]
}

export async function getWorkspaceStatus(projectId: string): Promise<WorkspaceStatus> {
  const ws = paths.workspace(projectId)
  const status: WorkspaceStatus = {
    fileCount: 0,
    hasPackageJson: false,
    totalLOC: 0,
    lastSandboxOk: false,
    fileList: [],
  }

  try {
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (["node_modules", ".git", ".next", ".pi-session"].includes(e.name)) continue
          await walk(full)
        } else {
          status.fileCount++
          status.fileList.push(path.relative(ws, full))
          if (e.name === "package.json") status.hasPackageJson = true
          // Approximate LOC for text files
          try {
            const content = await fs.readFile(full, "utf-8")
            status.totalLOC += content.split("\n").length
          } catch { /* binary, skip */ }
        }
      }
    }
    await walk(ws)
  } catch {
    // workspace not created yet
  }

  return status
}
