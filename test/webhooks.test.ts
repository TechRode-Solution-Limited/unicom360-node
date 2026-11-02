// Webhook and helper behaviour beyond the fixtures: input forms, misuse, and the builders.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ConfigurationError,
  MessageStatusEvent,
  Session,
  SignatureVerificationError,
  TemplateHeader,
  Unicom360Error,
  Webhooks,
  gsm,
} from "../src/index.js";

const secret = "whsec_test_0123456789abcdefghijklmnopqrstuvw";
const body = JSON.stringify({
  event: "message.status",
  created_at: "2026-10-24T08:16:02Z",
  data: { message_id: "m-1", status: "delivered" },
});

function sign(text: string, timestamp: number): Record<string, string> {
  const digest = createHmac("sha256", secret).update(`${timestamp}.${text}`).digest("hex");
  return {
    "X-Unicom360-Timestamp": String(timestamp),
    "X-Unicom360-Signature": `sha256=${digest}`,
    "X-Unicom360-Delivery": "1042",
  };
}

describe("Webhooks.verify", () => {
  it("uses the current time by default", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(Webhooks.verify(body, sign(body, now), secret)).resolves.toBeUndefined();
    const stale = Webhooks.verify(body, sign(body, now - 301), secret);
    await expect(stale).rejects.toMatchObject({ reason: "timestamp_out_of_tolerance" });
  });

  it("uses the first value of a repeated header (Node's req.headers)", async () => {
    const now = 1792829762;
    const headers = sign(body, now);
    const nodeHeaders = {
      "x-unicom360-timestamp": [headers["X-Unicom360-Timestamp"]!, "1"],
      "x-unicom360-signature": [headers["X-Unicom360-Signature"]!, "sha256=00"],
    };
    await expect(
      Webhooks.verify(body, nodeHeaders, secret, { now: now * 1000 }),
    ).resolves.toBeUndefined();
  });

  it("refuses parsed JSON in place of the raw body", async () => {
    const parsed = JSON.parse(body) as unknown as string;
    await expect(Webhooks.verify(parsed, sign(body, 1), secret)).rejects.toThrow(
      /raw request body/,
    );
  });

  it("refuses an empty secret as a configuration error", async () => {
    await expect(Webhooks.verify(body, sign(body, 1), "")).rejects.toThrow(ConfigurationError);
  });

  it("treats a timestamp too large for 64 bits as out of tolerance", async () => {
    const headers = { ...sign(body, 1), "X-Unicom360-Timestamp": "9".repeat(400) };
    await expect(Webhooks.verify(body, headers, secret)).rejects.toMatchObject({
      reason: "timestamp_out_of_tolerance",
    });
  });

  it("names the error and its reason", async () => {
    const error = await Webhooks.verify(body, {}, secret).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SignatureVerificationError);
    expect(error).toBeInstanceOf(Unicom360Error);
    expect((error as Error).name).toBe("SignatureVerificationError");
    expect((error as SignatureVerificationError).reason).toBe("missing_signature");
    expect(String(error)).not.toContain(secret);
  });
});

describe("Webhooks.constructEvent", () => {
  it("parses a verified delivery", async () => {
    const now = 1792829762;
    const event = await Webhooks.constructEvent(body, sign(body, now), secret, { now: now * 1000 });
    expect(event).toBeInstanceOf(MessageStatusEvent);
    if (event.kind !== "message_status") throw new Error("narrowing failed");
    expect(event.data.status).toBe("delivered");
    expect(event.deliveryId).toBe("1042");
    expect(event.raw).toEqual(JSON.parse(body));
  });

  it("refuses a verified body that is not an event", async () => {
    const now = 1792829762;
    for (const text of ["[1,2]", '{"data":{}}', "not json"]) {
      await expect(
        Webhooks.constructEvent(text, sign(text, now), secret, { now: now * 1000 }),
      ).rejects.toThrow(Unicom360Error);
    }
  });
});

describe("builders", () => {
  it("keep optional fields absent rather than undefined", () => {
    const message = Session.image("260971234567", "https://example.com/a.png");
    expect(Object.keys(message).sort()).toEqual(["media", "to", "type"]);
    expect(Object.keys(message.media)).toEqual(["url"]);
    expect(TemplateHeader.document("https://example.com/a.pdf")).toEqual({
      type: "document",
      url: "https://example.com/a.pdf",
    });
  });

  it("drop reply_to on a reaction", () => {
    const options = { replyTo: "wamid.x", from: "260960123456" } as never;
    expect(Session.reaction("260971234567", "m-1", "👍", options)).toEqual({
      to: "260971234567",
      type: "reaction",
      reaction: { messageId: "m-1", emoji: "👍" },
      from: "260960123456",
    });
  });
});

describe("gsm", () => {
  it("counts an emoji as one character", () => {
    expect(gsm.length("👋")).toBe(1);
    expect(gsm.nonGsmCharacters("a👋b")).toEqual([{ char: "👋", index: 1 }]);
  });
});
