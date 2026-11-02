import type { JsonObject, JsonValue } from "./json.js";
import { isObject } from "./json.js";

/** @internal The canonical operation names of the SDK contract. */
export type OperationName =
  | "sms.send"
  | "email.send"
  | "whatsapp.send_template"
  | "whatsapp.send_session"
  | "whatsapp.status"
  | "whatsapp.templates"
  | "balance.get"
  | "balance.all"
  | "health";

/** @internal */
export interface OperationSpec {
  readonly name: OperationName;
  readonly method: "GET" | "POST";
  readonly path: string;
  /** Whether the request carries the API key. */
  readonly auth: boolean;
  /** The flag a 2xx body must carry: `success`, `status` (balance) or none (health). */
  readonly envelope: "success" | "status" | "none";
  /** `x-retry-safe` in openapi.yaml. */
  readonly retry: "always" | "with-user-reference-id" | "never";
}

const op = (
  name: OperationName,
  method: "GET" | "POST",
  path: string,
  envelope: OperationSpec["envelope"],
  retry: OperationSpec["retry"],
): OperationSpec => ({ name, method, path, auth: name !== "health", envelope, retry });

/** @internal */
export const OPERATIONS: Readonly<Record<OperationName, OperationSpec>> = {
  "sms.send": op("sms.send", "POST", "/api/v1/json/bulk/sms", "success", "with-user-reference-id"),
  "email.send": op("email.send", "POST", "/api/v1/json/bulk/email", "success", "never"),
  "whatsapp.send_template": op(
    "whatsapp.send_template",
    "POST",
    "/api/v1/json/whatsapp/template",
    "success",
    "with-user-reference-id",
  ),
  "whatsapp.send_session": op(
    "whatsapp.send_session",
    "POST",
    "/api/v1/json/whatsapp/session",
    "success",
    "with-user-reference-id",
  ),
  "whatsapp.status": op(
    "whatsapp.status",
    "POST",
    "/api/v1/json/whatsapp/status",
    "success",
    "always",
  ),
  "whatsapp.templates": op(
    "whatsapp.templates",
    "GET",
    "/api/v1/json/whatsapp/templates",
    "success",
    "always",
  ),
  "balance.get": op("balance.get", "POST", "/api/v1/json/balance", "status", "always"),
  "balance.all": op("balance.all", "POST", "/api/v1/json/balance/all", "status", "always"),
  health: op("health", "GET", "/health", "none", "always"),
};

const hasReference = (value: JsonValue | undefined): boolean =>
  typeof value === "string" && value.trim() !== "";

/**
 * @internal Whether a call may be retried after the request may have reached the gateway (a
 * 5xx, `SEND_FAILED`, or a failure after sending). Decided from the body as sent.
 */
export function isRetrySafe(spec: OperationSpec, body: JsonObject | undefined): boolean {
  if (spec.retry === "always") return true;
  if (spec.retry === "never" || body === undefined) return false;
  if (spec.name === "whatsapp.send_template") {
    const recipients = body.recipients;
    return (
      Array.isArray(recipients) &&
      recipients.length > 0 &&
      recipients.every((r) => isObject(r) && hasReference(r.user_reference_id))
    );
  }
  return hasReference(body.user_reference_id);
}

function generateReference(): string {
  const crypto = (globalThis as { crypto?: Crypto }).crypto;
  if (crypto !== undefined && typeof crypto.randomUUID === "function") {
    return `u360-${crypto.randomUUID().replace(/-/g, "")}`;
  }
  const bytes = new Uint8Array(16);
  if (crypto !== undefined) crypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  return `u360-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * @internal With `autoReferenceIds`, gives a send without a `user_reference_id` a generated
 * one (each template recipient its own). A caller's reference is never replaced.
 */
export function addReferences(
  spec: OperationSpec,
  body: JsonObject | undefined,
): { body: JsonObject | undefined; generated: string[] } {
  const generated: string[] = [];
  if (body === undefined) return { body, generated };
  const reference = (): string => {
    const value = generateReference();
    generated.push(value);
    return value;
  };
  switch (spec.name) {
    case "sms.send":
    case "email.send":
    case "whatsapp.send_session":
      if (body.user_reference_id !== undefined) return { body, generated };
      return { body: { ...body, user_reference_id: reference() }, generated };
    case "whatsapp.send_template": {
      if (!Array.isArray(body.recipients)) return { body, generated };
      const recipients = body.recipients.map((r) =>
        isObject(r) && r.user_reference_id === undefined
          ? { ...r, user_reference_id: reference() }
          : r,
      );
      return { body: { ...body, recipients }, generated };
    }
    default:
      return { body, generated };
  }
}
