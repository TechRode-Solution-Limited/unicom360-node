# Unicom360 Node.js SDK

The official Node.js and TypeScript SDK for the [Unicom360](https://unicom360.com) API: SMS,
email and WhatsApp over one JSON API.

- Typed requests and results, ESM and CommonJS, zero runtime dependencies.
- Runs on Node.js 20 or later, Bun, Deno and edge runtimes (it uses the platform's `fetch` and
  Web Crypto).
- Safe retries, typed errors, signed webhook verification and GSM-7 helpers.
- Targets **Unicom360 API contract v0.1.0** (`openapi.yaml` 0.1.0 in
  [unicom360-openapi](https://github.com/TechRode-Solution-Limited/unicom360-openapi)), and
  passes every vector of its conformance suite.

> **There is no sandbox.** Every accepted send is real and billed. Try the read-only calls
> (`balance`, `whatsapp.templates`, `health`) first.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [Operations](#operations)
- [Results](#results)
- [Errors](#errors)
- [Retries](#retries)
- [Automatic reference ids](#automatic-reference-ids)
- [Webhooks](#webhooks)
- [SMS and email delivery reports](#sms-and-email-delivery-reports)
- [GSM-7 helpers](#gsm-7-helpers)
- [Configuration](#configuration)
- [Logging](#logging)
- [Known differences from the API docs](#known-differences-from-the-api-docs)
- [Versioning](#versioning)

## Install

```sh
npm install unicom360
```

## Quick start

Create an API key in the portal (Developer > API keys) and put it in `UNICOM360_API_KEY`.

```ts
import { Unicom360 } from "unicom360";
// or: const { Unicom360 } = require("unicom360");

const client = new Unicom360(); // reads UNICOM360_API_KEY; or new Unicom360({ apiKey: "..." })

const result = await client.sms.send({
  from: "Unicom360",
  to: "260971234567",
  message: "Your order ZM4821 is ready.",
});
console.log(result.results[0]?.messageId);
```

A client is immutable and safe to share across requests. Keep one per API key.

## Operations

| Call                                   | API                                   |
| -------------------------------------- | ------------------------------------- |
| `client.sms.send(params)`              | `POST /api/v1/json/bulk/sms`          |
| `client.email.send(params)`            | `POST /api/v1/json/bulk/email`        |
| `client.whatsapp.sendTemplate(params)` | `POST /api/v1/json/whatsapp/template` |
| `client.whatsapp.sendSession(message)` | `POST /api/v1/json/whatsapp/session`  |
| `client.whatsapp.status(messageIds)`   | `POST /api/v1/json/whatsapp/status`   |
| `client.whatsapp.templates()`          | `GET /api/v1/json/whatsapp/templates` |
| `client.balance.get(bundleType?)`      | `POST /api/v1/json/balance`           |
| `client.balance.all()`                 | `POST /api/v1/json/balance/all`       |
| `client.health()`                      | `GET /health` (no API key)            |

Every call also takes request options as its last argument: `{ timeout, maxRetries }`.

### SMS

```ts
const result = await client.sms.send({
  from: "Unicom360", // a sender ID registered on your account
  to: ["260971234567", "260961234567"], // one string, or a list of up to 2,000
  message: "Your verification code is 482193.",
  userReferenceId: "otp-482193", // optional: makes the send safe to retry
  callbackUrl: "https://example.com/webhooks/unicom360/sms", // optional delivery reports
});

for (const r of result.accepted()) console.log(r.mobileNumber, r.messageId);
for (const r of result.invalid()) console.log(r.mobileNumber, r.status); // "Invalid mobile number"
```

Messages are GSM-7 only, 1 to 1,200 characters, billed `max(1, ceil(length / 160))` units per
recipient. The SDK does not check this for you; the [GSM-7 helpers](#gsm-7-helpers) do on
request.

### Email

```ts
const result = await client.email.send({
  from: "noreply@yourdomain.com",
  to: "jane@example.com",
  subject: "Your order is confirmed",
  emailBody: "<p>Thanks for your order.</p>", // HTML is detected and sent as HTML
  replyTo: "support@yourdomain.com",
});
console.log(result.byAddress("jane@example.com")?.messageId);
```

### WhatsApp templates

```ts
import { TemplateBody, TemplateButton, TemplateHeader } from "unicom360";

const result = await client.whatsapp.sendTemplate({
  template: "order_ready",
  language: "en_US",
  recipients: [
    {
      to: "260971234567",
      userReferenceId: "inv-42",
      header: TemplateHeader.image("https://example.com/receipts/ZM-4821.png"),
      body: TemplateBody.of(["Ada", "ZM-4821"]), // or TemplateBody.named({ name: "Ada" })
      buttons: [TemplateButton.url(0, "ZM-4821")],
    },
  ],
});
console.log(result.acceptedCount, result.rejectedCount);
for (const r of result.rejected()) console.log(r.to, r.reason); // e.g. INVALID_NUMBER
```

Header factories: `TemplateHeader.text(value)`, `.image(url)`, `.video(url)`,
`.document(url, filename?)`. Buttons: `TemplateButton.url(index, value)`,
`TemplateButton.quickReply(index, value)`. An authentication template takes `otp: "482193"`.

### WhatsApp session messages

Inside the customer's 24-hour window, build a message with a `Session` factory and send it:

```ts
import { Session } from "unicom360";

await client.whatsapp.sendSession(Session.text("260971234567", "Hi Ada, your order is ready."));

await client.whatsapp.sendSession(
  Session.buttons(
    "260971234567",
    "Collect today or deliver?",
    [
      { id: "collect", title: "Collect" },
      { id: "deliver", title: "Deliver" },
    ],
    { header: "Order ZM-4821", userReferenceId: "btn-1" },
  ),
);
```

| Factory                                                          | Sends                       |
| ---------------------------------------------------------------- | --------------------------- |
| `Session.text(to, text, options?)`                               | a text message              |
| `Session.image(to, url, { caption? })`, `Session.video(...)`     | an image or video           |
| `Session.document(to, url, { caption?, filename? })`             | a document                  |
| `Session.audio(to, url)`, `Session.sticker(to, url)`             | audio or a sticker          |
| `Session.buttons(to, body, buttons, { header?, footer? })`       | 1 to 3 reply buttons        |
| `Session.list(to, body, button, sections, { header?, footer? })` | a list of rows              |
| `Session.location(to, latitude, longitude, { name?, address? })` | a location pin              |
| `Session.contacts(to, contacts)`                                 | contact cards               |
| `Session.reaction(to, messageId, emoji)`                         | a reaction; `""` removes it |

Every factory's options also take `from`, `userReferenceId`, `callbackUrl` and (except
`reaction`) `replyTo`. `replyTo` and a reaction's `messageId` accept a `messageId` a send
returned or the `wamid.` id of a customer's message from a `message.received` webhook.

### WhatsApp status and templates

```ts
const status = await client.whatsapp.status(["7c1f3a2e-5b64-4d2f-9a8e-0f1b2c3d4e5f"]);
console.log(status.results[0]?.status); // ACCEPTED, SENT, DELIVERED, READ, FAILED, REJECTED, NOT_FOUND

const list = await client.whatsapp.templates();
console.log(list.byName("order_ready", "en_US")?.body?.variables);
```

### Balance and health

```ts
import { BundleType } from "unicom360";

const sms = await client.balance.get(); // SMS
const whatsapp = await client.balance.get(BundleType.WHATSAPP);
const { balances } = await client.balance.all(); // { SMS: 1250, EMAIL: 4000, WHATSAPP: 37 }

const health = await client.health(); // { status: "ok", ... }
```

## Results

- Results are classes with camelCase fields (`messageId`, `mobileNumber`, `apiReference`).
  Every model keeps the JSON it was parsed from in `raw`, so a field the gateway adds tomorrow
  is readable today.
- `messageId` is always a string, even where the wire sends a number.
- Status, category and reason fields are open: TypeScript suggests the known values and any
  other string passes through.
- **SMS and email results are not in request order past the tenth recipient.** Never match
  them by position: use `result.byNumber(number)` (digits only, so `+260 97 123 4567` matches
  `260971234567`; pass the international form) or `result.byAddress(address)` (case and
  surrounding spaces ignored).
- A partial success is a result, not an error: an SMS with an `Invalid mobile number` entry,
  or a template send with some rejected recipients.
- `apiReference` identifies the request: quote it to Unicom360 support.

## Errors

Every error extends `Unicom360Error`. HTTP 200 is not success: a business refusal arrives as
HTTP 200 with `success: false` and becomes an `APIError` with a normalised `code`.

```ts
import { APIError, InsufficientBundleError, RateLimitError, Unicom360Error } from "unicom360";

try {
  await client.sms.send({ from: "Unicom360", to: "260971234567", message: "Hello" });
} catch (error) {
  if (error instanceof InsufficientBundleError) {
    // top up
  } else if (error instanceof APIError) {
    console.error(error.code, error.message, error.apiReference); // e.g. INVALID_SENDER_ID
  } else if (error instanceof RateLimitError) {
    console.error(`retry in ${error.retryAfter} ms`);
  } else if (error instanceof Unicom360Error) {
    console.error(error.name, error.message);
  } else {
    throw error;
  }
}
```

| Class                                            | When                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| `ConfigurationError`                             | A missing API key, a bad base URL or option, or a browser (see below)             |
| `APIConnectionError`                             | The request did not complete (refused, reset, unreadable)                         |
| `APITimeoutError` (extends `APIConnectionError`) | The request timed out                                                             |
| `APIStatusError`                                 | Any other non-2xx answer, or a 2xx without a usable envelope                      |
| `InvalidRequestError`                            | HTTP 400: the request's shape is wrong; nothing was sent                          |
| `AuthenticationError`                            | HTTP 401: `AUTHENTICATION_FAILED`, `CREDENTIAL_DISABLED`, `IP_NOT_ALLOWED`, ...   |
| `RateLimitError`                                 | HTTP 429; `retryAfter` is the milliseconds to the next UTC minute                 |
| `APIServerError`                                 | HTTP 5xx                                                                          |
| `APIError`                                       | HTTP 200 with `success: false`; read `code`                                       |
| `InsufficientBundleError`                        | `INSUFFICIENT_BUNDLE`                                                             |
| `DuplicateReferenceError`                        | `DUPLICATE_REFERENCE`: the `userReferenceId` was already used                     |
| `NoValidRecipientsError`                         | `NO_VALID_RECIPIENTS`: every template recipient was rejected (`results` says why) |
| `SessionWindowClosedError`                       | `SESSION_WINDOW_CLOSED`: send a template instead                                  |
| `SignatureVerificationError`                     | A webhook failed verification (`reason`)                                          |

Every error has `type`, `message`, `httpStatus`, `apiReference`, `rawBody` and `attempts`;
API errors also have `code` and `data`. The documented codes are in `ErrorCode`
(`INVALID_SENDER_ID`, `SENDER_ID_NOT_ALLOWED`, `INVALID_RECIPIENT_LIMIT`, `TEMPLATE_NOT_FOUND`,
`TEMPLATE_NOT_APPROVED`, `SEND_FAILED`, `REPLY_TO_NOT_FOUND`, `CLIENT_NOT_FOUND`, and more); a
code the gateway adds later passes through unchanged. `normalizeCode(message)` is the mapping
the SDK applies to the gateway's messages.

**A `DuplicateReferenceError` with `attempts > 1` after a send means an earlier attempt of the
same call very probably succeeded**: the retry was refused because the reference had already
gone out. For a session send, `originalMessageId` is the message it went out as.

## Retries

The client retries only when it cannot cause a duplicate send:

| Outcome                                                         | Retried                                                                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP 429                                                        | always (nothing was processed)                                                                                                                          |
| A failure before anything was sent (connection refused, DNS)    | always                                                                                                                                                  |
| A timeout or reset after sending, an HTTP 5xx, or `SEND_FAILED` | read operations always; SMS and WhatsApp session sends only with a `userReferenceId`; template sends only when every recipient has one; **email never** |
| HTTP 400, 401, any other error                                  | never                                                                                                                                                   |

A 429 waits until the next UTC minute (the rate limit is a fixed per-minute window) plus up to
a second of jitter; other retries use full-jitter exponential backoff (a random wait of up to
1 s, then 2 s, 4 s and at most 8 s). Defaults: `maxRetries: 2`, `maxRetryWait: 60000`. A 429 whose wait would
exceed `maxRetryWait` is raised at once. The error raised after retries is the last attempt's,
with `attempts` set.

```ts
const client = new Unicom360({ maxRetries: 4 });
await client.balance.all({ maxRetries: 0 }); // per call
```

Email is never retried once it may have reached the gateway, even with a `userReferenceId`:
the gateway checks email references without a unique index, so two overlapping attempts could
both send.

## Automatic reference ids

With `autoReferenceIds: true`, every send without a `userReferenceId` gets one (`u360-` and 32
hex characters), reused on every retry, so SMS and WhatsApp sends become safe to retry after a
timeout. Each template recipient without one gets its own. Your own references are never
replaced. The generated values are visible in `result.raw` where the API echoes them (template
and session results) and in the debug log line. For email, a generated reference lets the
gateway refuse a later repeat but does not make the call retry-safe.

```ts
const client = new Unicom360({ autoReferenceIds: true });
```

## Webhooks

WhatsApp events (`message.status`, `message.received`, `webhook.test`) are signed with your
webhook secret. Verify against the **raw** body, before any JSON parsing:

```ts
import { SignatureVerificationError, Webhooks } from "unicom360";

const event = await Webhooks.constructEvent(
  rawBody,
  headers,
  process.env.UNICOM360_WEBHOOK_SECRET!,
);
switch (event.kind) {
  case "message_status":
    console.log(event.data.messageId, event.data.status); // sent, delivered, read, failed
    break;
  case "message_received":
    console.log(event.data.from, event.data.type, event.data.text);
    break;
  case "test":
    break;
  case "unknown":
    console.log(event.event, event.data); // an event this SDK version does not know
}
```

`Webhooks.verify(rawBody, headers, secret, { tolerance?, now? })` checks only the signature.
`rawBody` is a string, Buffer, Uint8Array or ArrayBuffer; `headers` is a fetch `Headers`,
Node's `req.headers` or a plain object. A failure rejects with `SignatureVerificationError`
whose `reason` is `missing_signature`, `missing_timestamp`, `invalid_timestamp`,
`malformed_signature`, `timestamp_out_of_tolerance` or `signature_mismatch`. The signing time
may be at most `tolerance` milliseconds from now (default 300000, five minutes). Use the
43-character secret exactly as the portal shows it; never base64-decode it.

**Express** (use `express.raw`, not `express.json`):

```ts
app.post("/webhooks/unicom360", express.raw({ type: "application/json" }), async (req, res) => {
  try {
    const event = await Webhooks.constructEvent(req.body, req.headers, secret);
    // handle event
    res.sendStatus(200);
  } catch (error) {
    res.sendStatus(error instanceof SignatureVerificationError ? 401 : 500);
  }
});
```

**Next.js route handler** (`app/api/unicom360/webhook/route.ts`):

```ts
export async function POST(request: Request): Promise<Response> {
  try {
    const event = await Webhooks.constructEvent(await request.text(), request.headers, secret);
    // handle event
    return new Response(null, { status: 200 });
  } catch (error) {
    if (error instanceof SignatureVerificationError) return new Response(null, { status: 401 });
    throw error;
  }
}
```

Good to know:

- Deliveries are retried (after 30 s, 2 m, 10 m, 30 m, 1 h, 3 h, 6 h and 12 h) on any non-2xx
  answer. Answer 2xx quickly and drop repeats by `event.deliveryId`.
- In `message.received`, a media caption arrives in `data.text`, not in `data.media`.
  `data.payload` holds Meta's object for location, contacts (`{"contacts": [...]}`), reaction,
  sticker and unsupported messages, and is null otherwise.
- An interactive or button reply has the chosen title in `data.text`, `payload` null, and
  `replyTo` set to your interactive message; the button or row id is not passed on.

Full receivers: [`examples/webhook-express.ts`](examples/webhook-express.ts) and
[`examples/webhook-nextjs`](examples/webhook-nextjs/app/api/unicom360/webhook/route.ts).

## SMS and email delivery reports

The `callbackUrl` of an SMS or email send receives delivery reports. **They are unsigned and
never retried**: anyone who knows the URL can post one, so treat them as hints.

```ts
const sms = Webhooks.parseSmsCallback(rawBody); // { messageId, status, mobileNumber }
const email = Webhooks.parseEmailCallback(rawBody); // { messageId, status, emailAddress, message }
```

SMS statuses are `SENT`, `DELIVERED`, `FAILED` and `UNKNOWN_ERROR`; email statuses `SENT`,
`DELIVERED` and `FAILED`. The email report's `messageId` is a string here, although the wire
sends a number.

## GSM-7 helpers

Opt-in checks that match the gateway exactly (the SDK never runs them on its own):

```ts
import { gsm } from "unicom360";

gsm.isGsm7("Hello {name}"); // true: the basic set plus ^{}\[~]|€
gsm.length("Line one\r\nLine two"); // 17: a CR LF pair counts as one
gsm.units("a".repeat(161)); // 2: max(1, ceil(length / 160)), not GSM segments
gsm.nonGsmCharacters("Café 👋"); // [{ char: "👋", index: 5 }]
gsm.validateSms(""); // ["empty"]; also "too_long" (over 1,200) and "non_gsm"
```

## Configuration

All durations are in **milliseconds**.

| Option                       | Default                                                |                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey`                     | `UNICOM360_API_KEY`                                    | Required; surrounding whitespace is ignored. An explicit `""` is an error, not a fallback.                                         |
| `baseUrl`                    | `UNICOM360_BASE_URL`, else `https://api.unicom360.com` | https only (http for localhost, 127.0.0.0/8 and ::1); a path prefix is kept.                                                       |
| `timeout`                    | `60000`                                                | Per attempt, until the whole body is read.                                                                                         |
| `connectTimeout`             | `10000`                                                | Passed to custom transports. With the built-in `fetch`, the runtime's own connect timeout (10 s in Node) applies within `timeout`. |
| `maxRetries`                 | `2`                                                    | Retries after the first attempt.                                                                                                   |
| `maxRetryWait`               | `60000`                                                | The longest wait before a retry.                                                                                                   |
| `autoReferenceIds`           | `false`                                                | See above.                                                                                                                         |
| `appInfo`                    |                                                        | `{ name, version?, url? }`, appended to the User-Agent.                                                                            |
| `fetch`                      | global `fetch`                                         | A custom fetch, for example one with an undici proxy agent.                                                                        |
| `transport`                  |                                                        | Replaces the HTTP layer entirely (tests).                                                                                          |
| `logger`                     | silent                                                 | See [Logging](#logging).                                                                                                           |
| `clock`, `sleeper`, `random` |                                                        | Test seams: ms since the epoch, a wait in ms, jitter in [0, 1).                                                                    |
| `dangerouslyAllowBrowser`    | `false`                                                | See below.                                                                                                                         |

`client.withOptions({ ... })` returns a copy with some options changed.

The client **refuses to run in a web browser**, where every visitor could read your API key:
call the API from your server. `dangerouslyAllowBrowser: true` overrides this if you
understand the risk.

Redirects are never followed (a 3xx is an `APIStatusError`), so the API key is never replayed
to another host.

## Logging

The client is silent by default. Set `UNICOM360_LOG=debug` (or `info`) to log to the console,
or pass any logger with `debug`, `info`, `warn` and `error` methods (`console`, pino, winston):

```ts
const client = new Unicom360({ logger: console });
```

It logs one debug line per HTTP attempt (`method`, `path`, `status`, `api_reference`,
`attempt`, `duration_ms`) and one info line per scheduled retry (`attempt`, `wait_s`, `cause`).
It never logs bodies, headers, parameters, phone numbers or addresses. The API key is redacted
everywhere: `String(client)`, `JSON.stringify(client)` and `console.log(client)` show
`apiKey: [REDACTED]`, and errors never contain it.

## Known differences from the API docs

The SDK follows the gateway's behaviour where it differs from the published reference
(details in unicom360-openapi's README):

- **Results are not in request order** past the tenth SMS or email recipient: use
  `byNumber()` and `byAddress()`.
- **SMS and email request-shape errors carry `message` as a list**; the SDK joins it with
  `"; "` in `error.message`.
- **WhatsApp balances are whole numbers** today, though the docs show fractions. `balance` is a
  `number`, so nothing changes when fractions arrive.
- **Local number formats:** only `095`, `096`, `097` and `076` local prefixes are normalised;
  send the international form (`260...`).
- **SMS and email `callbackUrl` is not validated** by the gateway: use an https URL.
- **Session `text` must not be blank**: whitespace-only text is refused with HTTP 400.
- **A session `DUPLICATE_MSG_REF` can carry a null `message_id`** when two requests race, so
  `DuplicateReferenceError.originalMessageId` can be null.
- **Rejected template recipients echo the request's values**, which can be numbers; the SDK
  converts `to` and `userReferenceId` to strings.
- **The balance endpoints can refuse with `CLIENT_NOT_FOUND`** (HTTP 200, `status: false`, no
  `api_reference`): an `APIError` with that code.
- **Email references do not protect against concurrent duplicates**, so email is never retried
  once it may have been sent.
- **429 responses carry no `Retry-After`**; the SDK computes `retryAfter` from the fixed UTC
  minute window.

## Versioning

This package follows semantic versioning from 1.0.0; until then, a minor version may change the
API. It targets the Unicom360 API contract v0.1.0, and its test suite vendors that contract's
conformance fixtures (`test/conformance/VERSION`). See [CHANGELOG.md](CHANGELOG.md).

`VERSION` is exported: `import { VERSION } from "unicom360"`.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md). Report security problems privately as described in
[SECURITY.md](SECURITY.md).

## Licence

MIT, see [LICENSE](LICENSE).
