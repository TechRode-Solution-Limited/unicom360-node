import {
  bool,
  idString,
  isObject,
  num,
  objectOrNull,
  objects,
  setRaw,
  str,
  strings,
  type JsonObject,
} from "../core/json.js";
import { findByNumber, type OpenEnum } from "./common.js";

/** A template recipient's status. */
export type TemplateResultStatus = OpenEnum<"ACKNOWLEDGED" | "REJECTED">;

/** Why a template recipient was rejected. */
export type TemplateRejectionReason = OpenEnum<
  | "INVALID_NUMBER"
  | "INVALID_USER_REFERENCE_ID"
  | "DUPLICATE_MSG_REF"
  | "BODY_PARAMETERS_INVALID"
  | "HEADER_PARAMETER_INVALID"
  | "MEDIA_URL_INVALID"
  | "BUTTON_PARAMETERS_INVALID"
  | "OTP_REQUIRED"
  | "OTP_INVALID"
>;

/** A WhatsApp pricing category. */
export type WhatsAppCategory = OpenEnum<"MARKETING" | "UTILITY" | "AUTHENTICATION" | "SERVICE">;

/** One recipient of a template send. */
export class TemplateResult {
  /**
   * The queued message's id; for a `DUPLICATE_MSG_REF` rejection, the message the reference
   * already went out as; otherwise null.
   */
  readonly messageId: string | null;
  /** The normalised number, or for a rejected recipient the value as sent (always a string). */
  readonly to: string | null;
  /** Your reference for this recipient (always a string). */
  readonly userReferenceId: string | null;
  /** `ACKNOWLEDGED` or `REJECTED`. */
  readonly status: TemplateResultStatus;
  /** Null when accepted, else why the recipient was rejected. */
  readonly reason: TemplateRejectionReason | null;
  /** The template's Meta category, which sets the price. */
  readonly category: WhatsAppCategory | null;
  /** The JSON object this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id);
    this.to = idString(raw.to);
    this.userReferenceId = idString(raw.user_reference_id);
    this.status = str(raw.status) ?? "";
    this.reason = str(raw.reason);
    this.category = str(raw.category);
  }
}

/**
 * The answer to `client.whatsapp.sendTemplate()`. A send with some rejected recipients is a
 * result, not an error: check {@link TemplateSendResult.rejected}.
 */
export class TemplateSendResult {
  /** The request's reference: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The gateway's message (`successful`). */
  readonly message: string | null;
  /** How many recipients were accepted (the API's `accepted`). */
  readonly acceptedCount: number;
  /** How many recipients were rejected (the API's `rejected`). */
  readonly rejectedCount: number;
  /** One entry per recipient, in request order. */
  readonly results: readonly TemplateResult[];
  /** The response envelope this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    const data = objectOrNull(raw.data) ?? {};
    this.apiReference = str(raw.api_reference);
    this.message = str(raw.message);
    this.acceptedCount = num(data.accepted) ?? 0;
    this.rejectedCount = num(data.rejected) ?? 0;
    this.results = objects(data.results).map((r) => new TemplateResult(r));
  }

  /** The recipients the gateway accepted (`status` is exactly `ACKNOWLEDGED`). */
  accepted(): TemplateResult[] {
    return this.results.filter((r) => r.status === "ACKNOWLEDGED");
  }

  /** The recipients the gateway rejected (`status` is exactly `REJECTED`), each with a `reason`. */
  rejected(): TemplateResult[] {
    return this.results.filter((r) => r.status === "REJECTED");
  }

