type Tag = "gateway" | "pi" | "agent" | "api" | "sandbox" | "export" | "db" | "runtime-config"

export function log(tag: Tag, message: string, data?: unknown) {
  const ts = new Date().toISOString()
  const line = `[${ts}][${tag}] ${message}`
  if (data !== undefined) {
    console.error(line, data)
  } else {
    console.error(line)
  }
}
