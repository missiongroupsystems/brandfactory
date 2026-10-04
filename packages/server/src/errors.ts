// Minimal error boundary. Phase 9 replaces this with the full `AppError`
// taxonomy; the wire shape (`{ code, message, details? }`) is the stable
// contract.

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

export class UnauthorizedError extends HttpError {
  constructor(message = 'unauthorized') {
    super(401, 'UNAUTHORIZED', message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'forbidden') {
    super(403, 'FORBIDDEN', message)
    this.name = 'ForbiddenError'
  }
}

/**
 * The caller holds a valid session, and a password somebody else chose. Every
 * route but the two on `/me` refuses until they set their own.
 *
 * **A distinct code, not a bare 403.** The client has to tell this apart from
 * "you may not touch this brand": the first is answered by sending the reader
 * to one screen, the second by not offering the control. A shared code would
 * make the frontend guess, and the guess would be wrong in whichever direction
 * it was not written for.
 */
export class PasswordNotSetError extends HttpError {
  constructor(message = 'set your own password before using the app') {
    super(403, 'PASSWORD_NOT_SET', message)
    this.name = 'PasswordNotSetError'
  }
}

/**
 * The token verified and there is no `users` row behind it.
 *
 * **403, not 401, and the distinction is the whole point.** A 401 says *we do
 * not know this token*, which both frontends answer by clearing the session and
 * returning to sign-in — so a stranger holding a valid Supabase token would
 * loop through sign-in forever with nothing said, and a colleague whose account
 * has not been created yet would report "the app signs me out instantly",
 * which is a far harder thing to diagnose than a sentence on screen.
 *
 * The token *is* valid. What is missing is an account here. That is
 * authorization, and 403 is what it means.
 *
 * Launchpad states the rule this enforces: *"A valid Passport token proves who
 * somebody is, not that they belong here."*
 */
export class NoAccountError extends HttpError {
  constructor(message = 'this account has no access to Brand Base') {
    super(403, 'NO_ACCOUNT', message)
    this.name = 'NoAccountError'
  }
}

/**
 * The row exists and `deactivated_at` is set. Separate from `NoAccountError`
 * because the two want different sentences on screen — *you were never added*
 * and *your access was withdrawn* are different news, and an administrator
 * reading a support message needs to know which one happened.
 */
export class AccountDeactivatedError extends HttpError {
  constructor(message = 'this account has been deactivated') {
    super(403, 'ACCOUNT_DEACTIVATED', message)
    this.name = 'AccountDeactivatedError'
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'not found', code = 'NOT_FOUND') {
    super(404, code, message)
    this.name = 'NotFoundError'
  }
}

// Reserved for business-rule validation failures. Zod boundary errors
// surface as `ZodError` and are handled separately in `onError`.
export class ValidationError extends HttpError {
  constructor(message = 'validation failed', details?: unknown) {
    super(400, 'VALIDATION', message, details)
    this.name = 'ValidationError'
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'conflict', code = 'CONFLICT') {
    super(409, code, message)
    this.name = 'ConflictError'
  }
}
