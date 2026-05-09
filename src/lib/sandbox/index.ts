import { startChild, getRunning } from "./child-process"
import type { SandboxHandle, SandboxStartOpts } from "./types"

export async function startSandbox(opts: SandboxStartOpts): Promise<SandboxHandle> {
  const exists = getRunning(opts.projectId)
  if (exists) return exists
  // Docker disabled by default (SANDBOX_DOCKER=0), always use child process
  return startChild(opts)
}

export { getRunning } from "./child-process"
export type { SandboxHandle, SandboxStartOpts }
