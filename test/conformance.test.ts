// Runs every vector of the vendored Unicom360 conformance fixtures (test/conformance, see its
// README.md) through the public API, with an injected transport, clock, sleeper and random.
// A vector the harness does not understand fails; nothing is skipped.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIError,
  APIServerError,
  APIStatusError,
  APITimeoutError,
  AuthenticationError,
  ConfigurationError,
  DuplicateReferenceError,
  InsufficientBundleError,
  InvalidRequestError,
  MessageReceivedEvent,
  MessageStatusEvent,
  NoValidRecipientsError,
  RateLimitError,
  SessionWindowClosedError,
  SignatureVerificationError,
  TestEvent,
  TransportError,
  Unicom360,
  Unicom360Error,
  UnknownEvent,
  Webhooks,
  gsm,
  normalizeCode,
  type Transport,
  type TransportRequest,
} from "../src/index.js";
import { callOperation, OPERATIONS } from "./helpers/calls.js";
import {
  canonical,
  canonicalResult,
  dropNulls,
  jsonEqual,
  pointerExists,
} from "./helpers/canonical.js";
import {
  CONFORMANCE_DIR,
  loadFixture,
  type CallbackVector,
  type ErrorCodeVector,
  type EventVector,
  type ExpectedError,
  type FixtureFile,
  type Gsm7File,
  type HttpFixture,
  type RequestsFile,
  type ResponseVector,
  type RetryVector,
  type SignaturesFile,
} from "./helpers/fixtures.js";

const FILES = {
  requests: "requests.json",
  responses: "responses.json",
  retries: "retries.json",
  errorCodes: "error-codes.json",
  callbacks: "callbacks.json",
  gsm7: "gsm7.json",
  signatures: "webhooks/signatures.json",
  events: "webhooks/events.json",
} as const;

const requests = loadFixture(FILES.requests) as RequestsFile;
const responses = loadFixture(FILES.responses) as FixtureFile<ResponseVector>;
const retries = loadFixture(FILES.retries) as FixtureFile<RetryVector>;
const errorCodes = loadFixture(FILES.errorCodes) as FixtureFile<ErrorCodeVector>;
const callbacks = loadFixture(FILES.callbacks) as FixtureFile<CallbackVector>;
const gsm7 = loadFixture(FILES.gsm7) as Gsm7File;
const signatures = loadFixture(FILES.signatures) as SignaturesFile;
const events = loadFixture(FILES.events) as FixtureFile<EventVector>;

const API_KEY = "test-api-key";

const ERROR_CLASSES: Record<string, abstract new (...args: never[]) => Unicom360Error> = {
  Unicom360Error,
  ConfigurationError,
  APIConnectionError,
  APITimeoutError,
  APIStatusError,
  AuthenticationError,
  RateLimitError,
  InvalidRequestError,
  APIServerError,
  APIError,
  InsufficientBundleError,
  DuplicateReferenceError,
  NoValidRecipientsError,
  SessionWindowClosedError,
  SignatureVerificationError,
};

/** Fails on a vector field the harness does not handle, rather than ignoring it. */
function assertKeys(where: string, value: object, allowed: readonly string[]): void {
  const unknown = Object.keys(value).filter((k) => !allowed.includes(k));
  expect(unknown, `${where} has fields the harness does not understand`).toEqual([]);
}

const answer = (http: HttpFixture) => ({
  status: http.status,
  headers: http.headers,
  body: http.body_text,
});

/** The first requests.json params for an operation: valid parameters for any response vector. */
function validParams(operation: string): Record<string, unknown> {
  const vector = requests.vectors.find((v) => v.operation === operation);
  if (vector === undefined) throw new Error(`requests.json has no vector for ${operation}`);
  return vector.params;
}

async function failure(promise: Promise<unknown>): Promise<Unicom360Error> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Unicom360Error);
    return error as Unicom360Error;
  }
  throw new Error("expected the call to fail, but it succeeded");
}

