import { isObject, objects, type JsonValue } from "./core/json.js";
import { TemplateResult } from "./models/whatsapp.js";

/**
 * The `type` string of each error class. `api_error` is shared by {@link APIError} and its four
 * subclasses.
 */
export type Unicom360ErrorType =
  | "unicom360_error"
  | "configuration_error"
  | "connection_error"
  | "timeout_error"
  | "api_status_error"
  | "authentication_error"
  | "rate_limit_error"
  | "invalid_request_error"
  | "api_server_error"
  | "api_error"
  | "signature_verification_error";

/** Why {@link Webhooks.verify} refused a delivery. Checked in this order; the first failure wins. */
export type SignatureVerificationReason =
  | "missing_signature"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "malformed_signature"
  | "timestamp_out_of_tolerance"
  | "signature_mismatch";

/** Fields every error can carry. */
export interface Unicom360ErrorOptions {
  /** The HTTP status of the response the error came from. */
  httpStatus?: number | null | undefined;
  /** The response's `api_reference`: quote it to Unicom360 support. */
  apiReference?: string | null | undefined;
  /** The response body text. */
  rawBody?: string | null | undefined;
  /** HTTP attempts made by the operation, retries included. */
  attempts?: number | null | undefined;
  /** The underlying error. */
  cause?: unknown;
}

function nameClass(cls: { prototype: Error }, name: string): void {
  Object.defineProperty(cls.prototype, "name", {
    value: name,
    enumerable: false,
    writable: true,
    configurable: true,
  });
}

/**
 * The base class of every error the SDK throws. Catch it to handle any Unicom360 failure;
 * check `instanceof` a subclass (or `type`) to tell them apart.
 */
export class Unicom360Error extends Error {
  /** A stable string naming the error class (see {@link Unicom360ErrorType}). */
  readonly type: Unicom360ErrorType = "unicom360_error";
  /** The HTTP status code for errors that came from a response, else null. */
  readonly httpStatus: number | null;
  /** The response's `api_reference` when it had one: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The response body text for errors that came from a response, else null. */
  readonly rawBody: string | null;
  /**
   * The HTTP attempts the operation made, retries included (1 when it was not retried).
   * Null for errors not raised by an operation.
   */
  readonly attempts: number | null;

  constructor(message: string, options: Unicom360ErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.httpStatus = options.httpStatus ?? null;
    this.apiReference = options.apiReference ?? null;
    this.rawBody = options.rawBody ?? null;
    this.attempts = options.attempts ?? null;
  }
}
nameClass(Unicom360Error, "Unicom360Error");

/**
 * The SDK was configured wrongly (a missing API key, a bad base URL, an invalid option, a blank
 * webhook secret).
 */
export class ConfigurationError extends Unicom360Error {
  override readonly type = "configuration_error";
}
nameClass(ConfigurationError, "ConfigurationError");

/**
 * The request did not complete: the connection failed, was reset, or the response could not be
 * read. When it happened after the request was written, the gateway may have processed it.
 */
export class APIConnectionError extends Unicom360Error {
  override readonly type: "connection_error" | "timeout_error" = "connection_error";
}
nameClass(APIConnectionError, "APIConnectionError");

/** The request timed out (see the `timeout` option). The gateway may have processed it. */
export class APITimeoutError extends APIConnectionError {
  override readonly type = "timeout_error";
}
nameClass(APITimeoutError, "APITimeoutError");

/** Fields of an error built from an HTTP response. */
export interface APIResponseErrorOptions extends Unicom360ErrorOptions {
  httpStatus: number;
  /** The normalised error code (see {@link normalizeCode}). */
  code: string;
  /** The envelope's `data`, or null. */
  data?: JsonValue | null | undefined;
  /** The response headers, with lower-case names. */
  headers?: Readonly<Record<string, string>> | undefined;
}

/**
 * A response that is not a usable success: any non-2xx status, or a 2xx without a JSON
 * envelope carrying a boolean `success` (or `status` on the balance endpoints).
 */
export class APIStatusError extends Unicom360Error {
  override readonly type:
    | "api_status_error"
    | "authentication_error"
    | "rate_limit_error"
    | "invalid_request_error"
    | "api_server_error" = "api_status_error";
  override readonly httpStatus: number;
  /** The normalised error code (see {@link normalizeCode}); `UNKNOWN` when there is none. */
  readonly code: string;
  /** The body's `data`, or null. */
  readonly data: JsonValue | null;
  /** The response headers, with lower-case names. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(message: string, options: APIResponseErrorOptions) {
    super(message, options);
    this.httpStatus = options.httpStatus;
    this.code = options.code;
    this.data = options.data ?? null;
    this.headers = options.headers ?? {};
  }
}
nameClass(APIStatusError, "APIStatusError");

/** HTTP 401: the API key is missing, wrong, disabled, expired, or not allowed from this IP. */
export class AuthenticationError extends APIStatusError {
  override readonly type = "authentication_error";
}
nameClass(AuthenticationError, "AuthenticationError");

/** Options of a {@link RateLimitError}. */
export interface RateLimitErrorOptions extends APIResponseErrorOptions {
  /** Milliseconds until the next UTC minute, when the rate-limit window resets. */
  retryAfter: number;
}

/**
 * HTTP 429: the API key is over its requests-per-minute limit. The window is the fixed UTC
 * minute, so `retryAfter` is the time to the next minute. Nothing was processed.
 */
export class RateLimitError extends APIStatusError {
  override readonly type = "rate_limit_error";
  /** Milliseconds until the rate-limit window resets (the next UTC minute). */
  readonly retryAfter: number;

