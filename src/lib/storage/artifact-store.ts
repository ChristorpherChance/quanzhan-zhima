import fs from "node:fs/promises"
import path from "node:path"
import { paths } from "@/config/paths"
import { log } from "@/lib/log"

const STORAGE_ROOT = paths.storage

interface ArtifactRef {
  storagePath: string
  type: string
  version: number
}

/**
 * Read artifact content with file existence check.
 * Returns null if the file is missing (e.g., manually deleted),
 * preventing silent errors from inconsistent storage state.
 */
export async function readArtifact(artifact: ArtifactRef): Promise<string | null> {
  const fullPath = path.join(STORAGE_ROOT, artifact.storagePath)
  try {
    await fs.access(fullPath)
    const content = await fs.readFile(fullPath, "utf-8")
    return content
  } catch {
    log("db", `[artifact] file missing: ${fullPath} (type=${artifact.type} v${artifact.version})`)
    return null
  }
}

/**
 * Check if an artifact file exists on disk.
 */
export async function artifactFileExists(artifact: ArtifactRef): Promise<boolean> {
  const fullPath = path.join(STORAGE_ROOT, artifact.storagePath)
  try {
    await fs.access(fullPath)
    return true
  } catch {
    return false
  }
}
