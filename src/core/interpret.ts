import {
  APIError,
  APIServerError,
  APIStatusError,
  AuthenticationError,
  DuplicateReferenceError,
  InsufficientBundleError,
  InvalidRequestError,
  NoValidRecipientsError,
  RateLimitError,
  SessionWindowClosedError,
  normalizeCode,
  type APIErrorOptions,
} from "../errors.js";
import { isObject, parseJson, str, type JsonObject, type JsonValue } from "./json.js";
import type { OperationSpec } from "./operations.js";
import type { TransportResponse } from "./transport.js";

/** @internal The outcome of one HTTP response. */
export type Interpretation =
  | { ok: true; json: JsonObject }
  | { ok: false; error: APIStatusError | APIError; json: JsonValue | undefined };

const API_ERROR_CLASSES: Readonly<
  Record<string, new (message: string, options: APIErrorOptions) => APIError>
> = {
  INSUFFICIENT_BUNDLE: InsufficientBundleError,
  DUPLICATE_REFERENCE: DuplicateReferenceError,
  NO_VALID_RECIPIENTS: NoValidRecipientsError,
  SESSION_WINDOW_CLOSED: SessionWindowClosedError,
};

const REASONS: Readonly<Record<number, string>> = {
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  406: "Not Acceptable",
  408: "Request Timeout",
  409: "Conflict",
  413: "Content Too Large",
  415: "Unsupported Media Type",
  422: "Unprocessable Content",
  429: "Too Many Requests",
  500: "Internal Server Error",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/** @internal `HTTP 502 Bad Gateway`. */
export function statusLine(status: number): string {
  const reason = REASONS[status];
  return reason === undefined ? `HTTP ${status}` : `HTTP ${status} ${reason}`;
}

/**
 * @internal A `message` as text: a string as is, a list of strings (the SMS and email request
 * validator) joined with `"; "`, anything else null.
 */
export function messageText(message: JsonValue | undefined): string | null {
  if (typeof message === "string") return message;
  if (Array.isArray(message) && message.every((m) => typeof m === "string")) {
    return message.join("; ");
  }
  return null;
}

/** @internal Milliseconds to the next UTC minute, in (0, 60000]. */
export function untilNextMinute(nowMs: number): number {
  return 60_000 - (((nowMs % 60_000) + 60_000) % 60_000);
}

/**
 * @internal Interprets one HTTP response, in the order the SDK contract fixes (section 7 of
 * docs/sdk-design.md): a 2xx needs a JSON object with a boolean success flag; anything else is
 * classified by status alone.
 */
export function interpret(
  spec: OperationSpec,
  response: TransportResponse,
  attempts: number,
  nowMs: number,
): Interpretation {
  const json = parseJson(response.body);
  const { status } = response;
  const base = { httpStatus: status, rawBody: response.body, attempts };

  if (status >= 200 && status <= 299) {
    const unusable = (why: string): Interpretation => ({
      ok: false,
      json,
      error: new APIStatusError(
        `Unexpected response from the Unicom360 API (HTTP ${status}): ${why}`,
        {
          ...base,
          code: "UNKNOWN",
          headers: response.headers,
        },
      ),
    });
    if (!isObject(json)) return unusable("the body is not a JSON object");
    if (spec.envelope === "none") return { ok: true, json };
    const flag = spec.envelope === "status" ? json.status : json.success;
    if (flag === true) return { ok: true, json };
    if (flag !== false) return unusable(`the body has no boolean "${spec.envelope}" flag`);

    const text = messageText(json.message);
    const code = normalizeCode(text);
    const ErrorClass = API_ERROR_CLASSES[code] ?? APIError;
    return {
      ok: false,
      json,
      error: new ErrorClass(text ?? "The Unicom360 API refused the request without a message", {
        ...base,
        code,
        apiReference: str(json.api_reference),
        data: json.data ?? null,
      }),
    };
  }

  let text: string | null = null;
  let code = "UNKNOWN";
  let apiReference: string | null = null;
  let data: JsonValue | null = null;
  if (isObject(json) && "message" in json) {
    text = messageText(json.message);
    code = normalizeCode(text);
    apiReference = str(json.api_reference);
    data = json.data ?? null;
  } else if (isObject(json) && isObject(json.errors) && typeof json.errors.detail === "string") {
    text = json.errors.detail;
  }
  const message = text ?? statusLine(status);
  const options = { ...base, code, apiReference, data, headers: response.headers };

  let error: APIStatusError;
  if (status === 400) error = new InvalidRequestError(message, options);
  else if (status === 401) error = new AuthenticationError(message, options);
  else if (status === 429) {
    error = new RateLimitError(message, { ...options, retryAfter: untilNextMinute(nowMs) });
  } else if (status >= 500 && status <= 599) error = new APIServerError(message, options);
  else error = new APIStatusError(message, options);
  return { ok: false, json, error };
}