function field(error: Unicom360Error, name: "code" | "data"): unknown {
  return name in error ? (error as unknown as Record<string, unknown>)[name] : null;
}

function assertError(error: Unicom360Error, expected: ExpectedError): void {
  expect(error.type).toBe(expected.type);
  expect(error.name).toBe(expected.class);
  const cls = ERROR_CLASSES[expected.class];
  expect(cls, `unknown error class ${expected.class}`).toBeDefined();
  expect(error).toBeInstanceOf(cls!);
  expect(field(error, "code") ?? null).toBe(expected.code);
  expect(error.httpStatus).toBe(expected.http_status);
}

describe("vendored fixtures", () => {
  it("are an unmodified copy of the version named in VERSION", () => {
    const version = Object.fromEntries(
      readFileSync(join(CONFORMANCE_DIR, "VERSION"), "utf8")
        .split("\n")
        .filter((line) => line.includes("="))
        .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
    );
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else files.push(relative(CONFORMANCE_DIR, path).split(sep).join("/"));
      }
    };
    walk(CONFORMANCE_DIR);
    const listing = files
      .filter((f) => f !== "VERSION")
      .sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map((f) => {
        const digest = createHash("sha256").update(readFileSync(join(CONFORMANCE_DIR, f)));
        return `${digest.digest("hex")}  ${f}\n`;
      })
      .join("");
    expect(version.source).toBe("unicom360-openapi");
    expect(version.tag).toBe("v0.1.0");
    expect(createHash("sha256").update(listing).digest("hex")).toBe(version.sha256);
  });

  it("are all run by this harness", () => {
    const fixtureFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "schema") walk(path);
        } else if (name.endsWith(".json")) {
          fixtureFiles.push(relative(CONFORMANCE_DIR, path).split(sep).join("/"));
        }
      }
    };
    walk(CONFORMANCE_DIR);
    expect(fixtureFiles.sort()).toEqual(Object.values(FILES).sort());
    for (const file of [
      requests,
      responses,
      retries,
      errorCodes,
      callbacks,
      gsm7,
      signatures,
      events,
    ]) {
      expect(file.version).toBe("0.1.0");
      expect(file.vectors.length).toBeGreaterThan(0);
    }
  });
});

describe(`requests.json (${requests.vectors.length} vectors)`, () => {
  it("has a canned response for every operation", () => {
    expect(Object.keys(requests.canned_responses).sort()).toEqual([...OPERATIONS].sort());
  });

  for (const vector of requests.vectors) {
    it(vector.id, async () => {
      assertKeys(vector.id, vector, ["id", "description", "operation", "params", "expect"]);
      assertKeys(`${vector.id}.expect`, vector.expect, [
        "method",
        "path",
        "headers",
        "absent_headers",
        "user_agent_prefix",
        "json",
        "absent_keys",
      ]);
      const canned = requests.canned_responses[vector.operation];
      expect(canned, `no canned response for ${vector.operation}`).toBeDefined();
      const sent: TransportRequest[] = [];
      const transport: Transport = (request) => {
        sent.push(request);
        return Promise.resolve(answer(canned!));
      };
      const client = new Unicom360({ apiKey: API_KEY, maxRetries: 0, transport });
      await callOperation(client, vector.operation, vector.params);

      expect(sent).toHaveLength(1);
      const request = sent[0]!;
      const { expect: want } = vector;
      expect(request.method).toBe(want.method);
      const url = new URL(request.url);
      const prefix = new URL(client.baseUrl).pathname.replace(/\/$/, "");
      expect(url.search).toBe("");
      expect(url.pathname.slice(prefix.length)).toBe(want.path);

      const headers = Object.fromEntries(
        Object.entries(request.headers).map(([k, v]) => [k.toLowerCase(), v]),
      );
      for (const [name, value] of Object.entries(want.headers)) {
        expect(headers[name], `header ${name}`).toBe(value.replace("<KEY>", API_KEY));
      }
      for (const name of want.absent_headers)
        expect(headers, `header ${name}`).not.toHaveProperty(name);
      expect(headers["user-agent"]?.startsWith(want.user_agent_prefix)).toBe(true);

      if (want.json === null) {
        expect(request.body === undefined || request.body === "").toBe(true);
      } else {
        const body: unknown = JSON.parse(request.body!);
        expect(jsonEqual(body, want.json), `body ${request.body!}`).toBe(true);
        for (const pointer of want.absent_keys) {
          expect(pointerExists(body, pointer), `${pointer} must be absent`).toBe(false);
        }
      }
    });
  }
});