  constructor(message: string, options: RateLimitErrorOptions) {
    super(message, options);
    this.retryAfter = options.retryAfter;
  }
}
nameClass(RateLimitError, "RateLimitError");

/** HTTP 400: the request's shape is wrong. Nothing was sent. */
export class InvalidRequestError extends APIStatusError {
  override readonly type = "invalid_request_error";
}
nameClass(InvalidRequestError, "InvalidRequestError");

/** HTTP 5xx: the gateway, or a proxy in front of it, failed. */
export class APIServerError extends APIStatusError {
  override readonly type = "api_server_error";
}
nameClass(APIServerError, "APIServerError");

/** Options of an {@link APIError}. */
export interface APIErrorOptions extends Unicom360ErrorOptions {
  httpStatus: number;
  /** The normalised error code. */
  code: string;
  /** The envelope's `data`, or null. */
  data?: JsonValue | null | undefined;
}

/**
 * A business refusal: HTTP 200 with `success: false` (or `status: false` on the balance
 * endpoints). `code` is the normalised code, for example `INVALID_SENDER_ID`.
 */
export class APIError extends Unicom360Error {
  override readonly type = "api_error";
  override readonly httpStatus: number;
  /** The normalised error code (see {@link ErrorCode}); `UNKNOWN` when the message has none. */
  readonly code: string;
  /** The envelope's `data` when present, else null. */
  readonly data: JsonValue | null;

  constructor(message: string, options: APIErrorOptions) {
    super(message, options);
    this.httpStatus = options.httpStatus;
    this.code = options.code;
    this.data = options.data ?? null;
  }
}
nameClass(APIError, "APIError");

/** The bundle for this channel has too few units left (`INSUFFICIENT_BUNDLE`). */
export class InsufficientBundleError extends APIError {}
nameClass(InsufficientBundleError, "InsufficientBundleError");

/**
 * The `user_reference_id` was already used for this recipient and sender
 * (`DUPLICATE_REFERENCE`).
 *
 * When `attempts` is greater than 1, an earlier attempt of this same call very probably
 * succeeded: the retry was refused because the reference had already gone out.
 */
export class DuplicateReferenceError extends APIError {
  /** For a WhatsApp session send, the `message_id` the reference already went out as. */
  readonly originalMessageId: string | null;

  constructor(message: string, options: APIErrorOptions) {
    super(message, options);
    const data = options.data;
    this.originalMessageId =
      isObject(data) && typeof data.message_id === "string" ? data.message_id : null;
  }
}
nameClass(DuplicateReferenceError, "DuplicateReferenceError");

/** Every template recipient was rejected (`NO_VALID_RECIPIENTS`); `results` says why. */
export class NoValidRecipientsError extends APIError {
  /** One result per recipient, each with its `reason`. */
  readonly results: readonly TemplateResult[];

  constructor(message: string, options: APIErrorOptions) {
    super(message, options);
    const data = options.data;
    this.results = isObject(data) ? objects(data.results).map((r) => new TemplateResult(r)) : [];
  }
}
nameClass(NoValidRecipientsError, "NoValidRecipientsError");

/**
 * The customer's 24-hour WhatsApp window is closed (`SESSION_WINDOW_CLOSED`): send a template
 * instead.
 */
export class SessionWindowClosedError extends APIError {}
nameClass(SessionWindowClosedError, "SessionWindowClosedError");

/** A webhook delivery failed verification; `reason` says which check failed. */
export class SignatureVerificationError extends Unicom360Error {
  override readonly type = "signature_verification_error";
  /** The check that failed. */
  readonly reason: SignatureVerificationReason;

