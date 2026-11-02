// Contract test: every requests.json call, sent by the real default transport to a Prism mock
// of openapi.yaml. Prism validates each request against the spec and reports any violation in
// an `sl-violations` header (or answers 4xx/422); either fails the test. Run with
// `npm run test:contract` while Prism is up (see CONTRIBUTING.md).
import { describe, expect, it } from "vitest";
import { APIError, Unicom360, Unicom360Error, type FetchLike } from "../../src/index.js";
import { callOperation, OPERATIONS } from "../helpers/calls.js";
import { loadFixture, type RequestsFile } from "../helpers/fixtures.js";

const BASE_URL = process.env.UNICOM360_CONTRACT_BASE_URL ?? "http://127.0.0.1:4010";
const requests = loadFixture("requests.json") as RequestsFile;

interface Exchange {
  method: string;
  url: string;
  status: number;
  violations: string | null;
}

function client(exchanges: Exchange[]): Unicom360 {
  const recordingFetch: FetchLike = async (url, init) => {
    const response = await fetch(url, init);
    exchanges.push({
      method: init.method,
      url,
      status: response.status,
      violations: response.headers.get("sl-violations"),
    });
    return response;
  };
  return new Unicom360({
    apiKey: "contract-test-key",
    baseUrl: BASE_URL,
    fetch: recordingFetch,
    maxRetries: 0,
  });
}

describe(`Prism contract (${BASE_URL})`, () => {
  it("covers every operation", () => {
    const covered = new Set(requests.vectors.map((v) => v.operation));
    expect([...covered].sort()).toEqual([...OPERATIONS].sort());
  });

  for (const vector of requests.vectors) {
    it(`${vector.operation}: ${vector.id}`, async () => {
      const exchanges: Exchange[] = [];
      let outcome: unknown;
      try {
        outcome = await callOperation(client(exchanges), vector.operation, vector.params);
      } catch (error) {
        // A business refusal (an HTTP 200 example with success:false) is a valid answer; any
        // HTTP error, including Prism's own validation answers, is not.
        if (!(error instanceof APIError)) {
          const detail =
            error instanceof Unicom360Error
              ? `${error.name} ${error.httpStatus ?? ""} ${error.rawBody ?? ""}`
              : String(error);
          throw new Error(`${vector.id}: ${detail} ${JSON.stringify(exchanges)}`, {
            cause: error,
          });
        }
        outcome = error;
      }
      expect(outcome).toBeDefined();
      expect(exchanges).toHaveLength(1);
      expect(exchanges[0]!.violations, `Prism reported violations for ${vector.id}`).toBeNull();
      expect(exchanges[0]!.status).toBe(200);
    });
  }
});