describe(`responses.json (${responses.vectors.length} vectors)`, () => {
  for (const vector of responses.vectors) {
    it(vector.id, async () => {
      assertKeys(vector.id, vector, [
        "id",
        "description",
        "operation",
        "now_unix",
        "off_spec",
        "http",
        "expect",
      ]);
      const nowMs = vector.now_unix === undefined ? undefined : vector.now_unix * 1000;
      const client = new Unicom360({
        apiKey: API_KEY,
        maxRetries: 0,
        transport: () => Promise.resolve(answer(vector.http)),
        ...(nowMs === undefined ? {} : { clock: () => nowMs }),
      });
      const call = callOperation(client, vector.operation, validParams(vector.operation));

      if ("result" in vector.expect) {
        assertKeys(`${vector.id}.expect`, vector.expect, ["result", "helpers"]);
        const result = (await call) as Parameters<typeof canonicalResult>[1];
        expect(dropNulls(canonicalResult(vector.operation, result))).toEqual(
          dropNulls(vector.expect.result as never),
        );
        const helpers = vector.expect.helpers ?? {};
        const list = (result as unknown as { results: unknown[] }).results;
        const position = (item: unknown): number | null =>
          item === null ? null : list.indexOf(item);
        for (const [name, want] of Object.entries(helpers)) {
          const target = result as unknown as Record<string, unknown>;
          if (name === "accepted" || name === "invalid" || name === "rejected") {
            expect(typeof target[name], `helper ${name}`).toBe("function");
            const items = (target[name] as () => unknown[]).call(result);
            expect(items.map(position), `helper ${name}`).toEqual(want);
          } else if (name === "by_number" || name === "by_address") {
            const method = name === "by_number" ? "byNumber" : "byAddress";
            expect(typeof target[method], `helper ${method}`).toBe("function");
            for (const [argument, index] of Object.entries(want as Record<string, number | null>)) {
              const found = (target[method] as (a: string) => unknown).call(result, argument);
              expect(position(found), `${method}(${JSON.stringify(argument)})`).toBe(index);
            }
          } else {
            throw new Error(`unknown helper ${name}`);
          }
        }
      } else {
        assertKeys(`${vector.id}.expect`, vector.expect, ["error"]);
        const want = vector.expect.error;
        assertKeys(`${vector.id}.expect.error`, want, [
          "type",
          "class",
          "code",
          "message",
          "api_reference",
          "http_status",
          "data_present",
          "retry_after",
        ]);
        const error = await failure(call);
        assertError(error, want);
        if (want.message === null) {
          expect(typeof error.message).toBe("string");
          expect(error.message.length).toBeGreaterThan(0);
        } else {
          expect(error.message).toBe(want.message);
        }
        expect(error.apiReference).toBe(want.api_reference ?? null);
        const data = field(error, "data");
        expect(data !== null && data !== undefined).toBe(want.data_present);
        expect(error.attempts).toBe(1);
        if (want.retry_after !== undefined) {
          expect(error).toBeInstanceOf(RateLimitError);
          expect((error as RateLimitError).retryAfter / 1000).toBe(want.retry_after);
        }
      }
    });
  }
});

