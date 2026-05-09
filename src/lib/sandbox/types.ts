export interface SandboxStartOpts {
  projectId: string
  workspaceDir: string
  command: string
  prefer?: "child" | "docker"
}

export interface SandboxHandle {
  projectId: string
  port: number
  url: string
  pid?: number
  containerId?: string
  startedAt: number
  stop(): Promise<void>
}
