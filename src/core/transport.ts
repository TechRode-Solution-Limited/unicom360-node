/** One HTTP request the client asks a {@link Transport} to send. */
export interface TransportRequest {
  /** `GET` or `POST`. */
  readonly method: "GET" | "POST";
  /** The absolute URL. */
  readonly url: string;
  /** The request headers. */
  readonly headers: Readonly<Record<string, string>>;
  /** The JSON body text, or undefined for a request without a body. */
  readonly body: string | undefined;
  /** Milliseconds from sending the request to receiving the whole body. */
  readonly timeout: number;
  /** Milliseconds allowed for establishing the connection, TLS included. */
  readonly connectTimeout: number;
}

/** The HTTP response a {@link Transport} returns. */
export interface TransportResponse {
  /** The HTTP status code. */
  readonly status: number;
  /** The response headers. Names are matched case-insensitively. */
  readonly headers: Readonly<Record<string, string>>;
  /** The whole body as text. */
  readonly body: string;
}

/**
 * Sends one HTTP request. Must not follow redirects. When the request fails, throw a
 * {@link TransportError} saying whether any byte may have reached the server; any other thrown
 * value is treated as "may have been sent".
 */
export type Transport = (request: TransportRequest) => Promise<TransportResponse>;

/** Options of a {@link TransportError}. */
export interface TransportErrorOptions {
  /** Whether any byte of the request may have reached the server. When unsure, true. */
  sent: boolean;
  /** Whether the failure was a timeout. */
  timeout: boolean;
  /** The underlying error. */
  cause?: unknown;
  /** A description. */
  message?: string | undefined;
}

/**
 * Thrown by a {@link Transport} when a request fails without a response. The client turns it
 * into an `APIConnectionError` or `APITimeoutError`, and retries it only when that is safe:
 * always when `sent` is false, otherwise only for retry-safe operations.
 */
export class TransportError extends Error {
  /** Whether any byte of the request may have reached the server. */
  readonly sent: boolean;
  /** Whether the failure was a timeout. */
  readonly timeout: boolean;

  constructor(options: TransportErrorOptions) {
    super(
      options.message ?? (options.timeout ? "The request timed out" : "The request failed"),
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.sent = options.sent;
    this.timeout = options.timeout;
  }
}
Object.defineProperty(TransportError.prototype, "name", {
  value: "TransportError",
  writable: true,
  configurable: true,
});

/** The `init` argument the default transport passes to `fetch`. */
export interface FetchInit {
  method: string;
  headers: Record<string, string>;
  body?: string;
  redirect: "manual";
  signal: AbortSignal;
}

/** The parts of a fetch `Response` the default transport reads. */
export interface FetchResponse {
  readonly status: number;
  readonly headers: { forEach(callback: (value: string, name: string) => void): void };
  text(): Promise<string>;
}

/** A `fetch` implementation: the global `fetch`, undici's, or a wrapper around either. */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>;

// Error codes from Node (undici), Bun and the OS that mean nothing was sent.
const NOT_SENT = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EAI_FAIL",
  "EAI_NONAME",
  "EAI_NODATA",
  "EHOSTUNREACH",
  "EHOSTDOWN",
  "ENETUNREACH",
  "ENETDOWN",
  "EADDRNOTAVAIL",
  "ConnectionRefused",
  "FailedToOpenSocket",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "HOSTNAME_MISMATCH",
]);
const CONNECT_TIMEOUT = new Set(["UND_ERR_CONNECT_TIMEOUT"]);
// ETIMEDOUT can come from an established connection too, so it counts as "may have been sent".
const RESPONSE_TIMEOUT = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "ETIMEDOUT"]);

function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  const seen = new Set<unknown>();
  const visit = (e: unknown, depth: number): void => {
    if (e === null || typeof e !== "object" || seen.has(e) || depth > 5) return;
    seen.add(e);
    const { code, cause, errors } = e as { code?: unknown; cause?: unknown; errors?: unknown };
    if (typeof code === "string") codes.push(code);
    visit(cause, depth + 1);
    if (Array.isArray(errors)) for (const inner of errors) visit(inner, depth + 1);
  };
  visit(error, 0);
  return codes;
}

/** @internal Classifies a failed fetch into the two facts the retry rules need. */
export function classifyFetchError(error: unknown, timedOut: boolean): TransportError {
  if (timedOut) {
    // The deadline covers the whole exchange, so the request may already have been written.
    return new TransportError({ sent: true, timeout: true, cause: error });
  }
  const codes = errorCodes(error);
  if (codes.some((c) => CONNECT_TIMEOUT.has(c))) {
    return new TransportError({ sent: false, timeout: true, cause: error });
  }
  if (codes.some((c) => RESPONSE_TIMEOUT.has(c))) {
    return new TransportError({ sent: true, timeout: true, cause: error });
  }
  if (codes.some((c) => NOT_SENT.has(c) || /^ERR_(TLS|SSL)_/.test(c))) {
    return new TransportError({ sent: false, timeout: false, cause: error });
  }
  return new TransportError({ sent: true, timeout: false, cause: error });
}

/**
 * @internal The default transport, on `fetch`. Redirects are not followed, and `timeout` bounds
 * the whole exchange. The connection phase is bounded by the runtime's own connect timeout
 * (10 seconds in Node) as well; pass a `fetch` built on an undici `Agent` to tune it.
 */
export function fetchTransport(fetchImpl: FetchLike): Transport {
  return async (request) => {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, request.timeout);
    try {
      const init: FetchInit = {
        method: request.method,
        headers: { ...request.headers },
        redirect: "manual",
        signal: controller.signal,
      };
      if (request.body !== undefined) init.body = request.body;
      let response: FetchResponse;
      try {
        response = await fetchImpl(request.url, init);
      } catch (error) {
        throw classifyFetchError(error, timedOut);
      }
      let body: string;
      try {
        body = await response.text();
      } catch (error) {
        const failure = classifyFetchError(error, timedOut);
        // The response had started, so the request had been sent.
        throw new TransportError({ sent: true, timeout: failure.timeout, cause: error });
      }
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        headers[name.toLowerCase()] = value;
      });
      return { status: response.status, headers, body };
    } finally {
      clearTimeout(timer);
    }
  };
}