describe(`retries.json (${retries.vectors.length} vectors)`, () => {
  // Each vector runs with the extremes of the jitter seam and the SDK's own Math.random.
  const randoms: [string, (() => number) | undefined][] = [
    ["random 0", () => 0],
    ["random 0.999999", () => 0.999999],
    ["random 0.5", () => 0.5],
    ["default random", undefined],
  ];
  for (const vector of retries.vectors) {
    for (const [label, random] of randoms) {
      it(`${vector.id} (${label})`, async () => {
        assertKeys(vector.id, vector, [
          "id",
          "description",
          "operation",
          "params",
          "now_unix",
          "config",
          "steps",
          "expect",
        ]);
        let nowMs = vector.now_unix * 1000;
        const sleeps: number[] = [];
        let calls = 0;
        const transport: Transport = () => {
          const step = vector.steps[calls];
          calls++;
          if (step === undefined) {
            return Promise.reject(new Error(`attempt ${calls} has no step in the vector`));
          }
          if ("http" in step) return Promise.resolve(answer(step.http));
          const kinds: Record<string, { sent: boolean; timeout: boolean }> = {
            connect_refused: { sent: false, timeout: false },
            dns_failure: { sent: false, timeout: false },
            timeout_after_send: { sent: true, timeout: true },
            reset_after_send: { sent: true, timeout: false },
          };
          const kind = kinds[step.transport];
          if (kind === undefined) throw new Error(`unknown transport step ${step.transport}`);
          return Promise.reject(new TransportError(kind));
        };
        const client = new Unicom360({
          apiKey: API_KEY,
          maxRetries: vector.config.max_retries,
          maxRetryWait: vector.config.max_retry_wait * 1000,
          transport,
          clock: () => nowMs,
          sleeper: (ms) => {
            sleeps.push(ms / 1000);
            nowMs += ms;
          },
          ...(random === undefined ? {} : { random }),
        });
        const call = callOperation(client, vector.operation, vector.params);
        const { outcome } = vector.expect;
        if (outcome.kind === "result") {
          await expect(call).resolves.toBeDefined();
        } else {
          const error = await failure(call);
          assertError(error, outcome);
          expect(error.attempts).toBe(vector.expect.attempts);
        }
        expect(calls).toBe(vector.expect.attempts);
        expect(sleeps).toHaveLength(vector.expect.sleeps.length);
        sleeps.forEach((slept, i) => {
          const range = vector.expect.sleeps[i]!;
          expect(slept, `sleep ${i + 1}`).toBeGreaterThanOrEqual(range.min - 1e-6);
          expect(slept, `sleep ${i + 1}`).toBeLessThanOrEqual(range.max + 1e-6);
        });
      });
    }
  }
});

describe(`error-codes.json (${errorCodes.vectors.length} vectors)`, () => {
  for (const vector of errorCodes.vectors) {
    it(vector.id, () => {
      assertKeys(vector.id, vector, ["id", "message", "code", "source", "note"]);
      expect(normalizeCode(vector.message)).toBe(vector.code);
    });
  }
});

describe(`callbacks.json (${callbacks.vectors.length} vectors)`, () => {
  for (const vector of callbacks.vectors) {
    it(vector.id, () => {
      assertKeys(vector.id, vector, [
        "id",
        "description",
        "kind",
        "off_spec",
        "body_text",
        "expect",
      ]);
      const parsers: Record<string, ((body: string | Uint8Array) => unknown) | undefined> = {
        sms: Webhooks.parseSmsCallback,
        email: Webhooks.parseEmailCallback,
      };
      const parse = parsers[vector.kind];
      expect(parse, `unknown callback kind ${vector.kind}`).toBeDefined();
      const bodies = [vector.body_text, new TextEncoder().encode(vector.body_text)];
      for (const body of bodies) {
        if ("result" in vector.expect) {
          expect(dropNulls(canonical(parse!(body)))).toEqual(
            dropNulls(vector.expect.result as never),
          );
        } else {
          expect(vector.expect.error).toBe(true);
          expect(() => parse!(body)).toThrow(Unicom360Error);
        }
      }
    });
  }
});

