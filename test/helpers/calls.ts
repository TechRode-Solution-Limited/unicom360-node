// Maps a fixture's canonical operation and API-shaped params (snake_case) to the SDK's public
// methods and builders. Unknown operations or params fail loudly instead of being skipped.
import {
  Session,
  TemplateBody,
  TemplateButton,
  TemplateHeader,
  type ContactCard,
  type ListSection,
  type ReplyButton,
  type SessionMessage,
  type SessionOptions,
  type TemplateRecipient,
  type Unicom360,
} from "../../src/index.js";

type Params = Record<string, unknown>;

export const OPERATIONS = [
  "sms.send",
  "email.send",
  "whatsapp.send_template",
  "whatsapp.send_session",
  "whatsapp.status",
  "whatsapp.templates",
  "balance.get",
  "balance.all",
  "health",
] as const;

function only(where: string, params: Params, allowed: readonly string[]): void {
  const unknown = Object.keys(params).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new Error(`${where}: the harness does not understand ${unknown.join(", ")}`);
  }
}

const s = (value: unknown): string => value as string;
const opt = (value: unknown): string | undefined => value as string | undefined;

const camel = (key: string): string => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

function camelKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(camelKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [camel(k), camelKeys(v)]));
  }
  return value;
}

function templateHeader(header: unknown): TemplateHeader | undefined {
  if (header === undefined) return undefined;
  if (typeof header === "string") return TemplateHeader.text(header);
  const h = header as Params;
  only("template header", h, ["type", "url", "filename"]);
  switch (h.type) {
    case "image":
      return TemplateHeader.image(s(h.url));
    case "video":
      return TemplateHeader.video(s(h.url));
    case "document":
      return TemplateHeader.document(s(h.url), opt(h.filename));
    default:
      throw new Error(`unknown template header type ${String(h.type)}`);
  }
}

function templateBody(body: unknown): TemplateBody | undefined {
  if (body === undefined) return undefined;
  if (Array.isArray(body)) return TemplateBody.of(body as string[]);
  return TemplateBody.named(body as Record<string, string>);
}

function templateButtons(buttons: unknown): TemplateButton[] | undefined {
  if (buttons === undefined) return undefined;
  return (buttons as Params[]).map((b) => {
    only("template button", b, ["index", "type", "value"]);
    if (b.type === "url") return TemplateButton.url(b.index as number, s(b.value));
    if (b.type === "quick_reply") return TemplateButton.quickReply(b.index as number, s(b.value));
    throw new Error(`unknown template button type ${String(b.type)}`);
  });
}

function recipient(r: Params): TemplateRecipient {
  only("template recipient", r, ["to", "user_reference_id", "header", "body", "buttons", "otp"]);
  return {
    to: s(r.to),
    userReferenceId: opt(r.user_reference_id),
    header: templateHeader(r.header),
    body: templateBody(r.body),
    buttons: templateButtons(r.buttons),
    otp: opt(r.otp),
  };
}