  /**
   * The first result whose `to` has the same digits as `number` (non-digits ignored). Null when
   * none matches.
   */
  byNumber(number: string): TemplateResult | null {
    return findByNumber(this.results, (r) => r.to, number);
  }
}

/** The answer to `client.whatsapp.sendSession()`. */
export class SessionSendResult {
  /** The request's reference: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The gateway's message (`successful`). */
  readonly message: string | null;
  /** The message's id (a UUID). Status webhooks and `whatsapp.status()` refer to it. */
  readonly messageId: string;
  /** The customer's number, as the gateway normalised it. */
  readonly to: string | null;
  /** Your reference, when the send had one. */
  readonly userReferenceId: string | null;
  /** `ACKNOWLEDGED`. */
  readonly status: OpenEnum<"ACKNOWLEDGED">;
  /** `SERVICE`. */
  readonly category: WhatsAppCategory | null;
  /** The response envelope this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    const data = objectOrNull(raw.data) ?? {};
    this.apiReference = str(raw.api_reference);
    this.message = str(raw.message);
    this.messageId = idString(data.message_id) ?? "";
    this.to = idString(data.to);
    this.userReferenceId = idString(data.user_reference_id);
    this.status = str(data.status) ?? "";
    this.category = str(data.category);
  }
}

/** An error Meta reported for a WhatsApp message. */
export class MessageError {
  /** Meta's error code, when Meta gave one. */
  readonly code: number | null;
  /** The error text. */
  readonly message: string;
  /** The JSON object this error was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.code = num(raw.code);
    this.message = str(raw.message) ?? "";
  }
}

/** A WhatsApp message status from `whatsapp.status()`. */
export type MessageStatusValue = OpenEnum<
  "ACCEPTED" | "SENT" | "DELIVERED" | "READ" | "FAILED" | "REJECTED" | "NOT_FOUND"
>;

/** One message's status. A `NOT_FOUND` entry carries only `messageId` and `status`. */
export class MessageStatus {
  /** The message's id. */
  readonly messageId: string;
  /** `ACCEPTED`, `SENT`, `DELIVERED`, `READ`, `FAILED`, `REJECTED` or `NOT_FOUND`. */
  readonly status: MessageStatusValue;
  /** Your reference, when the send had one. */
  readonly userReferenceId: string | null;
  /** The recipient. */
  readonly to: string | null;
  /** The sender. */
  readonly from: string | null;
  /** When the message was sent (ISO 8601, as received). */
  readonly sentAt: string | null;
  /** When it was delivered (ISO 8601, as received). */
  readonly deliveredAt: string | null;
  /** When it was read (ISO 8601, as received). */
  readonly readAt: string | null;
  /** Meta's error, for a failed message. */
  readonly error: MessageError | null;
  /** The pricing category. */
  readonly category: WhatsAppCategory | null;
  /** Whether the message was charged when it was sent. Never changes afterwards. */
  readonly billable: boolean | null;
  /** Whether that charge was given back. */
  readonly refunded: boolean | null;
  /** The JSON object this status was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.status = str(raw.status) ?? "";
    this.userReferenceId = idString(raw.user_reference_id);
    this.to = idString(raw.to);
    this.from = idString(raw.from);
    this.sentAt = str(raw.sent_at);
    this.deliveredAt = str(raw.delivered_at);
    this.readAt = str(raw.read_at);
    this.error = isObject(raw.error) ? new MessageError(raw.error) : null;
    this.category = str(raw.category);
    this.billable = bool(raw.billable);
    this.refunded = bool(raw.refunded);
  }
}

/** The answer to `client.whatsapp.status()`. */
export class StatusResult {
  /** The request's reference: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The gateway's message (`successful`). */
  readonly message: string | null;
  /** One entry per distinct id asked for. */
  readonly results: readonly MessageStatus[];
  /** The response envelope this result was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    const data = objectOrNull(raw.data) ?? {};
    this.apiReference = str(raw.api_reference);
    this.message = str(raw.message);
    this.results = objects(data.results).map((r) => new MessageStatus(r));
  }

  /** The status of `messageId` (exact match), or null. */
  byId(messageId: string): MessageStatus | null {
    return this.results.find((r) => r.messageId === messageId) ?? null;
  }
}

/** A template's header, as `whatsapp.templates()` describes it. */
export class TemplateHeaderInfo {
  /** `text`, `image`, `video` or `document`. */
  readonly type: OpenEnum<"text" | "image" | "video" | "document">;
  /** The names of the header's variables. */
  readonly variables: readonly string[];
  /** The JSON object this header was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.type = str(raw.type) ?? "";
    this.variables = strings(raw.variables);
  }
}

/** A template's body, as `whatsapp.templates()` describes it. */
export class TemplateBodyInfo {
  /** The body text, with `{{1}}`-style placeholders. */
  readonly text: string | null;
  /** The names of the body's variables, in order. */
  readonly variables: readonly string[];
  /** The JSON object this body was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.text = str(raw.text);
    this.variables = strings(raw.variables);
  }
}

/** A template's button, as `whatsapp.templates()` describes it. */
export class TemplateButtonInfo {
  /** The button's position, which `TemplateButton.url(index, ...)` refers to. */
  readonly index: number;
  /** `url`, `quick_reply`, `phone_number` or `otp`. */
  readonly type: OpenEnum<"url" | "quick_reply" | "phone_number" | "otp">;
  /** The button text. */
  readonly text: string | null;
  /** For a url button; a `{{1}}` in it means the send must give the value. */
  readonly url: string | null;
  /** For an otp button. */
  readonly otpType: string | null;
  /** The JSON object this button was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.index = num(raw.index) ?? 0;
    this.type = str(raw.type) ?? "";
    this.text = str(raw.text);
    this.url = str(raw.url);
    this.otpType = str(raw.otp_type);
  }
}

/** An authentication template's OTP settings. */
export class TemplateAuthentication {
  /** For example `COPY_CODE`. */
  readonly otpType: string | null;
  /** How long a code stays valid. */
  readonly codeExpirationMinutes: number | null;
  /** The JSON object these settings were parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.otpType = str(raw.otp_type);
    this.codeExpirationMinutes = num(raw.code_expiration_minutes);
  }
}

/** An approved template you can send. */
export class TemplateInfo {
  /** The template name to pass to `sendTemplate`. */
  readonly name: string;
  /** The template's language, for example `en_US`. */
  readonly language: string;
  /** `MARKETING`, `UTILITY` or `AUTHENTICATION`. */
  readonly category: WhatsAppCategory | null;
  /** The number the template was made on. */
  readonly from: string | null;
  /** The header, or null when the template has none. */
  readonly header: TemplateHeaderInfo | null;
  /** The body. */
  readonly body: TemplateBodyInfo | null;
  /** The footer text. */
  readonly footer: string | null;
  /** The buttons. */
  readonly buttons: readonly TemplateButtonInfo[];
  /** OTP settings for an authentication template, else null. */
  readonly authentication: TemplateAuthentication | null;
  /** The JSON object this template was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.name = str(raw.name) ?? "";
    this.language = str(raw.language) ?? "";
    this.category = str(raw.category);
    this.from = idString(raw.from);
    this.header = isObject(raw.header) ? new TemplateHeaderInfo(raw.header) : null;
    this.body = isObject(raw.body) ? new TemplateBodyInfo(raw.body) : null;
    this.footer = str(raw.footer);
    this.buttons = objects(raw.buttons).map((b) => new TemplateButtonInfo(b));
    this.authentication = isObject(raw.authentication)
      ? new TemplateAuthentication(raw.authentication)
      : null;
  }
}

/** The answer to `client.whatsapp.templates()`. */
export class TemplateList {
  /** The request's reference: quote it to Unicom360 support. */
  readonly apiReference: string | null;
  /** The gateway's message (`successful`). */
  readonly message: string | null;
  /** The approved templates. */
  readonly templates: readonly TemplateInfo[];
  /** The response envelope this list was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    const data = objectOrNull(raw.data) ?? {};
    this.apiReference = str(raw.api_reference);
    this.message = str(raw.message);
    this.templates = objects(data.templates).map((t) => new TemplateInfo(t));
  }

  /** The first template named `name` (and in `language`, when given), or null. */
  byName(name: string, language?: string): TemplateInfo | null {
    return (
      this.templates.find(
        (t) => t.name === name && (language === undefined || t.language === language),
      ) ?? null
    );
  }
}
