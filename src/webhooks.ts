/**
 * Verify and parse what Unicom360 posts to your server: the signed WhatsApp webhooks, and the
 * unsigned SMS and email delivery reports. No client is needed.
 *
 * ```ts
 * import { Webhooks } from "unicom360";
 *
 * const event = await Webhooks.constructEvent(rawBody, request.headers, secret);
 * ```
 *
 * @module
 */
import { ConfigurationError, SignatureVerificationError, Unicom360Error } from "./errors.js";
import { isObject, parseJson, type JsonObject } from "./core/json.js";
import { EmailDeliveryReport } from "./models/email.js";
import {
  MessageReceivedEvent,
  MessageStatusEvent,
  TestEvent,
  UnknownEvent,
  type WebhookEvent,
} from "./models/events.js";
import { SmsDeliveryReport } from "./models/sms.js";

/** The header carrying the signature: `sha256=` and 64 lowercase hex characters. */
export const SIGNATURE_HEADER = "X-Unicom360-Signature";
/** The header carrying the Unix time (seconds) the delivery was signed at. */
export const TIMESTAMP_HEADER = "X-Unicom360-Timestamp";
/** The header carrying the delivery id, the same on every retry of one delivery. */
export const DELIVERY_HEADER = "X-Unicom360-Delivery";
/** The header carrying the event name (informational; the body's `event` decides). */
export const EVENT_HEADER = "X-Unicom360-Event";
/** The default tolerance for the signing time: 300 seconds, in milliseconds. */
export const DEFAULT_TOLERANCE = 300_000;

/**
 * Request headers: a fetch `Headers` object, Node's `req.headers`, or a plain object. Names
 * are matched case-insensitively; with several values, the first is used.
 */
export type HeadersInput =
  | { get(name: string): string | null }
  | Readonly<Record<string, string | readonly string[] | null | undefined>>;

/**
 * The raw request body, exactly as received and before any JSON parsing: a string (read as
 * UTF-8), a Buffer or Uint8Array, or an ArrayBuffer.
 */
export type RawBody = string | Uint8Array | ArrayBuffer;

/** Options of {@link verify} and {@link constructEvent}. */
export interface VerifyOptions {
  /** How far the signing time may be from now, in milliseconds. Default 300000 (5 minutes). */
  tolerance?: number | undefined;
  /** The current time in milliseconds since the epoch. Default `Date.now()`. */
  now?: number | undefined;
}

function header(headers: HeadersInput, name: string): string | undefined {
  if (typeof (headers as { get?: unknown }).get === "function") {
    return (headers as { get(name: string): string | null }).get(name) ?? undefined;
  }
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(
    headers as Readonly<Record<string, string | readonly string[] | null | undefined>>,
  )) {
    if (key.toLowerCase() !== wanted) continue;
    if (value === null || value === undefined) return undefined;
    return typeof value === "string" ? value : value[0];
  }
  return undefined;
}

const encoder = new TextEncoder();