/** Builds a session message with the factory for `params.type`. */
export function sessionMessage(p: Params): SessionMessage {
  const common: SessionOptions = {
    from: opt(p.from),
    replyTo: opt(p.reply_to),
    userReferenceId: opt(p.user_reference_id),
    callbackUrl: opt(p.callback_url),
  };
  const base = ["to", "type", "from", "reply_to", "user_reference_id", "callback_url"];
  const to = s(p.to);
  switch (p.type) {
    case "text":
      only("text session", p, [...base, "text"]);
      return Session.text(to, s(p.text), common);
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker": {
      only(`${p.type} session`, p, [...base, "media"]);
      const m = p.media as Params;
      if (p.type === "image") {
        only("image media", m, ["url", "caption"]);
        return Session.image(to, s(m.url), { ...common, caption: opt(m.caption) });
      }
      if (p.type === "video") {
        only("video media", m, ["url", "caption"]);
        return Session.video(to, s(m.url), { ...common, caption: opt(m.caption) });
      }
      if (p.type === "document") {
        only("document media", m, ["url", "caption", "filename"]);
        return Session.document(to, s(m.url), {
          ...common,
          caption: opt(m.caption),
          filename: opt(m.filename),
        });
      }
      only(`${p.type} media`, m, ["url"]);
      return p.type === "audio"
        ? Session.audio(to, s(m.url), common)
        : Session.sticker(to, s(m.url), common);
    }
    case "interactive": {
      only("interactive session", p, [...base, "interactive"]);
      const i = p.interactive as Params;
      const extra = { header: opt(i.header), footer: opt(i.footer) };
      if (i.type === "button") {
        only("interactive buttons", i, ["type", "header", "body", "footer", "buttons"]);
        return Session.buttons(to, s(i.body), i.buttons as ReplyButton[], { ...common, ...extra });
      }
      if (i.type === "list") {
        only("interactive list", i, ["type", "header", "body", "footer", "button", "sections"]);
        return Session.list(to, s(i.body), s(i.button), i.sections as ListSection[], {
          ...common,
          ...extra,
        });
      }
      throw new Error(`unknown interactive type ${String(i.type)}`);
    }
    case "location": {
      only("location session", p, [...base, "location"]);
      const l = p.location as Params;
      only("location", l, ["latitude", "longitude", "name", "address"]);
      return Session.location(to, l.latitude as number, l.longitude as number, {
        ...common,
        name: opt(l.name),
        address: opt(l.address),
      });
    }
    case "contacts":
      only("contacts session", p, [...base, "contacts"]);
      return Session.contacts(to, camelKeys(p.contacts) as ContactCard[], common);
    case "reaction": {
      only("reaction session", p, [
        "to",
        "type",
        "from",
        "user_reference_id",
        "callback_url",
        "reaction",
      ]);
      const r = p.reaction as Params;
      only("reaction", r, ["message_id", "emoji"]);
      return Session.reaction(to, s(r.message_id), s(r.emoji), {
        from: common.from,
        userReferenceId: common.userReferenceId,
        callbackUrl: common.callbackUrl,
      });
    }
    default:
      throw new Error(`unknown session type ${String(p.type)}`);
  }
}

/** Calls `operation` with `params` (API names) through the public API. */
export function callOperation(client: Unicom360, operation: string, p: Params): Promise<unknown> {
  switch (operation) {
    case "sms.send":
      only(operation, p, ["from", "to", "message", "user_reference_id", "callback_url", "source"]);
      return client.sms.send({
        from: s(p.from),
        to: p.to as string | string[],
        message: s(p.message),
        userReferenceId: opt(p.user_reference_id),
        callbackUrl: opt(p.callback_url),
        source: opt(p.source),
      });
    case "email.send":
      only(operation, p, [
        "from",
        "to",
        "subject",
        "email_body",
        "reply_to",
        "user_reference_id",
        "callback_url",
        "source",
      ]);
      return client.email.send({
        from: s(p.from),
        to: p.to as string | string[],
        subject: s(p.subject),
        emailBody: s(p.email_body),
        replyTo: opt(p.reply_to),
        userReferenceId: opt(p.user_reference_id),
        callbackUrl: opt(p.callback_url),
        source: opt(p.source),
      });
    case "whatsapp.send_template":
      only(operation, p, ["template", "from", "language", "callback_url", "recipients"]);
      return client.whatsapp.sendTemplate({
        template: s(p.template),
        from: opt(p.from),
        language: opt(p.language),
        callbackUrl: opt(p.callback_url),
        recipients: (p.recipients as Params[]).map(recipient),
      });
    case "whatsapp.send_session":
      return client.whatsapp.sendSession(sessionMessage(p));
    case "whatsapp.status":
      only(operation, p, ["message_ids"]);
      return client.whatsapp.status(p.message_ids as string[]);
    case "whatsapp.templates":
      only(operation, p, []);
      return client.whatsapp.templates();
    case "balance.get":
      only(operation, p, ["bundle_type"]);
      return client.balance.get(opt(p.bundle_type));
    case "balance.all":
      only(operation, p, []);
      return client.balance.all();
    case "health":
      only(operation, p, []);
      return client.health();
    default:
      throw new Error(`unknown operation ${operation}: the harness must map every operation`);
  }
}
