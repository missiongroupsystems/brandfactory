// The wire shape of every refusal is `{ code, message, details? }`, as in the archive server.

export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details?: unknown
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const unauthorized = (message = 'unauthorized') =>
  new HttpError(401, 'UNAUTHORIZED', message)
/** A valid token with no `users` row: authorization, so 403, never a 401 that signs out. */
export const noAccount = () =>
  new HttpError(403, 'NO_ACCOUNT', 'this account has no access to Brand Base')
export const deactivated = () =>
  new HttpError(403, 'ACCOUNT_DEACTIVATED', 'this account has been deactivated')
export const forbidden = (message = 'forbidden') => new HttpError(403, 'FORBIDDEN', message)
export const notFound = (message = 'not found') => new HttpError(404, 'NOT_FOUND', message)
export const invalid = (message: string, code = 'VALIDATION', details?: unknown) =>
  new HttpError(400, code, message, details)
export const conflict = (message: string, code = 'CONFLICT', details?: unknown) =>
  new HttpError(409, code, message, details)