  constructor(reason: SignatureVerificationReason, message?: string) {
    super(message ?? `Webhook signature verification failed: ${reason}`);
    this.reason = reason;
  }
}
nameClass(SignatureVerificationError, "SignatureVerificationError");

/**
 * The normalised error codes the SDK documents. `code` on an error is a plain string: the
 * gateway can add codes, and they pass through unchanged.
 */
export const ErrorCode = {
  INVALID_SENDER_ID: "INVALID_SENDER_ID",
  SENDER_ID_NOT_ALLOWED: "SENDER_ID_NOT_ALLOWED",
  INVALID_RECIPIENT_LIMIT: "INVALID_RECIPIENT_LIMIT",
  INSUFFICIENT_BUNDLE: "INSUFFICIENT_BUNDLE",
  DUPLICATE_REFERENCE: "DUPLICATE_REFERENCE",
  INVALID_PARAMETERS: "INVALID_PARAMETERS",
  MISSING_API_KEY: "MISSING_API_KEY",
  INVALID_AUTHORIZATION: "INVALID_AUTHORIZATION",
  SENDER_REQUIRED: "SENDER_REQUIRED",
  TEMPLATE_NOT_FOUND: "TEMPLATE_NOT_FOUND",
  TEMPLATE_NOT_APPROVED: "TEMPLATE_NOT_APPROVED",
  LANGUAGE_REQUIRED: "LANGUAGE_REQUIRED",
  TEMPLATE_SENDER_MISMATCH: "TEMPLATE_SENDER_MISMATCH",
  NO_VALID_RECIPIENTS: "NO_VALID_RECIPIENTS",
  SEND_FAILED: "SEND_FAILED",
  SESSION_WINDOW_CLOSED: "SESSION_WINDOW_CLOSED",
  REPLY_TO_NOT_FOUND: "REPLY_TO_NOT_FOUND",
  REACTION_TARGET_NOT_FOUND: "REACTION_TARGET_NOT_FOUND",
  INVALID_NUMBER: "INVALID_NUMBER",
  INVALID_USER_REFERENCE_ID: "INVALID_USER_REFERENCE_ID",
  MEDIA_URL_INVALID: "MEDIA_URL_INVALID",
  CLIENT_NOT_FOUND: "CLIENT_NOT_FOUND",
  AUTHENTICATION_FAILED: "AUTHENTICATION_FAILED",
  CREDENTIAL_DISABLED: "CREDENTIAL_DISABLED",
  CLIENT_DISABLED: "CLIENT_DISABLED",
  CREDENTIAL_EXPIRED: "CREDENTIAL_EXPIRED",
  IP_NOT_ALLOWED: "IP_NOT_ALLOWED",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  UNKNOWN: "UNKNOWN",
} as const;

/** One of the codes in {@link ErrorCode}. */
export type KnownErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

const CODE_ALIASES: Readonly<Record<string, string>> = {
  "Invalid From Sender ID": "INVALID_SENDER_ID",
  "Invalid Sender": "INVALID_SENDER_ID",
  "From Sender ID not allowed": "SENDER_ID_NOT_ALLOWED",
  "Sender not allowed": "SENDER_ID_NOT_ALLOWED",
  "Recipient list size is invalid": "INVALID_RECIPIENT_LIMIT",
  "Invalid Recipient Limit": "INVALID_RECIPIENT_LIMIT",
  "INSUFFICIENT_BUNDLE: no international SMS bundle": "INSUFFICIENT_BUNDLE",
  "Insufficient bundle": "INSUFFICIENT_BUNDLE",
  INSUFFICIENT_BUNDLE_LIMIT: "INSUFFICIENT_BUNDLE",
  "duplicate user reference id": "DUPLICATE_REFERENCE",
  DUPLICATE_MSG_REF: "DUPLICATE_REFERENCE",
  "Invalid parameters provided": "INVALID_PARAMETERS",
  "Missing API key. Provide X-API-Key header or Authorization: Bearer <api_key>": "MISSING_API_KEY",
  "Invalid authorization format. Use 'Bearer <api_key>' or 'Basic <base64>'":
    "INVALID_AUTHORIZATION",
  "Invalid Basic auth format. Use api_key as username": "INVALID_AUTHORIZATION",
  "Invalid Base64 encoding in Basic auth": "INVALID_AUTHORIZATION",
};

function alias(text: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(CODE_ALIASES, text) ? CODE_ALIASES[text] : undefined;
}

/**
 * Turns a gateway `message` into a stable error code, the way every Unicom360 SDK does:
 * a known sentence maps to its code (`Invalid From Sender ID` is `INVALID_SENDER_ID`), an
 * upper-case code passes through (`TEMPLATE_NOT_FOUND`), a `CODE: detail` message gives `CODE`,
 * and anything else is `UNKNOWN`. Matching is exact and case-sensitive.
 */
export function normalizeCode(message: unknown): string {
  if (typeof message !== "string") return ErrorCode.UNKNOWN;
  const exact = alias(message);
  if (exact !== undefined) return exact;
  if (/^[A-Z][A-Z0-9_]*$/.test(message)) return message;
  const prefix = /^([A-Z][A-Z0-9_]*):\s/.exec(message);
  if (prefix?.[1] !== undefined) return alias(prefix[1]) ?? prefix[1];
  return ErrorCode.UNKNOWN;
}
