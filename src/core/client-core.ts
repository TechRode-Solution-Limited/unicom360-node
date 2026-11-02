import {
  APIConnectionError,
  APIError,
  APIServerError,
  APIStatusError,
  APITimeoutError,
  ConfigurationError,
  RateLimitError,
  type Unicom360Error,
} from "../errors.js";
import { VERSION } from "../version.js";
import { isBrowser, readEnv, runtimeDescription } from "./env.js";
import { interpret } from "./interpret.js";
import { isObject, type JsonObject } from "./json.js";
import { defaultLogger, type Logger } from "./logger.js";
import {
  addReferences,
  isRetrySafe,
  OPERATIONS,
  type OperationName,
  type OperationSpec,
} from "./operations.js";
import {
  fetchTransport,
  TransportError,
  type FetchLike,
  type Transport,
  type TransportRequest,
  type TransportResponse,
} from "./transport.js";

/** Identifies your application in the User-Agent, for example `shopsync/2.3.0`. */
export interface AppInfo {
  /** Your application's name. */
  name: string;
  /** Its version. */
  version?: string | undefined;
  /** A URL about it. */
  url?: string | undefined;
}

/**
 * Options of the {@link Unicom360} client. Every field is optional. All durations are in
 * **milliseconds**.
 */
export interface ClientOptions {
  /** The API key from the portal. Defaults to the `UNICOM360_API_KEY` environment variable. */
  apiKey?: string | undefined;
  /**
   * Defaults to `UNICOM360_BASE_URL`, else `https://api.unicom360.com`. Must be https, or http
   * to localhost, 127.0.0.0/8 or ::1. A path prefix is kept.
   */
  baseUrl?: string | undefined;
  /** Per attempt, from sending the request to receiving the whole body. Default 60000. */
  timeout?: number | undefined;
  /**
   * Connection establishment, TLS included. Default 10000. Passed to custom transports; with
   * the built-in `fetch` the runtime's own connect timeout (10 seconds in Node) also applies.
   */
  connectTimeout?: number | undefined;
  /** Retries after the first attempt (so at most `maxRetries + 1` attempts). Default 2. */
  maxRetries?: number | undefined;
  /** The longest wait before a retry. Default 60000. */
  maxRetryWait?: number | undefined;
  /**
   * Give every send without a `userReferenceId` a generated one (`u360-` and 32 hex
   * characters), so SMS and WhatsApp sends become safe to retry. Default false.
   */
  autoReferenceIds?: boolean | undefined;
  /** Appended to the User-Agent. */
  appInfo?: AppInfo | undefined;
  /** Replaces the HTTP layer (for tests or proxies). */
  transport?: Transport | undefined;
  /** The `fetch` the default transport uses. Defaults to the global `fetch`. */
  fetch?: FetchLike | undefined;
  /** Where log lines go. Silent by default; `UNICOM360_LOG=debug` or `info` logs to the console. */
  logger?: Logger | undefined;
  /** Test seam: the current time in milliseconds since the epoch. Default `Date.now`. */
  clock?: (() => number) | undefined;
  /** Test seam: waits the given milliseconds. Every retry wait goes through it. */
  sleeper?: ((milliseconds: number) => Promise<void> | void) | undefined;
  /** Test seam: a number in [0, 1) for retry jitter. Default `Math.random`. */
  random?: (() => number) | undefined;
  /**
   * The client refuses to run in a web browser, where every visitor could read the API key.
   * Set this to true only if you understand that risk.
   */
  dangerouslyAllowBrowser?: boolean | undefined;
}

/** Overrides for one call. Durations are in milliseconds. */
export interface RequestOptions {
  /** The per-attempt timeout for this call. */
  timeout?: number | undefined;
  /** The retry limit for this call. */
  maxRetries?: number | undefined;
}

const DEFAULT_BASE_URL = "https://api.unicom360.com";

/** @internal Resolved, validated options. */
export interface ResolvedOptions {
  readonly apiKey: string;
  readonly baseUrl: string;
  readonly timeout: number;
  readonly connectTimeout: number;
  readonly maxRetries: number;
  readonly maxRetryWait: number;
  readonly autoReferenceIds: boolean;
  readonly appInfo: AppInfo | undefined;
  readonly transport: Transport | undefined;
  readonly fetch: FetchLike | undefined;
  readonly logger: Logger | undefined;
  readonly clock: (() => number) | undefined;
  readonly sleeper: ((milliseconds: number) => Promise<void> | void) | undefined;
  readonly random: (() => number) | undefined;
  readonly dangerouslyAllowBrowser: boolean;
}

function positive(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ConfigurationError(`${name} must be a positive number of milliseconds`);
  }
  return value;
}

function nonNegative(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ConfigurationError(`${name} must be a number of milliseconds, 0 or more`);
  }
  return value;
}

function retries(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 0) {
    throw new ConfigurationError(`${name} must be a whole number, 0 or more`);
  }
  return value;
}