describe(`gsm7.json (${gsm7.vectors.length} vectors)`, () => {
  it("embeds the gateway's character set and limits verbatim", () => {
    expect(gsm.CHARSET).toBe(gsm7.charset);
    expect(gsm.MAX_LENGTH).toBe(gsm7.max_length);
    expect(gsm.UNIT_LENGTH).toBe(gsm7.unit_length);
  });

  for (const vector of gsm7.vectors) {
    it(vector.id, () => {
      assertKeys(vector.id, vector, [
        "id",
        "description",
        "text",
        "is_gsm7",
        "length",
        "units",
        "non_gsm",
        "validate",
      ]);
      expect(gsm.isGsm7(vector.text)).toBe(vector.is_gsm7);
      expect(gsm.length(vector.text)).toBe(vector.length);
      expect(gsm.units(vector.text)).toBe(vector.units);
      expect(gsm.nonGsmCharacters(vector.text)).toEqual(vector.non_gsm);
      expect(gsm.validateSms(vector.text)).toEqual(vector.validate);
    });
  }
});

describe(`webhooks/signatures.json (${signatures.vectors.length} vectors)`, () => {
  for (const vector of signatures.vectors) {
    it(vector.id, async () => {
      assertKeys(vector.id, vector, [
        "id",
        "description",
        "secret",
        "headers",
        "body_base64",
        "body_text",
        "now_unix",
        "tolerance",
        "expect",
      ]);
      const bytes = Buffer.from(vector.body_base64, "base64");
      expect(bytes.toString("utf8")).toBe(vector.body_text);
      const options = { tolerance: vector.tolerance * 1000, now: vector.now_unix * 1000 };
      // Every accepted body and header form must give the same answer.
      const inputs: [
        Parameters<typeof Webhooks.verify>[0],
        Parameters<typeof Webhooks.verify>[1],
      ][] = [
        [bytes, vector.headers],
        [new Uint8Array(bytes), new Headers(vector.headers)],
        [vector.body_text, vector.headers],
        [bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), vector.headers],
      ];
      for (const [body, headers] of inputs) {
        const verified = Webhooks.verify(body, headers, vector.secret, options);
        if (vector.expect.valid) {
          await expect(verified).resolves.toBeUndefined();
        } else {
          const error = await failure(verified);
          expect(error).toBeInstanceOf(SignatureVerificationError);
          expect((error as SignatureVerificationError).reason).toBe(vector.expect.reason);
          expect(error.type).toBe("signature_verification_error");
        }
      }
    });
  }
});

describe(`webhooks/events.json (${events.vectors.length} vectors)`, () => {
  const models = {
    message_status: MessageStatusEvent,
    message_received: MessageReceivedEvent,
    test: TestEvent,
    unknown: UnknownEvent,
  } as const;

  for (const vector of events.vectors) {
    it(vector.id, async () => {
      assertKeys(vector.id, vector, [
        "id",
        "description",
        "secret",
        "headers",
        "body_text",
        "now_unix",
        "tolerance",
        "expect",
      ]);
      assertKeys(`${vector.id}.expect`, vector.expect, [
        "kind",
        "event",
        "delivery_id",
        "created_at",
        "data",
      ]);
      const model = models[vector.expect.kind];
      expect(model, `unknown event kind ${vector.expect.kind}`).toBeDefined();
      const event = await Webhooks.constructEvent(
        Buffer.from(vector.body_text, "utf8"),
        vector.headers,
        vector.secret,
        { tolerance: vector.tolerance * 1000, now: vector.now_unix * 1000 },
      );
      expect(event).toBeInstanceOf(model);
      expect(event.kind).toBe(vector.expect.kind);
      expect(event.event).toBe(vector.expect.event);
      expect(event.deliveryId).toBe(vector.expect.delivery_id);
      expect(event.createdAt).toBe(vector.expect.created_at);
      expect(dropNulls(canonical(event.data))).toEqual(dropNulls(vector.expect.data as never));
    });
  }
});
