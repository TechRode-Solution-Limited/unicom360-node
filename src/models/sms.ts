import { idString, objects, setRaw, str, type JsonObject } from "../core/json.js";
import { findByNumber, type OpenEnum } from "./common.js";

/** An SMS recipient's status in a send response. */
export type SmsResultStatus = OpenEnum<"ACKNOWLEDGED" | "Invalid mobile number">;

/** One recipient of an SMS send. */
export class SmsResult {
  /** The message's id (a UUID). SMS delivery reports refer to it. */
  readonly messageId: string;
  /** `ACKNOWLEDGED`, or `Invalid mobile number` for a number the gateway could not use. */
  readonly status: SmsResultStatus;
  /** The number as the gateway normalised it, or as sent when it could not be parsed. */
  readonly mobileNumber: string | null;
  /** The JSON object this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.status = str(raw.status) ?? "";
    this.mobileNumber = idString(raw.mobile_number);
  }
}

/**
 * The answer to `client.sms.send()`. Results are **not** in request order past the tenth
 * recipient: match them with {@link SmsSendResult.byNumber}.
 */
export class SmsSendResult {
  /** The request's reference: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The gateway's message (`successful`). */
  readonly message: string | null;
  /** One entry per recipient, in the order the gateway answered. */
  readonly results: readonly SmsResult[];
  /** The response envelope this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.apiReference = str(raw.api_reference);
    this.message = str(raw.message);
    this.results = objects(raw.data).map((r) => new SmsResult(r));
  }

  /** The recipients the gateway accepted (`status` is exactly `ACKNOWLEDGED`). */
  accepted(): SmsResult[] {
    return this.results.filter((r) => r.status === "ACKNOWLEDGED");
  }

  /** Every other recipient, for example `Invalid mobile number`. */
  invalid(): SmsResult[] {
    return this.results.filter((r) => r.status !== "ACKNOWLEDGED");
  }

  /**
   * The first result whose `mobileNumber` has the same digits as `number` (spaces, `+` and
   * other non-digits are ignored). Pass the international form: local formats are not
   * expanded. Null when none matches.
   */
  byNumber(number: string): SmsResult | null {
    return findByNumber(this.results, (r) => r.mobileNumber, number);
  }
}

/** The status in an SMS delivery report. */
export type SmsDeliveryStatus = OpenEnum<"SENT" | "DELIVERED" | "FAILED" | "UNKNOWN_ERROR">;

/**
 * An SMS delivery report posted to your `callback_url`. These callbacks are **unsigned** and
 * never retried: anyone can post one, so treat them as hints.
 */
export class SmsDeliveryReport {
  /** The `messageId` the send returned. */
  readonly messageId: string;
  /** `SENT`, `DELIVERED`, `FAILED` or `UNKNOWN_ERROR`. */
  readonly status: SmsDeliveryStatus;
  /** The recipient's number. */
  readonly mobileNumber: string | null;
  /** The JSON object this report was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.status = str(raw.status) ?? "";
    this.mobileNumber = idString(raw.mobile_number);
  }
}
