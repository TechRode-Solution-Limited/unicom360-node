/** A JSON value as parsed from a response body. */
export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;

/** A JSON object as parsed from a response body. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** @internal */
export function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @internal Parses JSON text; an empty or invalid body gives `undefined`. */
export function parseJson(text: string): JsonValue | undefined {
  if (text === "") return undefined;
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

/** @internal A string field: anything else is null. */
export function str(value: JsonValue | undefined): string | null {
  return typeof value === "string" ? value : null;
}

/**
 * @internal An identifier the gateway may send as a number (the email `message_id`, a rejected
 * template recipient's `to` and `user_reference_id`): always a string in the models.
 */
export function idString(value: JsonValue | undefined): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/** @internal A number field; a numeric string is accepted. */
export function num(value: JsonValue | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/** @internal */
export function bool(value: JsonValue | undefined): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** @internal */
export function objectOrNull(value: JsonValue | undefined): JsonObject | null {
  return isObject(value) ? value : null;
}

/** @internal The object entries of a JSON array (other entries are skipped). */
export function objects(value: JsonValue | undefined): JsonObject[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

/** @internal The string entries of a JSON array. */
export function strings(value: JsonValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * @internal Stores the JSON a model was parsed from as a read-only, non-enumerable `raw`
 * property, so logging or serialising a model shows its typed fields once.
 */
export function setRaw(target: object, raw: JsonObject): void {
  Object.defineProperty(target, "raw", {
    value: raw,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}
