/**
 * Base class for all translation domain errors.
 *
 * Consumers can catch `TranslationError` to handle any domain-level failure,
 * or catch a specific subclass for fine-grained recovery logic.
 */
export class TranslationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    // Restore prototype chain after Error inheritance in ES5/TS targets.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when a network-level failure occurs (DNS, connection, offline).
 */
export class NetworkError extends TranslationError {
  constructor(message: string = "Network error") {
    super(message);
  }
}

/**
 * Thrown when authentication or authorization with the provider fails.
 * Typically corresponds to HTTP 401/403.
 */
export class AuthError extends TranslationError {
  constructor(message: string = "Authentication failed") {
    super(message);
  }
}

/**
 * Thrown when the provider returns a rate-limit response (HTTP 429).
 * `retryAfter` is the parsed `retry-after` header, in seconds, when present.
 */
export class RateLimitError extends TranslationError {
  readonly retryAfter?: number;

  constructor(retryAfter?: number, message: string = "Rate limit exceeded") {
    super(message);
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when the provider returns an unexpected non-ok response that
 * is not specifically handled (e.g. 5xx server errors, 4xx client errors
 * other than auth/rate limit).
 */
export class ProviderError extends TranslationError {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Thrown when the provider's response body is missing the expected
 * `choices[0].message.content` field, or that field is not a string.
 */
export class ValidationError extends TranslationError {
  constructor(message: string = "Invalid response") {
    super(message);
  }
}
