import type { JsonObject, JsonValue } from "./core/json.js";

/** Parameters of `client.sms.send()`. */
export interface SmsSendParams {
  /** A sender ID registered and active for SMS on your account. */
  from: string;
  /**
   * One number, or a list of up to 2,000, in international format (`260971234567`). A single
   * string is sent as a string; a list as a list.
   */
  to: string | readonly string[];
  /**
   * The text: 1 to 1,200 characters (a CR LF pair counts as one), GSM-7 only. Billed
   * `max(1, ceil(length / 160))` units per recipient. The `gsm` helpers check this locally.
   */
  message: string;
  /**
   * Your own reference. A reference already used for a recipient and this sender is refused,
   * so a send that carries one is safe to retry.
   */
  userReferenceId?: string | undefined;
  /** The URL that receives the (unsigned) SMS delivery reports. Use https. */
  callbackUrl?: string | undefined;
  /** A label for the sending system, shown in reports. */
  source?: string | undefined;
}

/** Parameters of `client.email.send()`. */
export interface EmailSendParams {
  /** An email sender registered and active on your account. */
  from: string;
  /** One address, or a list. A single string is sent as a string. */
  to: string | readonly string[];
  /** 1 to 200 characters. */
  subject: string;
  /** The body: HTML is detected and sent as HTML, anything else as plain text. */
  emailBody: string;
  /** The Reply-To address. */
  replyTo?: string | undefined;
  /**
   * Your own reference. The gateway refuses a later repeat of it for the same address and
   * sender, but email sends are never retried automatically, even with a reference.
   */
  userReferenceId?: string | undefined;
  /** The URL that receives the (unsigned) email delivery reports. Use https. */
  callbackUrl?: string | undefined;
  /** A label for the sending system, shown in reports. */
  source?: string | undefined;
}

/** A template's media header (image, video or document). */
export interface MediaTemplateHeader {
  type: "image" | "video" | "document";
  /** An https URL Meta can fetch. */
  url: string;
  /** The name a document is shown with. */
  filename?: string | undefined;
}

/**
 * A template header: the value of a text header's variable (a string), or a media header.
 * Build one with the {@link TemplateHeader} factories.
 */
export type TemplateHeader = string | MediaTemplateHeader;

/** Factories for {@link TemplateHeader} values. */
export const TemplateHeader = {
  /** The value of a text header's variable. */
  text(value: string): TemplateHeader {
    return value;
  },
  /** An image header. */
  image(url: string): MediaTemplateHeader {
    return { type: "image", url };
  },
  /** A video header. */
  video(url: string): MediaTemplateHeader {
    return { type: "video", url };
  },
  /** A document header, optionally with the file name it is shown with. */
  document(url: string, filename?: string): MediaTemplateHeader {
    return filename === undefined ? { type: "document", url } : { type: "document", url, filename };
  },
} as const;

/**
 * A template's body variables: a list in the template's variable order, or an object keyed by
 * variable name. Build one with the {@link TemplateBody} factories.
 */
export type TemplateBody = readonly string[] | Readonly<Record<string, string>>;

/** Factories for {@link TemplateBody} values. */
export const TemplateBody = {
  /** Positional variables, in the template's order (`{{1}}`, `{{2}}`, ...). */
  of(values: readonly string[]): TemplateBody {
    return values;
  },
  /** Named variables, keyed as the template list's `body.variables` gives them. */
  named(values: Readonly<Record<string, string>>): TemplateBody {
    return values;
  },
} as const;

/** A template button's value: the suffix of a url button, or a quick reply's payload. */
export interface TemplateButton {
  /** The button's position in the template. */
  index: number;
  type: "url" | "quick_reply";
  value: string;
}

/** Factories for {@link TemplateButton} values. */
export const TemplateButton = {
  /** The dynamic part of url button `index`. */
  url(index: number, value: string): TemplateButton {
    return { index, type: "url", value };
  },
  /** The payload of quick reply button `index`. */
  quickReply(index: number, value: string): TemplateButton {
    return { index, type: "quick_reply", value };
  },
} as const;

/** One recipient of a template send. */
export interface TemplateRecipient {
  /** The number in international format. */
  to: string;
  /** Your reference for this recipient; when every recipient has one, the send is retry-safe. */
  userReferenceId?: string | undefined;
  /** The header variable, or a media header. */
  header?: TemplateHeader | undefined;
  /** The body variables. */
  body?: TemplateBody | undefined;
  /** Values for the template's dynamic buttons. */
  buttons?: readonly TemplateButton[] | undefined;
  /** The code for an authentication template. */
  otp?: string | undefined;
}

/** Parameters of `client.whatsapp.sendTemplate()`. */
export interface TemplateSendParams {
  /** The name of an approved template. */
  template: string;
  /** 1 to 1,000 recipients. */
  recipients: readonly TemplateRecipient[];
  /** One of your approved WhatsApp senders; optional with exactly one. */
  from?: string | undefined;
  /** The template's language; optional when the name has one approved language. */
  language?: string | undefined;
  /** An https URL that receives this send's signed status webhooks. */
  callbackUrl?: string | undefined;
}

/** @internal Copies the defined (not undefined, not null) entries. */
export function defined(entries: Record<string, unknown>): JsonObject {
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined && value !== null) out[key] = value as JsonValue;
  }
  return out;
}

/** @internal */
export function smsToWire(params: SmsSendParams): JsonObject {
  return defined({
    from: params.from,
    to: copyRecipients(params.to),
    message: params.message,
    user_reference_id: params.userReferenceId,
    callback_url: params.callbackUrl,
    source: params.source,
  });
}

/** @internal */
export function emailToWire(params: EmailSendParams): JsonObject {
  return defined({
    from: params.from,
    to: copyRecipients(params.to),
    subject: params.subject,
    email_body: params.emailBody,
    reply_to: params.replyTo,
    user_reference_id: params.userReferenceId,
    callback_url: params.callbackUrl,
    source: params.source,
  });
}

/** @internal */
export function templateToWire(params: TemplateSendParams): JsonObject {
  return defined({
    template: params.template,
    from: params.from,
    language: params.language,
    callback_url: params.callbackUrl,
    recipients: params.recipients.map((r) =>
      defined({
        to: r.to,
        user_reference_id: r.userReferenceId,
        header: headerToWire(r.header),
        body: bodyToWire(r.body),
        buttons: r.buttons?.map((b) => ({ index: b.index, type: b.type, value: b.value })),
        otp: r.otp,
      }),
    ),
  });
}

function copyRecipients(to: string | readonly string[]): JsonValue {
  return typeof to === "string" ? to : [...to];
}

function headerToWire(header: TemplateHeader | undefined): JsonValue | undefined {
  if (header === undefined || typeof header === "string") return header;
  return defined({ type: header.type, url: header.url, filename: header.filename });
}

function bodyToWire(body: TemplateBody | undefined): JsonValue | undefined {
  if (body === undefined) return undefined;
  if (Array.isArray(body)) return [...(body as readonly string[])];
  return { ...(body as Readonly<Record<string, string>>) };
}