function bodyBytes(rawBody: RawBody): Uint8Array<ArrayBuffer> {
  if (typeof rawBody === "string") return encoder.encode(rawBody);
  if (rawBody instanceof ArrayBuffer) return new Uint8Array(rawBody.slice(0));
  if (ArrayBuffer.isView(rawBody)) {
    const copy = new Uint8Array(rawBody.byteLength);
    copy.set(new Uint8Array(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength));
    return copy;
  }
  throw new Unicom360Error(
    "The webhook body must be the raw request body (a string, Buffer, Uint8Array or ArrayBuffer), " +
      'not parsed JSON. With Express, use express.raw({ type: "application/json" }).',
  );
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function subtleCrypto(): SubtleCrypto {
  const subtle = (globalThis as { crypto?: Crypto }).crypto?.subtle;
  if (subtle === undefined) {
    throw new ConfigurationError("Web Crypto (crypto.subtle) is not available in this runtime");
  }
  return subtle;
}

/**
 * Verifies a signed webhook delivery. Resolves when the signature is valid; otherwise rejects
 * with a {@link SignatureVerificationError} whose `reason` says which check failed:
 *
 * 1. `missing_signature`: no `X-Unicom360-Signature` header;
 * 2. `missing_timestamp`: no `X-Unicom360-Timestamp` header;
 * 3. `invalid_timestamp`: the timestamp is not a whole number;
 * 4. `malformed_signature`: not `sha256=` and 64 lowercase hex characters;
 * 5. `timestamp_out_of_tolerance`: signed more than `tolerance` from now (replay protection);
 * 6. `signature_mismatch`: the HMAC does not match (wrong secret, or the body was changed).
 *
 * The HMAC-SHA256 key is the webhook secret's own UTF-8 bytes (never base64-decode it), over
 * `"<timestamp>.<raw body>"`, compared in constant time.
 *
 * @param rawBody - The body exactly as received, before JSON parsing.
 * @param headers - The request headers.
 * @param secret - The 43-character webhook secret from the portal.
 */
export async function verify(
  rawBody: RawBody,
  headers: HeadersInput,
  secret: string,
  options: VerifyOptions = {},
): Promise<void> {
  if (typeof secret !== "string" || secret === "") {
    throw new ConfigurationError("The webhook secret is missing");
  }
  const body = bodyBytes(rawBody);
  const signature = header(headers, SIGNATURE_HEADER);
  if (signature === undefined || signature === "") {
    throw new SignatureVerificationError("missing_signature");
  }
  const timestamp = header(headers, TIMESTAMP_HEADER);
  if (timestamp === undefined || timestamp === "") {
    throw new SignatureVerificationError("missing_timestamp");
  }
  if (!/^[0-9]+$/.test(timestamp)) throw new SignatureVerificationError("invalid_timestamp");
  if (!/^sha256=[0-9a-f]{64}$/.test(signature)) {
    throw new SignatureVerificationError("malformed_signature");
  }
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const now = options.now ?? Date.now();
  const signedAt = Number(timestamp) * 1000;
  if (!Number.isFinite(signedAt) || Math.abs(now - signedAt) > tolerance) {
    throw new SignatureVerificationError("timestamp_out_of_tolerance");
  }

  const prefix = encoder.encode(`${timestamp}.`);
  const message = new Uint8Array(prefix.length + body.length);
  message.set(prefix, 0);
  message.set(body, prefix.length);
  const subtle = subtleCrypto();
  const key = await subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  // subtle.verify compares the MAC in constant time.
  const valid = await subtle.verify("HMAC", key, hexToBytes(signature.slice(7)), message);
  if (!valid) throw new SignatureVerificationError("signature_mismatch");
}

function headerOrNull(headers: HeadersInput, name: string): string | null {
  return header(headers, name) ?? null;
}

function parseObject(rawBody: RawBody, what: string): JsonObject {
  const text = typeof rawBody === "string" ? rawBody : new TextDecoder().decode(bodyBytes(rawBody));
  const json = parseJson(text);
  if (!isObject(json)) throw new Unicom360Error(`The ${what} is not a JSON object`);
  return json;
}

/**
 * Verifies a signed webhook delivery (see {@link verify}), then parses it into a
 * {@link MessageStatusEvent}, {@link MessageReceivedEvent}, {@link TestEvent} or
 * {@link UnknownEvent}, chosen by the body's `event`.
 *
 * Deliveries are retried (30s, 2m, 10m, 30m, 1h, 3h, 6h, 12h) on any non-2xx answer, so answer
 * 2xx quickly and drop repeats by `deliveryId`.
 *
 * @throws {@link SignatureVerificationError} when verification fails;
 * {@link Unicom360Error} when the body is not a JSON object with a string `event`.
 */
export async function constructEvent(
  rawBody: RawBody,
  headers: HeadersInput,
  secret: string,
  options: VerifyOptions = {},
): Promise<WebhookEvent> {
  await verify(rawBody, headers, secret, options);
  const json = parseObject(rawBody, "webhook body");
  if (typeof json.event !== "string") {
    throw new Unicom360Error("The webhook body has no string event");
  }
  const deliveryId = headerOrNull(headers, DELIVERY_HEADER);
  switch (json.event) {
    case "message.status":
      return new MessageStatusEvent(json, deliveryId);
    case "message.received":
      return new MessageReceivedEvent(json, deliveryId);
    case "webhook.test":
      return new TestEvent(json, deliveryId);
    default:
      return new UnknownEvent(json, deliveryId);
  }
}

/**
 * Parses an SMS delivery report posted to your `callback_url`.
 *
 * These callbacks are **unsigned** and never retried: anyone who knows the URL can post one, so
 * treat a report as a hint (for example, re-check before refunding a customer).
 *
 * @throws {@link Unicom360Error} when the body is not a JSON object.
 */
export function parseSmsCallback(rawBody: RawBody): SmsDeliveryReport {
  return new SmsDeliveryReport(parseObject(rawBody, "SMS delivery report"));
}

/**
 * Parses an email delivery report posted to your `callback_url`. `messageId` is a string,
 * although the wire sends a number.
 *
 * These callbacks are **unsigned** and never retried: treat a report as a hint.
 *
 * @throws {@link Unicom360Error} when the body is not a JSON object.
 */
export function parseEmailCallback(rawBody: RawBody): EmailDeliveryReport {
  return new EmailDeliveryReport(parseObject(rawBody, "email delivery report"));
}
