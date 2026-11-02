// The default transport on the global fetch, against a real local HTTP server.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  APIConnectionError,
  APIStatusError,
  APITimeoutError,
  Unicom360,
  type FetchLike,
} from "../src/index.js";

type Handler = (req: IncomingMessage, res: ServerResponse, body: string) => void;

let server: Server;
let baseUrl: string;
let handler: Handler = (_req, res) => res.end();
let hits = 0;
let lastRequest: {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingMessage["headers"];
  body: string;
};

beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString("utf8")));
    req.on("end", () => {
      lastRequest = { method: req.method, url: req.url, headers: req.headers, body };
      handler(req, res, body);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

const json =
  (status: number, body: unknown): Handler =>
  (_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };

const fast = { sleeper: () => undefined };
const sms = { from: "Unicom360", to: "260971234567", message: "Hello" };

describe("the default fetch transport", () => {
  it("sends the request and reads the response", async () => {
    handler = json(200, { status: true, message: "ok", balance: 12.5, bundle_type: "WHATSAPP" });
    const client = new Unicom360({ apiKey: "k", baseUrl });
    const balance = await client.balance.get("WHATSAPP");
    expect(balance.balance).toBe(12.5);
    expect(lastRequest.method).toBe("POST");
    expect(lastRequest.url).toBe("/api/v1/json/balance");
    expect(lastRequest.headers["x-api-key"]).toBe("k");
    expect(lastRequest.headers["content-type"]).toBe("application/json");
    expect(lastRequest.headers["user-agent"]).toMatch(/^unicom360-node\/0\.1\.0 \(node /);
    expect(JSON.parse(lastRequest.body)).toEqual({ bundle_type: "WHATSAPP" });
  });

  it("does not follow redirects", async () => {
    hits = 0;
    handler = (_req, res) => {
      res.writeHead(302, { location: "https://evil.example.com/steal" });
      res.end();
    };
    const error = await new Unicom360({ apiKey: "k", baseUrl, ...fast })
      .health()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIStatusError);
    expect((error as APIStatusError).httpStatus).toBe(302);
    expect((error as APIStatusError).message).toBe("HTTP 302 Found");
    expect(hits).toBe(1);
  });

  it("retries a refused connection, which never sent anything, even for an unsafe send", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => {
      closed.listen(0, "127.0.0.1", resolve);
    });
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => {
      closed.close(() => {
        resolve();
      });
    });
    let attempts = 0;
    const counting: FetchLike = (url, init) => {
      attempts++;
      return fetch(url, init);
    };
    const client = new Unicom360({
      apiKey: "k",
      baseUrl: `http://127.0.0.1:${port}`,
      fetch: counting,
      ...fast,
    });
    const error = await client.sms.send(sms).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIConnectionError);
    expect(error).not.toBeInstanceOf(APITimeoutError);
    expect((error as APIConnectionError).attempts).toBe(3);
    expect((error as APIConnectionError).message).toMatch(/ECONNREFUSED/);
    expect(attempts).toBe(3);
  });

  it("times out, and does not retry an unsafe send that may have gone through", async () => {
    hits = 0;
    handler = () => undefined; // never answers
    const client = new Unicom360({ apiKey: "k", baseUrl, timeout: 200, ...fast });
    const error = await client.sms.send(sms).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APITimeoutError);
    expect((error as APITimeoutError).attempts).toBe(1);
    expect(hits).toBe(1);
  });

  it("retries a timeout on a read operation", async () => {
    hits = 0;
    handler = () => undefined;
    const client = new Unicom360({ apiKey: "k", baseUrl, timeout: 100, maxRetries: 1, ...fast });
    const error = await client.balance.all().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APITimeoutError);
    expect((error as APITimeoutError).attempts).toBe(2);
    expect(hits).toBe(2);
  });

  it("treats a connection reset after sending as possibly sent", async () => {
    hits = 0;
    handler = (req) => req.socket.destroy();
    const client = new Unicom360({ apiKey: "k", baseUrl, ...fast });
    const error = await client.sms.send(sms).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(APIConnectionError);
    expect(hits).toBe(1);
    const retried = await client.sms
      .send({ ...sms, userReferenceId: "r-1" })
      .catch((e: unknown) => e);
    expect((retried as APIConnectionError).attempts).toBe(3);
  });
});
