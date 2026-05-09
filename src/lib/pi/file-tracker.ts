// Pi workspace_write 文件变更追踪器
// 订阅工具执行事件，自动记录文件写入

export interface FileChange {
  path: string
  content: string
  timestamp: number
}

class PiFileTracker {
  private changes = new Map<string, Map<string, FileChange>>()
  // projectId -> Map<filePath, FileChange>

  record(projectId: string, filePath: string, content: string) {
    let projectChanges = this.changes.get(projectId)
    if (!projectChanges) {
      projectChanges = new Map()
      this.changes.set(projectId, projectChanges)
    }
    projectChanges.set(filePath, {
      path: filePath,
      content: content.slice(0, 100_000), // 限制 100KB
      timestamp: Date.now(),
    })
  }

  getChanges(projectId: string): FileChange[] {
    const projectChanges = this.changes.get(projectId)
    if (!projectChanges) return []
    return [...projectChanges.values()].sort((a, b) => b.timestamp - a.timestamp)
  }

  getFile(projectId: string, filePath: string): FileChange | undefined {
    return this.changes.get(projectId)?.get(filePath)
  }

  clear(projectId: string) {
    this.changes.delete(projectId)
  }

  clearAll() {
    this.changes.clear()
  }
}

export const piFileTracker = new PiFileTracker()
