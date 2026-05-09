export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export class NotImplementedError extends AppError {
  constructor(where: string) {
    super("E_NOT_IMPLEMENTED", `未实现: ${where}`)
  }
}

export function withErrorBoundary<TArgs extends unknown[], TRet>(
  fn: (...args: TArgs) => Promise<TRet>,
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      const data = await fn(...args)
      return Response.json({ data })
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string; details?: unknown }
      const code = err instanceof AppError ? err.code : "E_INTERNAL"
      const status =
        code === "E_NOT_FOUND" ? 404
        : code === "E_VALIDATION" ? 400
        : code === "E_GATE_CLOSED" ? 409
        : 500
      return Response.json(
        { error: { code, message: String(err?.message ?? e), details: (err as AppError).details } },
        { status },
      )
    }
  }
}
