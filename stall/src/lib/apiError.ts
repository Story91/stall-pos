/** An expected failure with a stable machine code; `toResponse` turns it into `{ error: code, ...extra }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ApiError";
  }
}
