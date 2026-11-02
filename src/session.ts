import type { JsonObject, JsonValue } from "./core/json.js";
import { defined } from "./params.js";

/** Optional fields every session message can carry. */
export interface SessionOptions {
  /** One of your approved WhatsApp senders; optional with exactly one. */
  from?: string | undefined;
  /**
   * The message to quote: a `messageId` a send returned, or the `wamid.` id of a customer's
   * message as a `message.received` webhook gives it.
   */
  replyTo?: string | undefined;
  /** Your own reference. A send that carries one is safe to retry. */
  userReferenceId?: string | undefined;
  /** An https URL that receives this message's signed status webhooks. */
  callbackUrl?: string | undefined;
}

/** The optional fields of a reaction, which cannot quote a message. */
export type ReactionOptions = Omit<SessionOptions, "replyTo">;

/** A reply button: an id you choose and the title the customer sees (1 to 20 characters). */
export interface ReplyButton {
  id: string;
  title: string;
}

/** A row of a list message. */
export interface ListRow {
  id: string;
  title: string;
  description?: string | undefined;
}

/** A section of a list message. `title` is required when there is more than one section. */
export interface ListSection {
  title?: string | undefined;
  rows: readonly ListRow[];
}

/** Reply buttons (1 to 3). */
export interface InteractiveButtons {
  type: "button";
  body: string;
  buttons: readonly ReplyButton[];
  header?: string | undefined;
  footer?: string | undefined;
}

/** A list the customer picks one row from. */
export interface InteractiveList {
  type: "list";
  body: string;
  /** The text of the button that opens the list. */
  button: string;
  sections: readonly ListSection[];
  header?: string | undefined;
  footer?: string | undefined;
}

/** A contact card, Meta's contact object with camelCase keys. */
export interface ContactCard {
  name: {
    formattedName: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
    middleName?: string | undefined;
    suffix?: string | undefined;
    prefix?: string | undefined;
  };
  phones: readonly { phone: string; type?: string | undefined; waId?: string | undefined }[];
  emails?: readonly { email?: string | undefined; type?: string | undefined }[] | undefined;
  urls?: readonly { url?: string | undefined; type?: string | undefined }[] | undefined;
  addresses?:
    | readonly {
        street?: string | undefined;
        city?: string | undefined;
        state?: string | undefined;
        zip?: string | undefined;
        country?: string | undefined;
        countryCode?: string | undefined;
        type?: string | undefined;
      }[]
    | undefined;
  org?:
    | {
        company?: string | undefined;
        department?: string | undefined;
        title?: string | undefined;
      }
    | undefined;
  birthday?: string | undefined;
}

/** A text message. */
export interface TextSessionMessage extends SessionOptions {
  to: string;
  type: "text";
  text: string;
}

/** An image, video or document. */
export interface MediaSessionMessage extends SessionOptions {
  to: string;
  type: "image" | "video" | "document";
  media: { url: string; caption?: string | undefined; filename?: string | undefined };
}

/** An audio clip or sticker. */
export interface PlainMediaSessionMessage extends SessionOptions {
  to: string;
  type: "audio" | "sticker";
  media: { url: string };
}

/** Reply buttons or a list. */
export interface InteractiveSessionMessage extends SessionOptions {
  to: string;
  type: "interactive";
  interactive: InteractiveButtons | InteractiveList;
}

/** A location pin. */
export interface LocationSessionMessage extends SessionOptions {
  to: string;
  type: "location";
  location: {
    latitude: number;
    longitude: number;
    name?: string | undefined;
    address?: string | undefined;
  };
}

/** One or more contact cards. */
export interface ContactsSessionMessage extends SessionOptions {
  to: string;
  type: "contacts";
  contacts: readonly ContactCard[];
}

/** A reaction to a message; an empty emoji removes your reaction. */
export interface ReactionSessionMessage extends ReactionOptions {
  to: string;
  type: "reaction";
  reaction: { messageId: string; emoji: string };
}

/**
 * A WhatsApp session message, sendable while the customer's 24-hour window is open. Build one
 * with the {@link Session} factories.
 */
export type SessionMessage =
  | TextSessionMessage
  | MediaSessionMessage
  | PlainMediaSessionMessage
  | InteractiveSessionMessage
  | LocationSessionMessage
  | ContactsSessionMessage
  | ReactionSessionMessage;

function common(options: SessionOptions | undefined): SessionOptions {
  if (options === undefined) return {};
  const out: SessionOptions = {};
  if (options.from !== undefined) out.from = options.from;
  if (options.replyTo !== undefined) out.replyTo = options.replyTo;
  if (options.userReferenceId !== undefined) out.userReferenceId = options.userReferenceId;
  if (options.callbackUrl !== undefined) out.callbackUrl = options.callbackUrl;
  return out;
}

function media(
  url: string,
  caption?: string,
  filename?: string,
): { url: string; caption?: string; filename?: string } {
  const out: { url: string; caption?: string; filename?: string } = { url };
  if (caption !== undefined) out.caption = caption;
  if (filename !== undefined) out.filename = filename;
  return out;
}

