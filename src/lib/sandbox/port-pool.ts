import net from "node:net"
import { PORTS } from "@/config/ports"

const used = new Set<number>()

function rangeFor(kind: "sandbox" | "uiPreview" | "reviewE2E"): [number, number] {
  return PORTS[kind]
}

async function isFree(port: number, host = "127.0.0.1", timeout = 300): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = new net.Socket()
    const done = (free: boolean) => {
      sock.destroy()
      resolve(free)
    }
    sock.setTimeout(timeout)
    sock.once("connect", () => done(false))
    sock.once("timeout", () => done(true))
    sock.once("error", () => done(true))
    sock.connect(port, host)
  })
}

export async function acquirePort(
  kind: "sandbox" | "uiPreview" | "reviewE2E" = "sandbox",
): Promise<number> {
  const [start, end] = rangeFor(kind)
  let attempts = 0
  for (let p = start; p <= end; p++) {
    if (used.has(p)) continue
    if (!(await isFree(p))) {
      attempts++
      if (attempts > 5) break
      continue
    }
    used.add(p)
    return p
  }
  throw new Error(`E_NO_PORT: 端口范围 ${start}-${end} 无可用端口`)
}

export function releasePort(p: number) {
  used.delete(p)
}
