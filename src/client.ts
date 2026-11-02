import { ClientCore, type ClientOptions, type RequestOptions } from "./core/client-core.js";
import { Health } from "./models/account.js";
import { BalanceResource, EmailResource, SmsResource, WhatsAppResource } from "./resources.js";

const REDACTED = "[REDACTED]";

/**
 * The Unicom360 API client.
 *
 * ```ts
 * import { Unicom360 } from "unicom360";
 *
 * const client = new Unicom360(); // reads UNICOM360_API_KEY
 * const result = await client.sms.send({
 *   from: "Unicom360",
 *   to: "260971234567",
 *   message: "Your order ZM4821 is ready.",
 * });
 * ```
 *
 * A client is immutable and safe to share. It never prints its API key: `toString()`,
 * `JSON.stringify()` and `console.log()` show `[REDACTED]`.
 */
export class Unicom360 {
  /** Send SMS. */
  readonly sms: SmsResource;
  /** Send email. */
  readonly email: EmailResource;
  /** WhatsApp templates, session messages and message status. */
  readonly whatsapp: WhatsAppResource;
  /** Units remaining on your bundles. */
  readonly balance: BalanceResource;

  readonly #core: ClientCore;
  readonly #options: ClientOptions;

  /**
   * @param options - Every field is optional; the API key defaults to `UNICOM360_API_KEY`.
   * @throws {@link ConfigurationError} when the API key is missing, an option is invalid, or
   * the client runs in a web browser without `dangerouslyAllowBrowser`.
   */
  constructor(options: ClientOptions = {}) {
    this.#core = new ClientCore(options);
    // Keep what was given, with the key and base URL resolved, for withOptions().
    this.#options = {
      ...options,
      apiKey: this.#core.options.apiKey,
      baseUrl: this.#core.options.baseUrl,
    };
    this.sms = new SmsResource(this.#core);
    this.email = new EmailResource(this.#core);
    this.whatsapp = new WhatsAppResource(this.#core);
    this.balance = new BalanceResource(this.#core);
  }

  /** The base URL requests go to, without a trailing slash. */
  get baseUrl(): string {
    return this.#core.options.baseUrl;
  }

  /** A new client with these options changed and the rest kept. */
  withOptions(options: ClientOptions): Unicom360 {
    const changed = Object.fromEntries(
      Object.entries(options).filter(([, value]) => value !== undefined),
    ) as ClientOptions;
    return new Unicom360({ ...this.#options, ...changed });
  }

  /** Gateway liveness. Needs no API key and sends none. */
  async health(options?: RequestOptions): Promise<Health> {
    const json = await this.#core.request("health", undefined, options);
    return new Health(json);
  }

  #summary(): Record<string, unknown> {
    const o = this.#core.options;
    return {
      baseUrl: o.baseUrl,
      apiKey: REDACTED,
      timeout: o.timeout,
      connectTimeout: o.connectTimeout,
      maxRetries: o.maxRetries,
      maxRetryWait: o.maxRetryWait,
      autoReferenceIds: o.autoReferenceIds,
    };
  }

  /** `Unicom360 { baseUrl: ..., apiKey: [REDACTED], ... }`. */
  toString(): string {
    const fields = Object.entries(this.#summary())
      .map(([key, value]) => `${key}: ${value === REDACTED ? REDACTED : JSON.stringify(value)}`)
      .join(", ");
    return `Unicom360 { ${fields} }`;
  }

  /** The client's settings with the API key redacted. */
  toJSON(): Record<string, unknown> {
    return this.#summary();
  }

  /** @internal Node's `util.inspect` and `console.log`. */
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return this.toString();
  }

  /** @internal Deno's `Deno.inspect` and `console.log`. */
  [Symbol.for("Deno.customInspect")](): string {
    return this.toString();
  }
}
