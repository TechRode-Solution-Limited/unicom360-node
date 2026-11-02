import { readFileSync } from "node:fs";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APIConnectionError,
  APIServerError,
  ConfigurationError,
  DuplicateReferenceError,
  Session,
  TransportError,
  Unicom360,
  VERSION,
  type Logger,
  type Transport,
  type TransportRequest,
} from "../src/index.js";

const SECRET_KEY = "sk-very-secret-key-123";

const ok = (body: unknown) =>
  Promise.resolve({
    status: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const SMS_OK = {
  success: true,
  message: "successful",
  api_reference: "1",
  data: [{ message_id: "m-1", status: "ACKNOWLEDGED", mobile_number: "260971234567" }],
};

function recorder(respond: (request: TransportRequest, n: number) => ReturnType<Transport>) {
  const sent: TransportRequest[] = [];
  const transport: Transport = (request) => {
    sent.push(request);
    return respond(request, sent.length);
  };
  return { sent, transport };
}

const sms = { from: "Unicom360", to: "260971234567", message: "Hello" };

beforeEach(() => {
  vi.stubEnv("UNICOM360_API_KEY", undefined);
  vi.stubEnv("UNICOM360_BASE_URL", undefined);
  vi.stubEnv("UNICOM360_LOG", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("version", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    expect(VERSION).toBe(pkg.version);
    expect(VERSION).toBe("0.1.0");
  });
});

describe("API key", () => {
  it("is required", () => {
    expect(() => new Unicom360()).toThrow(ConfigurationError);
    expect(() => new Unicom360({ apiKey: "   " })).toThrow(ConfigurationError);
  });

  it("falls back to UNICOM360_API_KEY", () => {
    process.env.UNICOM360_API_KEY = "from-env";
    expect(() => new Unicom360()).not.toThrow();
  });

  it("treats an explicit empty string as given, not as missing", () => {
    process.env.UNICOM360_API_KEY = "from-env";
    expect(() => new Unicom360({ apiKey: "" })).toThrow(ConfigurationError);
  });

  it("is sent as X-API-Key, never as Authorization, and not to /health", async () => {
    const { sent, transport } = recorder(() => ok({ status: "ok" }));
    const client = new Unicom360({ apiKey: SECRET_KEY, transport });
    await client.health();
    expect(sent[0]!.headers).not.toHaveProperty("X-API-Key");
    expect(Object.keys(sent[0]!.headers).map((h) => h.toLowerCase())).not.toContain(
      "authorization",
    );
  });
});

describe("base URL", () => {
  const url = async (baseUrl: string): Promise<string> => {
    const { sent, transport } = recorder(() => ok({ status: true, message: "", balances: {} }));
    await new Unicom360({ apiKey: "k", baseUrl, transport }).balance.all();
    return sent[0]!.url;
  };

  it("defaults to https://api.unicom360.com", async () => {
    expect(await url("https://api.unicom360.com")).toBe(
      "https://api.unicom360.com/api/v1/json/balance/all",
    );
    const { sent, transport } = recorder(() => ok({ status: "ok" }));
    await new Unicom360({ apiKey: "k", transport }).health();
    expect(sent[0]!.url).toBe("https://api.unicom360.com/health");
  });

  it("reads UNICOM360_BASE_URL", () => {
    process.env.UNICOM360_BASE_URL = "https://proxy.example.com/u360/";
    expect(new Unicom360({ apiKey: "k" }).baseUrl).toBe("https://proxy.example.com/u360");
  });

  it("keeps a path prefix and removes trailing slashes", async () => {
    expect(await url("https://proxy.example.com/unicom360///")).toBe(
      "https://proxy.example.com/unicom360/api/v1/json/balance/all",
    );
  });

  it.each([
    "http://localhost:4010",
    "http://127.0.0.1:4010",
    "http://127.10.0.5",
    "http://[::1]:8080",
    "https://example.com:8443/base",
  ])("accepts %s", (baseUrl) => {
    expect(() => new Unicom360({ apiKey: "k", baseUrl })).not.toThrow();
  });

  it.each([
    "http://api.unicom360.com",
    "http://10.0.0.1",
    "ftp://api.unicom360.com",
    "api.unicom360.com",
    "",
    "https://api.unicom360.com/?x=1",
    "https://api.unicom360.com/?",
    "https://api.unicom360.com/#frag",
    "https://user:pass@api.unicom360.com",
  ])("refuses %j", (baseUrl) => {
    expect(() => new Unicom360({ apiKey: "k", baseUrl })).toThrow(ConfigurationError);
  });
});

describe("options", () => {
  it.each([
    [{ timeout: 0 }],
    [{ timeout: -1 }],
    [{ connectTimeout: Number.NaN }],
    [{ maxRetries: -1 }],
    [{ maxRetries: 1.5 }],
    [{ maxRetryWait: -5 }],
    [{ appInfo: { name: "" } }],
  ])("refuses %j", (options) => {
    expect(() => new Unicom360({ apiKey: "k", ...options })).toThrow(ConfigurationError);
  });

  it("passes the timeouts to the transport, with per-request overrides", async () => {
    const { sent, transport } = recorder(() => ok(SMS_OK));
    const client = new Unicom360({ apiKey: "k", transport, timeout: 5000, connectTimeout: 2000 });
    await client.sms.send(sms);
    await client.sms.send(sms, { timeout: 1234 });
    expect(sent.map((r) => [r.timeout, r.connectTimeout])).toEqual([
      [5000, 2000],
      [1234, 2000],
    ]);
  });

  it("honours a per-request maxRetries", async () => {
    const { sent, transport } = recorder(() =>
      Promise.reject(new TransportError({ sent: false, timeout: false })),
    );
    const client = new Unicom360({ apiKey: "k", transport, sleeper: () => undefined });
    await expect(client.balance.get(undefined, { maxRetries: 0 })).rejects.toThrow(
      APIConnectionError,
    );
    expect(sent).toHaveLength(1);
    await expect(client.balance.get(undefined, { maxRetries: 4 })).rejects.toThrow(
      APIConnectionError,
    );
    expect(sent).toHaveLength(6);
    await expect(client.balance.get(undefined, { maxRetries: -1 })).rejects.toThrow(
      ConfigurationError,
    );
  });

  it("withOptions copies the client with changes", async () => {
    const { sent, transport } = recorder(() => ok(SMS_OK));
    const client = new Unicom360({ apiKey: "k", baseUrl: "https://a.example.com", transport });
    const copy = client.withOptions({ baseUrl: "https://b.example.com", timeout: undefined });
    await copy.sms.send(sms);
    expect(copy).not.toBe(client);
    expect(client.baseUrl).toBe("https://a.example.com");
    expect(sent[0]!.url.startsWith("https://b.example.com/")).toBe(true);
    expect(sent[0]!.headers["X-API-Key"]).toBe("k");
  });
});

describe("User-Agent", () => {
  it("names the SDK, runtime and app", async () => {
    const { sent, transport } = recorder(() => ok(SMS_OK));
    const client = new Unicom360({
      apiKey: "k",
      transport,
      appInfo: { name: "shopsync", version: "2.3.0", url: "https://shopsync.example" },
    });
    await client.sms.send(sms);
    const ua = sent[0]!.headers["User-Agent"]!;
    expect(ua).toBe(
      `unicom360-node/${VERSION} (node ${process.versions.node}; ${process.platform}; ${process.arch}) shopsync/2.3.0 (+https://shopsync.example)`,
    );
  });
});

describe("browsers", () => {
  it("are refused unless dangerouslyAllowBrowser is set", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    expect(() => new Unicom360({ apiKey: "k" })).toThrow(/browser/);
    const { sent, transport } = recorder(() => ok(SMS_OK));
    const client = new Unicom360({ apiKey: "k", transport, dangerouslyAllowBrowser: true });
    await client.sms.send(sms);
    expect(sent[0]!.headers["X-Unicom360-Client"]).toMatch(/^unicom360-node\//);
    expect(sent[0]!.headers).not.toHaveProperty("User-Agent");
  });

  it("are not detected from window alone (Deno 1 has window but no document)", () => {
    vi.stubGlobal("window", {});
    expect(() => new Unicom360({ apiKey: "k" })).not.toThrow();
  });
});

describe("redaction", () => {
  it("never prints the API key", () => {
    const client = new Unicom360({ apiKey: SECRET_KEY });
    const renderings = [
      String(client),
      JSON.stringify(client),
      inspect(client),
      inspect(client, { showHidden: true, depth: 10 }),
      inspect(client.sms, { showHidden: true, depth: 10 }),
      inspect(client.withOptions({ timeout: 1000 }), { showHidden: true, depth: 10 }),
    ];
    for (const text of renderings) {
      expect(text).not.toContain(SECRET_KEY);
    }
    expect(String(client)).toContain("[REDACTED]");
    expect(JSON.stringify(client)).toContain("[REDACTED]");
  });

  it("keeps the key out of errors", async () => {
    const transport: Transport = () =>
      Promise.resolve({
        status: 401,
        headers: {},
        body: '{"success":false,"message":"AUTHENTICATION_FAILED"}',
      });
    const client = new Unicom360({ apiKey: SECRET_KEY, transport });
    const error = await client.sms.send(sms).catch((e: unknown) => e);
    expect(inspect(error, { showHidden: true, depth: 10 })).not.toContain(SECRET_KEY);
    expect(JSON.stringify(error)).not.toContain(SECRET_KEY);
  });
});

describe("auto reference ids", () => {
  const REF = /^u360-[0-9a-f]{32}$/;

  it("are off by default", async () => {
    const { sent, transport } = recorder(() => ok(SMS_OK));
    await new Unicom360({ apiKey: "k", transport }).sms.send(sms);
    expect(JSON.parse(sent[0]!.body!)).not.toHaveProperty("user_reference_id");
  });

  it("give a send a reference, reused on every retry", async () => {
    const { sent, transport } = recorder((_, n) =>
      n === 1 ? Promise.resolve({ status: 503, headers: {}, body: "" }) : ok(SMS_OK),
    );
    const client = new Unicom360({
      apiKey: "k",
      transport,
      autoReferenceIds: true,
      sleeper: () => undefined,
    });
    await client.sms.send(sms);
    expect(sent).toHaveLength(2); // the generated reference made the send retry-safe
    const first = JSON.parse(sent[0]!.body!) as { user_reference_id: string };
    const second = JSON.parse(sent[1]!.body!) as { user_reference_id: string };
    expect(first.user_reference_id).toMatch(REF);
    expect(second.user_reference_id).toBe(first.user_reference_id);
  });

  it("never replace a caller's reference, and give each template recipient its own", async () => {
    const { sent, transport } = recorder(() =>
      ok({
        success: true,
        message: "successful",
        api_reference: "1",
        data: { accepted: 0, rejected: 0, results: [] },
      }),
    );
    const client = new Unicom360({ apiKey: "k", transport, autoReferenceIds: true });
    await client.whatsapp.sendTemplate({
      template: "t",
      recipients: [{ to: "1" }, { to: "2", userReferenceId: "mine" }, { to: "3" }],
    });
    const body = JSON.parse(sent[0]!.body!) as { recipients: { user_reference_id: string }[] };
    const [a, b, c] = body.recipients.map((r) => r.user_reference_id);
    expect(a).toMatch(REF);
    expect(b).toBe("mine");
    expect(c).toMatch(REF);
    expect(a).not.toBe(c);
  });

  it("cover session messages", async () => {
    const { sent, transport } = recorder(() =>
      ok({ success: true, message: "successful", api_reference: "1", data: { message_id: "m" } }),
    );
    const client = new Unicom360({ apiKey: "k", transport, autoReferenceIds: true });
    const result = await client.whatsapp.sendSession(Session.text("260971234567", "Hi"));
    expect((JSON.parse(sent[0]!.body!) as { user_reference_id: string }).user_reference_id).toMatch(
      REF,
    );
    expect(result.messageId).toBe("m");
  });

  it("do not make email retry-safe", async () => {
    const { sent, transport } = recorder(() =>
      Promise.resolve({ status: 500, headers: {}, body: "" }),
    );
    const client = new Unicom360({
      apiKey: "k",
      transport,
      autoReferenceIds: true,
      sleeper: () => undefined,
    });
    await expect(
      client.email.send({ from: "a@b.co", to: "c@d.co", subject: "s", emailBody: "b" }),
    ).rejects.toThrow(APIServerError);
    expect(sent).toHaveLength(1);
    expect(JSON.parse(sent[0]!.body!)).toHaveProperty("user_reference_id");
  });
});

describe("retries", () => {
  it("report a duplicate after a retried send that had gone through", async () => {
    const { transport } = recorder((_, n) =>
      n === 1
        ? Promise.reject(new TransportError({ sent: true, timeout: true }))
        : ok({ success: false, message: "duplicate user reference id", api_reference: "1" }),
    );
    const client = new Unicom360({ apiKey: "k", transport, sleeper: () => undefined });
    const error = await client.sms
      .send({ ...sms, userReferenceId: "order-1" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DuplicateReferenceError);
    expect((error as DuplicateReferenceError).attempts).toBe(2);
  });

  it("treat an unclassified transport failure as possibly sent", async () => {
    const { sent, transport } = recorder(() => Promise.reject(new Error("boom")));
    const client = new Unicom360({ apiKey: "k", transport, sleeper: () => undefined });
    const error = await client.sms.send(sms).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIConnectionError);
    expect((error as APIConnectionError).cause).toBeInstanceOf(Error);
    expect(sent).toHaveLength(1);
  });
});

describe("logging", () => {
  function capture(): {
    logger: Logger;
    lines: [string, string, Record<string, unknown> | undefined][];
  } {
    const lines: [string, string, Record<string, unknown> | undefined][] = [];
    const log = (level: string) => (message: string, fields?: Record<string, unknown>) => {
      lines.push([level, message, fields]);
    };
    return {
      lines,
      logger: { debug: log("debug"), info: log("info"), warn: log("warn"), error: log("error") },
    };
  }

  it("logs one line per attempt and per retry, with no bodies, numbers or key", async () => {
    const { lines, logger } = capture();
    const { transport } = recorder((_, n) =>
      n === 1
        ? Promise.resolve({
            status: 429,
            headers: {},
            body: '{"success":false,"message":"RATE_LIMIT_EXCEEDED","api_reference":"r-1"}',
          })
        : ok(SMS_OK),
    );
    const client = new Unicom360({
      apiKey: SECRET_KEY,
      transport,
      logger,
      clock: () => 1767225630000,
      sleeper: () => undefined,
      random: () => 0,
    });
    await client.sms.send(sms);
    expect(lines.map(([level]) => level)).toEqual(["debug", "info", "debug"]);
    expect(lines[0]![2]).toMatchObject({
      method: "POST",
      path: "/api/v1/json/bulk/sms",
      status: 429,
      api_reference: "r-1",
      attempt: 1,
    });
    expect(lines[1]![2]).toMatchObject({ attempt: 1, wait_s: 30, cause: "RATE_LIMIT_EXCEEDED" });
    expect(lines[2]![2]).toMatchObject({ status: 200, api_reference: "1", attempt: 2 });
    const text = JSON.stringify(lines);
    for (const secret of [SECRET_KEY, "260971234567", "Hello"]) expect(text).not.toContain(secret);
  });

  it("is silent by default and follows UNICOM360_LOG", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const { transport } = recorder(() => ok(SMS_OK));
    await new Unicom360({ apiKey: "k", transport }).sms.send(sms);
    expect(debug).not.toHaveBeenCalled();
    process.env.UNICOM360_LOG = "debug";
    await new Unicom360({ apiKey: "k", transport }).sms.send(sms);
    expect(debug).toHaveBeenCalledTimes(1);
    debug.mockRestore();
  });

  it("logs the references autoReferenceIds generated", async () => {
    const { lines, logger } = capture();
    const { transport } = recorder(() => ok(SMS_OK));
    await new Unicom360({ apiKey: "k", transport, logger, autoReferenceIds: true }).sms.send(sms);
    expect(lines[0]![2]!.generated_user_reference_ids).toEqual([expect.stringMatching(/^u360-/)]);
  });
});
