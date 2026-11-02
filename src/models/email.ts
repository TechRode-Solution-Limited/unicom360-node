import { idString, objects, setRaw, str, type JsonObject } from "../core/json.js";
import type { OpenEnum } from "./common.js";

/** An email recipient's status in a send response. */
export type EmailResultStatus = OpenEnum<"ACKNOWLEDGED" | "Invalid email address">;

/** One address of an email send. */
export class EmailResult {
  /** The email's id (decimal digits, always a string). Delivery reports refer to it. */
  readonly messageId: string;
  /** `ACKNOWLEDGED`, or `Invalid email address`. */
  readonly status: EmailResultStatus;
  /** The address. */
  readonly emailAddress: string | null;
  /** The JSON object this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.status = str(raw.status) ?? "";
    this.emailAddress = str(raw.email_address);
  }
}

const normaliseAddress = (address: string | null): string => (address ?? "").trim().toLowerCase();

/**
 * The answer to `client.email.send()`. Results are **not** in request order past the tenth
 * address: match them with {@link EmailSendResult.byAddress}.
 */
export class EmailSendResult {
  /** The request's reference: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The gateway's message (`successful`). */
  readonly message: string | null;
  /** One entry per address, in the order the gateway answered. */
  readonly results: readonly EmailResult[];
  /** The response envelope this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.apiReference = str(raw.api_reference);
    this.message = str(raw.message);
    this.results = objects(raw.data).map((r) => new EmailResult(r));
  }

  /** The addresses the gateway accepted (`status` is exactly `ACKNOWLEDGED`). */
  accepted(): EmailResult[] {
    return this.results.filter((r) => r.status === "ACKNOWLEDGED");
  }

  /** Every other address, for example `Invalid email address`. */
  invalid(): EmailResult[] {
    return this.results.filter((r) => r.status !== "ACKNOWLEDGED");
  }

  /**
   * The first result whose `emailAddress` equals `address`, ignoring case and surrounding
   * whitespace. Null when none matches.
   */
  byAddress(address: string): EmailResult | null {
    const wanted = normaliseAddress(address);
    return this.results.find((r) => normaliseAddress(r.emailAddress) === wanted) ?? null;
  }
}

/** The status in an email delivery report. */
export type EmailDeliveryStatus = OpenEnum<"SENT" | "DELIVERED" | "FAILED">;

/**
 * An email delivery report posted to your `callback_url`. These callbacks are **unsigned** and
 * never retried: anyone can post one, so treat them as hints.
 */
export class EmailDeliveryReport {
  /** The `messageId` the send returned (a string here, although the wire sends a number). */
  readonly messageId: string;
  /** `SENT`, `DELIVERED` or `FAILED`. */
  readonly status: EmailDeliveryStatus;
  /** The recipient's address. */
  readonly emailAddress: string | null;
  /** `success`, or the provider's reason on `FAILED`. */
  readonly message: string | null;
  /** The JSON object this report was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.status = str(raw.status) ?? "";
    this.emailAddress = str(raw.email_address);
    this.message = str(raw.message);
  }
}
