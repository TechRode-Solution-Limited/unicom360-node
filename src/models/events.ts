import {
  bool,
  idString,
  isObject,
  objectOrNull,
  setRaw,
  str,
  type JsonObject,
  type JsonValue,
} from "../core/json.js";
import type { OpenEnum } from "./common.js";
import { MessageError, type WhatsAppCategory } from "./whatsapp.js";

/** A status in a `message.status` webhook. */
export type MessageStatusEventStatus = OpenEnum<"sent" | "delivered" | "read" | "failed">;

/** The `data` of a `message.status` webhook. */
export class MessageStatusData {
  /** The `messageId` the send returned (a UUID). */
  readonly messageId: string;
  /** Your reference, when the send had one. */
  readonly userReferenceId: string | null;
  /** `whatsapp`. */
  readonly channel: string | null;
  /** The recipient. */
  readonly to: string | null;
  /** The sender. */
  readonly from: string | null;
  /** `sent`, `delivered`, `read` or `failed`. */
  readonly status: MessageStatusEventStatus;
  /** When Meta reported the status (ISO 8601, as received). */
  readonly timestamp: string | null;
  /** Meta's error, for a failed message. */
  readonly error: MessageError | null;
  /** The pricing category. */
  readonly category: WhatsAppCategory | null;
  /** Whether the message was charged. */
  readonly billable: boolean | null;
  /** The JSON object this data was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.userReferenceId = idString(raw.user_reference_id);
    this.channel = str(raw.channel);
    this.to = idString(raw.to);
    this.from = idString(raw.from);
    this.status = str(raw.status) ?? "";
    this.timestamp = str(raw.timestamp);
    this.error = isObject(raw.error) ? new MessageError(raw.error) : null;
    this.category = str(raw.category);
    this.billable = bool(raw.billable);
  }
}

/** Media attached to an inbound WhatsApp message. A caption arrives in `text`, not here. */
export class InboundMedia {
  /** Meta's media id. */
  readonly id: string;
  /** The media's MIME type. */
  readonly mimeType: string | null;
  /** A document's file name. */
  readonly filename: string | null;
  /** The JSON object this media was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.id = idString(raw.id) ?? "";
    this.mimeType = str(raw.mime_type);
    this.filename = str(raw.filename);
  }
}

/** The type of an inbound WhatsApp message. */
export type InboundMessageType = OpenEnum<
  | "text"
  | "image"
  | "document"
  | "audio"
  | "video"
  | "voice"
  | "sticker"
  | "interactive"
  | "button"
  | "location"
  | "contacts"
  | "reaction"
  | "unsupported"
>;

/**
 * The `data` of a `message.received` webhook: a customer's message.
 *
 * `text` holds the text, a media caption, the chosen title of an interactive or button reply,
 * or a summary line for structured types. `payload` holds Meta's object for location, contacts
 * (`{"contacts": [...]}`), reaction, sticker and unsupported messages, and is null otherwise.
 * An interactive or button reply has `replyTo` set to your interactive message; the button or
 * row id is not passed on.
 */
export class InboundMessage {
  /** Meta's WhatsApp id of the message (`wamid.` followed by Meta's id). */
  readonly messageId: string;
  /** `whatsapp`. */
  readonly channel: string | null;
  /** The customer's number. */
  readonly from: string | null;
  /** Your business number. */
  readonly to: string | null;
  /** The message type. */
  readonly type: InboundMessageType;
  /** The text, caption, reply title or summary line. */
  readonly text: string | null;
  /** The attached media, or null. */
  readonly media: InboundMedia | null;
  /** Meta's object for structured messages, or null. */
  readonly payload: JsonObject | null;
  /** The `wamid.` of the message the customer replied to, or null. */
  readonly replyTo: string | null;
  /** When the customer sent it (ISO 8601, as received). */
  readonly timestamp: string | null;
  /** When the 24-hour session window closes (ISO 8601, as received). */
  readonly windowExpiresAt: string | null;
  /** The JSON object this message was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.messageId = idString(raw.message_id) ?? "";
    this.channel = str(raw.channel);
    this.from = idString(raw.from);
    this.to = idString(raw.to);
    this.type = str(raw.type) ?? "";
    this.text = str(raw.text);
    this.media = isObject(raw.media) ? new InboundMedia(raw.media) : null;
    this.payload = objectOrNull(raw.payload);
    this.replyTo = str(raw.reply_to);
    this.timestamp = str(raw.timestamp);
    this.windowExpiresAt = str(raw.window_expires_at);
  }
}

/** The `data` of a `webhook.test` event (the portal's "Send test"). */
export class TestEventData {
  /** `This is a test event from Unicom360.` */
  readonly message: string | null;
  /** The JSON object this data was parsed from, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject) {
    setRaw(this, raw);
    this.message = str(raw.message);
  }
}

/** Fields every webhook event has. */
export abstract class BaseWebhookEvent {
  /** The body's `event`, for example `message.status`. */
  readonly event: string;
  /**
   * The `X-Unicom360-Delivery` header: the same on every retry of one delivery, so use it to
   * drop repeats. Null when the header was absent.
   */
  readonly deliveryId: string | null;
  /** When the event was created (ISO 8601, as received). */
  readonly createdAt: string | null;
  /** The whole webhook body, unknown fields included. */
  declare readonly raw: JsonObject;

  constructor(raw: JsonObject, deliveryId: string | null) {
    setRaw(this, raw);
    this.event = str(raw.event) ?? "";
    this.deliveryId = deliveryId;
    this.createdAt = str(raw.created_at);
  }
}

const dataOf = (raw: JsonObject): JsonObject => objectOrNull(raw.data) ?? {};

/** A `message.status` webhook: a WhatsApp message you sent changed status. */
export class MessageStatusEvent extends BaseWebhookEvent {
  /** Narrows a {@link WebhookEvent} in a `switch`. */
  readonly kind = "message_status";
  /** The status change. */
  readonly data: MessageStatusData;

  constructor(raw: JsonObject, deliveryId: string | null) {
    super(raw, deliveryId);
    this.data = new MessageStatusData(dataOf(raw));
  }
}

/** A `message.received` webhook: a customer sent you a WhatsApp message. */
export class MessageReceivedEvent extends BaseWebhookEvent {
  /** Narrows a {@link WebhookEvent} in a `switch`. */
  readonly kind = "message_received";
  /** The customer's message. */
  readonly data: InboundMessage;

  constructor(raw: JsonObject, deliveryId: string | null) {
    super(raw, deliveryId);
    this.data = new InboundMessage(dataOf(raw));
  }
}

/** A `webhook.test` event, sent by the portal's "Send test" button. */
export class TestEvent extends BaseWebhookEvent {
  /** Narrows a {@link WebhookEvent} in a `switch`. */
  readonly kind = "test";
  /** The test message. */
  readonly data: TestEventData;

  constructor(raw: JsonObject, deliveryId: string | null) {
    super(raw, deliveryId);
    this.data = new TestEventData(dataOf(raw));
  }
}

/** An event this SDK version does not know yet. Its `data` is the raw JSON. */
export class UnknownEvent extends BaseWebhookEvent {
  /** Narrows a {@link WebhookEvent} in a `switch`. */
  readonly kind = "unknown";
  /** The body's `data`, unparsed. */
  readonly data: JsonValue | null;

  constructor(raw: JsonObject, deliveryId: string | null) {
    super(raw, deliveryId);
    this.data = raw.data ?? null;
  }
}

/** Any signed webhook event. Switch on `kind` (or use `instanceof`). */
export type WebhookEvent = MessageStatusEvent | MessageReceivedEvent | TestEvent | UnknownEvent;
