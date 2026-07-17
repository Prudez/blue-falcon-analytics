// core/errors.js
// Common exceptions. The manager uses these to decide retry vs skip vs alert.

class ConnectorError extends Error {
  constructor(message, { connector, cause, retryable = false } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.connector = connector;
    this.cause = cause;
    this.retryable = retryable;
  }
}

// Credentials missing/invalid, or a session that requires human re-auth.
// Never retried automatically — a hot-looped login retry gets accounts flagged.
class AuthError extends ConnectorError {
  constructor(message, opts = {}) {
    super(message, { ...opts, retryable: false });
  }
}

// Token expired but the connector knows re-auth is a manual step (e.g. Meta
// long-lived user token past 60 days). Surfaces as an alert, not a retry.
class TokenExpiredError extends AuthError {}

// A DOM selector no longer matched. Carries the page snapshot path so the
// diff target is preserved (portal-sync selector strategy).
class SelectorError extends ConnectorError {
  constructor(message, opts = {}) {
    super(message, { ...opts, retryable: false });
    this.snapshotPath = opts.snapshotPath ?? null;
  }
}

// Transient network/HTTP failure — safe to retry with backoff.
class TransientError extends ConnectorError {
  constructor(message, opts = {}) {
    super(message, { ...opts, retryable: true });
  }
}

// External API rate limit. Carries retry-after when the API provides one.
class RateLimitError extends TransientError {
  constructor(message, opts = {}) {
    super(message, opts);
    this.retryAfterMs = opts.retryAfterMs ?? null;
  }
}

// The connector ran but returned data that failed model validation.
// This is a mapping bug, not a fetch bug — never retried.
class MappingError extends ConnectorError {
  constructor(message, opts = {}) {
    super(message, { ...opts, retryable: false });
    this.issues = opts.issues ?? [];
  }
}

module.exports = {
  ConnectorError,
  AuthError,
  TokenExpiredError,
  SelectorError,
  TransientError,
  RateLimitError,
  MappingError,
};
