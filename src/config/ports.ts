function num(name: string, def: number): number {
  const v = Number(process.env[name])
  return Number.isFinite(v) && v > 0 ? v : def
}

function range(name: string, defStart: number, defEnd: number): [number, number] {
  const raw = process.env[name]
  if (raw && /^\d+-\d+$/.test(raw)) {
    const [s, e] = raw.split("-").map(Number)
    if (Number.isFinite(s) && Number.isFinite(e) && s > 0 && e >= s) return [s, e]
  }
  return [defStart, defEnd]
}

export const PORTS = {
  app: num("APP_PORT", 3000),
  sandbox: range("SANDBOX_PORT_RANGE", 3010, 3099),
  uiPreview: range("UI_PREVIEW_PORT_RANGE", 3100, 3199),
  reviewE2E: range("REVIEW_E2E_PORT_RANGE", 3200, 3249),
} as const

export function isPortReserved(port: number): boolean {
  return (
    port === PORTS.app ||
    (port >= PORTS.sandbox[0] && port <= PORTS.sandbox[1]) ||
    (port >= PORTS.uiPreview[0] && port <= PORTS.uiPreview[1]) ||
    (port >= PORTS.reviewE2E[0] && port <= PORTS.reviewE2E[1])
  )
}
