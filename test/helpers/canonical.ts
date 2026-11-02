// Turns SDK models into the canonical JSON of conformance/README.md ("Canonical form and
// comparison"): built from the typed fields (API snake_case names) plus every unknown field the
// model kept in `raw`. Test-only; not public API.
import type { JsonObject, JsonValue } from "../../src/index.js";

type Model = object & { readonly raw: JsonObject };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);

/** A model is an object whose `raw` is a non-enumerable own property. */
function isModel(value: unknown): value is Model {
  if (value === null || typeof value !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(value, "raw");
  return descriptor !== undefined && !descriptor.enumerable;
}

const camelToSnake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

// The only renamed fields (docs/sdk-design.md 6.2): the template counts.
const RENAMES: Readonly<Record<string, string>> = {
  acceptedCount: "accepted",
  rejectedCount: "rejected",
};

// Fields that are SDK conveniences, not API fields.
const SKIP = new Set(["kind"]);

function canonicalValue(value: unknown): JsonValue {
  if (isModel(value)) return canonicalModel(value, value.raw, new Set());
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (isPlainObject(value)) {
    // Raw JSON carried by a typed field (a balances map, a payload, unknown event data).
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, canonicalValue(v)]));
  }
  if (value === undefined) return null;
  return value as JsonValue;
}

/**
 * `source` is the JSON the model's fields came from (for an envelope, the envelope with `data`
 * flattened in); `envelopeKeys` are wire keys consumed by the envelope itself.
 */
function canonicalModel(model: Model, source: JsonObject, envelopeKeys: Set<string>): JsonObject {
  const typed: JsonObject = {};
  for (const [key, value] of Object.entries(model)) {
    if (typeof value === "function" || SKIP.has(key)) continue;
    typed[RENAMES[key] ?? camelToSnake(key)] = canonicalValue(value);
  }
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (!(key in typed) && !envelopeKeys.has(key)) out[key] = value;
  }
  return { ...out, ...typed };
}

/** The canonical result of an operation (conformance/README.md, per-operation table). */
export function canonicalResult(operation: string, result: Model): JsonObject {
  const raw = result.raw;
  if (operation === "health") return canonicalModel(result, raw, new Set());
  if (operation === "balance.get" || operation === "balance.all") {
    return canonicalModel(result, raw, new Set(["status"]));
  }
  const data = raw.data;
  const source: JsonObject = { ...raw };
  if (isPlainObject(data)) Object.assign(source, data);
  return canonicalModel(result, source, new Set(["success", "data"]));
}

/** The canonical form of any other model (event data, callback reports). */
export function canonical(value: unknown): JsonValue {
  return canonicalValue(value);
}

/** Removes every object member whose value is null, recursively. */
export function dropNulls(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([k, v]) => [k, dropNulls(v)]),
    );
  }
  return value;
}

/** Strict JSON equality for request bodies: no extra keys, nulls count, numbers by value. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, i) => jsonEqual(item, b[i]))
    );
  }
  if (isPlainObject(a) || isPlainObject(b)) {
    if (!isPlainObject(a) || !isPlainObject(b)) return false;
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return ka.length === kb.length && ka.every((k, i) => k === kb[i] && jsonEqual(a[k], b[k]));
  }
  return a === b;
}

/** Whether a JSON Pointer (RFC 6901) resolves in `document`. */
export function pointerExists(document: unknown, pointer: string): boolean {
  const tokens = pointer
    .split("/")
    .slice(1)
    .map((t) => t.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = document;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(token) || Number(token) >= current.length) return false;
      current = current[Number(token)];
    } else if (isPlainObject(current)) {
      if (!Object.prototype.hasOwnProperty.call(current, token)) return false;
      current = current[token];
    } else {
      return false;
    }
  }
  return true;
}