const LOOPBACK_V4 = /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/** @internal Applies the base URL rules (section 3.2 of the SDK contract). */
export function resolveBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError(
      "baseUrl must be an absolute URL such as https://api.unicom360.com",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new ConfigurationError(`baseUrl must use https (got ${url.protocol.replace(/:$/, "")})`);
  }
  const host = url.hostname;
  if (host === "") throw new ConfigurationError("baseUrl must have a host");
  if (
    url.protocol === "http:" &&
    host !== "localhost" &&
    host !== "[::1]" &&
    !LOOPBACK_V4.test(host)
  ) {
    throw new ConfigurationError(
      "baseUrl must use https; plain http is allowed only for localhost, 127.0.0.0/8 and ::1",
    );
  }
  if (url.search !== "" || url.hash !== "" || value.includes("?") || value.includes("#")) {
    throw new ConfigurationError("baseUrl must not have a query string or fragment");
  }
  if (url.username !== "" || url.password !== "") {
    throw new ConfigurationError("baseUrl must not contain a user name or password");
  }
  return `${url.protocol}//${url.host}${url.pathname.replace(/\/+$/, "")}`;
}

/** @internal Resolves and validates client options. */
export function resolveOptions(options: ClientOptions): ResolvedOptions {
  if (isBrowser() && options.dangerouslyAllowBrowser !== true) {
    throw new ConfigurationError(
      "The Unicom360 client refuses to run in a web browser, where it would expose your API key " +
        "to every visitor. Call the API from your server. If you understand the risk, pass " +
        "dangerouslyAllowBrowser: true.",
    );
  }
  const apiKey = options.apiKey !== undefined ? options.apiKey : readEnv("UNICOM360_API_KEY");
  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new ConfigurationError(
      "Missing API key: pass apiKey or set the UNICOM360_API_KEY environment variable",
    );
  }
  const envBaseUrl = readEnv("UNICOM360_BASE_URL");
  const baseUrl =
    options.baseUrl !== undefined
      ? options.baseUrl
      : envBaseUrl !== undefined && envBaseUrl !== ""
        ? envBaseUrl
        : DEFAULT_BASE_URL;
  if (options.appInfo !== undefined) {
    const name: unknown = options.appInfo.name;
    if (typeof name !== "string" || name.trim() === "") {
      throw new ConfigurationError("appInfo.name must be a non-empty string");
    }
  }
  return {
    apiKey,
    baseUrl: resolveBaseUrl(baseUrl),
    timeout: positive("timeout", options.timeout, 60_000),
    connectTimeout: positive("connectTimeout", options.connectTimeout, 10_000),
    maxRetries: retries("maxRetries", options.maxRetries, 2),
    maxRetryWait: nonNegative("maxRetryWait", options.maxRetryWait, 60_000),
    autoReferenceIds: options.autoReferenceIds === true,
    appInfo: options.appInfo,
    transport: options.transport,
    fetch: options.fetch,
    logger: options.logger,
    clock: options.clock,
    sleeper: options.sleeper,
    random: options.random,
    dangerouslyAllowBrowser: options.dangerouslyAllowBrowser === true,
  };
}

/** @internal */
export function userAgent(appInfo: AppInfo | undefined): string {
  let ua = `unicom360-node/${VERSION} ${runtimeDescription()}`;
  if (appInfo !== undefined) {
    ua += ` ${appInfo.name}`;
    if (appInfo.version !== undefined && appInfo.version !== "") ua += `/${appInfo.version}`;
    if (appInfo.url !== undefined && appInfo.url !== "") ua += ` (+${appInfo.url})`;
  }
  return ua;
}

/** One call, ready to send: the HTTP request and what the retry rules need. */
interface PreparedCall {
  readonly spec: OperationSpec;
  readonly http: TransportRequest;
  /** Whether a failure after the request may have reached the gateway can be retried. */
  readonly safe: boolean;
  /** References generated by `autoReferenceIds`, for the debug log. */
  readonly generated: readonly string[];
}

const defaultSleeper = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const clocks = globalThis as { performance?: { now(): number } };

const monotonic = (): number =>
  typeof clocks.performance?.now === "function" ? clocks.performance.now() : Date.now();

/** @internal Sends requests for the resources: retries, interpretation and logging. */
export class ClientCore {
  readonly options: ResolvedOptions;
  readonly #transport: Transport;
  readonly #logger: Logger;
  readonly #clock: () => number;
  readonly #sleeper: (milliseconds: number) => Promise<void> | void;
  readonly #random: () => number;
  readonly #userAgent: string;
  readonly #browser: boolean;

  constructor(options: ClientOptions) {
    this.options = resolveOptions(options);
    const resolved = this.options;
    if (resolved.transport !== undefined) {
      this.#transport = resolved.transport;
    } else {
      const fetchImpl: FetchLike | undefined =
        resolved.fetch ??
        (typeof globalThis.fetch === "function"
          ? (url, init) => globalThis.fetch(url, init)
          : undefined);
      if (fetchImpl === undefined) {
        throw new ConfigurationError(
          "No fetch implementation is available: pass the fetch or transport option",
        );
      }
      this.#transport = fetchTransport(fetchImpl);
    }
    this.#logger = resolved.logger ?? defaultLogger();
    this.#clock = resolved.clock ?? Date.now;
    this.#sleeper = resolved.sleeper ?? defaultSleeper;
    this.#random = resolved.random ?? Math.random;
    this.#userAgent = userAgent(resolved.appInfo);
    this.#browser = isBrowser();
  }

