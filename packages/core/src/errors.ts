/** A call the core refuses. The wire shape is `{ code, message, rule?, details? }`. */
export class Refused extends Error {
  readonly status: number
  readonly code: string
  readonly rule?: string
  readonly details?: unknown
  constructor(
    status: number,
    code: string,
    message: string,
    extra: { rule?: string; details?: unknown } = {},
  ) {
    super(message)
    this.name = 'Refused'
    this.status = status
    this.code = code
    this.rule = extra.rule
    this.details = extra.details
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.rule !== undefined && { rule: this.rule }),
      ...(this.details !== undefined && { details: this.details }),
    }
  }
}