/** Factories for {@link SessionMessage}s, one per content type. */
export const Session = {
  /** A text message (1 to 4,096 characters, not blank). */
  text(to: string, text: string, options?: SessionOptions): TextSessionMessage {
    return { to, type: "text", text, ...common(options) };
  },

  /** An image, with an optional caption. */
  image(
    to: string,
    url: string,
    options?: SessionOptions & { caption?: string | undefined },
  ): MediaSessionMessage {
    return { to, type: "image", media: media(url, options?.caption), ...common(options) };
  },

  /** A video, with an optional caption. */
  video(
    to: string,
    url: string,
    options?: SessionOptions & { caption?: string | undefined },
  ): MediaSessionMessage {
    return { to, type: "video", media: media(url, options?.caption), ...common(options) };
  },

  /** A document, with an optional caption and the file name it is shown with. */
  document(
    to: string,
    url: string,
    options?: SessionOptions & { caption?: string | undefined; filename?: string | undefined },
  ): MediaSessionMessage {
    return {
      to,
      type: "document",
      media: media(url, options?.caption, options?.filename),
      ...common(options),
    };
  },

  /** An audio clip. */
  audio(to: string, url: string, options?: SessionOptions): PlainMediaSessionMessage {
    return { to, type: "audio", media: { url }, ...common(options) };
  },

  /** A sticker. */
  sticker(to: string, url: string, options?: SessionOptions): PlainMediaSessionMessage {
    return { to, type: "sticker", media: { url }, ...common(options) };
  },

  /** 1 to 3 reply buttons under a body text, with an optional header and footer. */
  buttons(
    to: string,
    body: string,
    buttons: readonly ReplyButton[],
    options?: SessionOptions & { header?: string | undefined; footer?: string | undefined },
  ): InteractiveSessionMessage {
    const interactive: InteractiveButtons = { type: "button", body, buttons };
    if (options?.header !== undefined) interactive.header = options.header;
    if (options?.footer !== undefined) interactive.footer = options.footer;
    return { to, type: "interactive", interactive, ...common(options) };
  },

  /** A list of rows in sections, opened by a button. */
  list(
    to: string,
    body: string,
    button: string,
    sections: readonly ListSection[],
    options?: SessionOptions & { header?: string | undefined; footer?: string | undefined },
  ): InteractiveSessionMessage {
    const interactive: InteractiveList = { type: "list", body, button, sections };
    if (options?.header !== undefined) interactive.header = options.header;
    if (options?.footer !== undefined) interactive.footer = options.footer;
    return { to, type: "interactive", interactive, ...common(options) };
  },

  /** A location pin, with an optional name and address. */
  location(
    to: string,
    latitude: number,
    longitude: number,
    options?: SessionOptions & { name?: string | undefined; address?: string | undefined },
  ): LocationSessionMessage {
    const location: LocationSessionMessage["location"] = { latitude, longitude };
    if (options?.name !== undefined) location.name = options.name;
    if (options?.address !== undefined) location.address = options.address;
    return { to, type: "location", location, ...common(options) };
  },

  /** 1 to 10 contact cards. */
  contacts(
    to: string,
    contacts: readonly ContactCard[],
    options?: SessionOptions,
  ): ContactsSessionMessage {
    return { to, type: "contacts", contacts, ...common(options) };
  },

  /**
   * A reaction to `messageId` (a `messageId` a send returned, or a customer message's `wamid.`
   * id). An empty `emoji` removes your reaction.
   */
  reaction(
    to: string,
    messageId: string,
    emoji: string,
    options?: ReactionOptions,
  ): ReactionSessionMessage {
    const { from, userReferenceId, callbackUrl } = options ?? {};
    return {
      to,
      type: "reaction",
      reaction: { messageId, emoji },
      ...common({ from, userReferenceId, callbackUrl }),
    };
  },
} as const;

const camelToSnake = (key: string): string => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

function snakeKeys(value: unknown): JsonValue {
  if (Array.isArray(value)) return value.map(snakeKeys);
  if (value !== null && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, inner] of Object.entries(value)) {
      if (inner !== undefined && inner !== null) out[camelToSnake(key)] = snakeKeys(inner);
    }
    return out;
  }
  return value as JsonValue;
}

/** @internal The message in the API's shape. */
export function sessionToWire(message: SessionMessage): JsonObject {
  const out: JsonObject = { to: message.to, type: message.type };
  switch (message.type) {
    case "text":
      out.text = message.text;
      break;
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker":
      out.media = defined({ ...message.media });
      break;
    case "interactive": {
      const i = message.interactive;
      out.interactive =
        i.type === "button"
          ? defined({
              type: "button",
              header: i.header,
              body: i.body,
              footer: i.footer,
              buttons: i.buttons.map((b) => ({ id: b.id, title: b.title })),
            })
          : defined({
              type: "list",
              header: i.header,
              body: i.body,
              footer: i.footer,
              button: i.button,
              sections: i.sections.map((s) =>
                defined({
                  title: s.title,
                  rows: s.rows.map((r) =>
                    defined({ id: r.id, title: r.title, description: r.description }),
                  ),
                }),
              ),
            });
      break;
    }
    case "location":
      out.location = defined({ ...message.location });
      break;
    case "contacts":
      out.contacts = message.contacts.map(snakeKeys);
      break;
    case "reaction":
      out.reaction = { message_id: message.reaction.messageId, emoji: message.reaction.emoji };
      break;
  }
  const extra = message as SessionOptions;
  return {
    ...out,
    ...defined({
      from: extra.from,
      reply_to: extra.replyTo,
      user_reference_id: extra.userReferenceId,
      callback_url: extra.callbackUrl,
    }),
  };
}
