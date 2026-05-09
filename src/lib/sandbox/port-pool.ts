import { SANDBOX_PORT_RANGE } from "@/config/ports"

const used = new Set<number>()

export function acquirePort(): number {
  for (let p = SANDBOX_PORT_RANGE[0]; p <= SANDBOX_PORT_RANGE[1]; p++) {
    if (!used.has(p)) {
      used.add(p)
      return p
    }
  }
  throw new Error("no free port in sandbox range")
}

export function releasePort(p: number) {
  used.delete(p)
}
