export const J = {
  parse<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback
    try { return JSON.parse(s) as T } catch { return fallback }
  },
  stringify<T>(v: T): string { return JSON.stringify(v) },
}
