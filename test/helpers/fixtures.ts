import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CONFORMANCE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "conformance");

/** One fixture file as JSON. */
export function loadFixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(join(CONFORMANCE_DIR, relativePath), "utf8"));
}

export interface HttpFixture {
  status: number;
  headers: Record<string, string>;
  body_text: string;
}

export interface FixtureFile<V> {
  version: string;
  description: string;
  vectors: V[];
}

export interface RequestVector {
  id: string;
  description?: string;
  operation: string;
  params: Record<string, unknown>;
  expect: {
    method: string;
    path: string;
    headers: Record<string, string>;
    absent_headers: string[];
    user_agent_prefix: string;
    json: Record<string, unknown> | null;
    absent_keys: string[];
  };
}

export interface RequestsFile extends FixtureFile<RequestVector> {
  canned_responses: Record<string, HttpFixture>;
}

export interface ExpectedError {
  type: string;
  class: string;
  code: string | null;
  message?: string | null;
  api_reference?: string | null;
  http_status: number | null;
  data_present?: boolean;
  retry_after?: number;
}

export interface ResponseVector {
  id: string;
  description?: string;
  operation: string;
  now_unix?: number;
  off_spec?: boolean;
  http: HttpFixture;
  expect:
    | { result: Record<string, unknown>; helpers?: Record<string, unknown> }
    | { error: ExpectedError };
}

export type RetryStep = { http: HttpFixture } | { transport: string };

export interface RetryVector {
  id: string;
  description?: string;
  operation: string;
  params: Record<string, unknown>;
  now_unix: number;
  config: { max_retries: number; max_retry_wait: number };
  steps: RetryStep[];
  expect: {
    attempts: number;
    sleeps: { min: number; max: number }[];
    outcome: { kind: "result" } | ({ kind: "error" } & ExpectedError);
  };
}

export interface ErrorCodeVector {
  id: string;
  message: string;
  code: string;
  source: string;
  note?: string;
}

export interface CallbackVector {
  id: string;
  description?: string;
  kind: "sms" | "email";
  off_spec?: boolean;
  body_text: string;
  expect: { result: Record<string, unknown> } | { error: true };
}

export interface Gsm7Vector {
  id: string;
  description?: string;
  text: string;
  is_gsm7: boolean;
  length: number;
  units: number;
  non_gsm: { char: string; index: number }[];
  validate: string[];
}

export interface Gsm7File extends FixtureFile<Gsm7Vector> {
  charset: string;
  max_length: number;
  unit_length: number;
}

export interface SignatureVector {
  id: string;
  description: string;
  secret: string;
  headers: Record<string, string>;
  body_base64: string;
  body_text: string;
  now_unix: number;
  tolerance: number;
  expect: { valid: true } | { valid: false; reason: string };
}

export interface SignaturesFile extends FixtureFile<SignatureVector> {
  algorithm: string;
}

export interface EventVector {
  id: string;
  description?: string;
  secret: string;
  headers: Record<string, string>;
  body_text: string;
  now_unix: number;
  tolerance: number;
  expect: {
    kind: "message_status" | "message_received" | "test" | "unknown";
    event: string;
    delivery_id: string | null;
    created_at: string | null;
    data: unknown;
  };
}