  async request(
    operation: OperationName,
    body: JsonObject | undefined,
    requestOptions: RequestOptions | undefined,
  ): Promise<JsonObject> {
    const spec = OPERATIONS[operation];
    const timeout = positive("timeout", requestOptions?.timeout, this.options.timeout);
    const maxRetries = retries("maxRetries", requestOptions?.maxRetries, this.options.maxRetries);
    const prepared = this.options.autoReferenceIds
      ? addReferences(spec, body)
      : { body, generated: [] };
    const headers: Record<string, string> = { Accept: "application/json" };
    if (this.#browser) headers["X-Unicom360-Client"] = this.#userAgent;
    else headers["User-Agent"] = this.#userAgent;
    if (spec.auth) headers["X-API-Key"] = this.options.apiKey;
    if (prepared.body !== undefined) headers["Content-Type"] = "application/json";
    const call: PreparedCall = {
      spec,
      http: {
        method: spec.method,
        url: this.options.baseUrl + spec.path,
        headers,
        body: prepared.body === undefined ? undefined : JSON.stringify(prepared.body),
        timeout,
        connectTimeout: this.options.connectTimeout,
      },
      safe: isRetrySafe(spec, prepared.body),
      generated: prepared.generated,
    };

    for (let attempt = 1; ; attempt++) {
      const outcome = await this.#attempt(call, attempt);
      if (outcome.ok) return outcome.json;
      const { error, retryable } = outcome;
      if (!retryable || attempt > maxRetries) throw error;
      let wait: number;
      if (error instanceof RateLimitError) {
        if (error.retryAfter > this.options.maxRetryWait) throw error;
        wait = Math.max(1000, error.retryAfter + this.#random() * 1000);
      } else {
        wait = this.#random() * Math.min(8000, 500 * 2 ** attempt, this.options.maxRetryWait);
      }
      this.#logger.info("unicom360 retry scheduled", {
        attempt,
        wait_s: Math.round(wait) / 1000,
        cause:
          error instanceof APIError || error instanceof APIStatusError ? error.code : error.type,
      });
      await this.#sleeper(wait);
    }
  }

  async #attempt(
    call: PreparedCall,
    attempt: number,
  ): Promise<
    { ok: true; json: JsonObject } | { ok: false; error: Unicom360Error; retryable: boolean }
  > {
    const started = monotonic();
    let response: TransportResponse;
    try {
      response = await this.#transport(call.http);
    } catch (thrown) {
      const failure =
        thrown instanceof TransportError
          ? thrown
          : new TransportError({ sent: true, timeout: false, cause: thrown });
      const error = connectionError(failure, attempt);
      this.#logAttempt(call, attempt, started, { status: null, error: error.type });
      return { ok: false, error, retryable: !failure.sent || call.safe };
    }
    const outcome = interpret(call.spec, response, attempt, this.#clock());
    this.#logAttempt(call, attempt, started, {
      status: response.status,
      api_reference:
        isObject(outcome.json) && typeof outcome.json.api_reference === "string"
          ? outcome.json.api_reference
          : null,
    });
    if (outcome.ok) return outcome;
    const { error } = outcome;
    const retryable =
      error instanceof RateLimitError ||
      ((error instanceof APIServerError ||
        (error instanceof APIError && error.code === "SEND_FAILED")) &&
        call.safe);
    return { ok: false, error, retryable };
  }

  #logAttempt(
    call: PreparedCall,
    attempt: number,
    started: number,
    fields: Record<string, unknown>,
  ): void {
    this.#logger.debug("unicom360 request", {
      method: call.spec.method,
      path: call.spec.path,
      ...fields,
      attempt,
      duration_ms: Math.round(monotonic() - started),
      ...(call.generated.length > 0 ? { generated_user_reference_ids: call.generated } : {}),
    });
  }
}

function describeCause(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current instanceof Error && current.cause !== undefined;
    depth++
  ) {
    current = current.cause;
    if (current instanceof Error && current.message !== "") message = current.message;
  }
  return message;
}

function connectionError(failure: TransportError, attempts: number): APIConnectionError {
  const maybeSent = failure.sent ? "; the gateway may have processed the request" : "";
  const cause = failure.cause ?? failure;
  if (failure.timeout) {
    return new APITimeoutError(`The request to the Unicom360 API timed out${maybeSent}`, {
      attempts,
      cause,
    });
  }
  return new APIConnectionError(
    `Could not complete the request to the Unicom360 API (${describeCause(failure)})${maybeSent}`,
    { attempts, cause },
  );
}
