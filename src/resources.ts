import type { ClientCore, RequestOptions } from "./core/client-core.js";
import { Balance, Balances, type BundleTypeValue } from "./models/account.js";
import { EmailSendResult } from "./models/email.js";
import { SmsSendResult } from "./models/sms.js";
import {
  SessionSendResult,
  StatusResult,
  TemplateList,
  TemplateSendResult,
} from "./models/whatsapp.js";
import {
  emailToWire,
  smsToWire,
  templateToWire,
  type EmailSendParams,
  type SmsSendParams,
  type TemplateSendParams,
} from "./params.js";
import { sessionToWire, type SessionMessage } from "./session.js";

/** `client.sms`: send SMS. */
export class SmsResource {
  readonly #core: ClientCore;

  /** @internal */
  constructor(core: ClientCore) {
    this.#core = core;
  }

  /**
   * Sends one SMS text to one or more numbers.
   *
   * A number the gateway cannot use is reported in the result (`invalid()`), not thrown.
   * Retried after a timeout or a 5xx only when the call has a `userReferenceId`.
   *
   * @throws {@link APIError} for a business refusal, for example `INVALID_SENDER_ID` or
   * `INSUFFICIENT_BUNDLE`; {@link APIStatusError} and its subclasses for HTTP errors.
   */
  async send(params: SmsSendParams, options?: RequestOptions): Promise<SmsSendResult> {
    const json = await this.#core.request("sms.send", smsToWire(params), options);
    return new SmsSendResult(json);
  }
}

/** `client.email`: send email. */
export class EmailResource {
  readonly #core: ClientCore;

  /** @internal */
  constructor(core: ClientCore) {
    this.#core = core;
  }

  /**
   * Sends one email to one or more addresses.
   *
   * Email is never retried after the request may have reached the gateway (a timeout, a reset
   * connection or a 5xx), even with a `userReferenceId`: the gateway cannot de-duplicate
   * overlapping attempts. It is retried after a 429 or a failure to connect.
   */
  async send(params: EmailSendParams, options?: RequestOptions): Promise<EmailSendResult> {
    const json = await this.#core.request("email.send", emailToWire(params), options);
    return new EmailSendResult(json);
  }
}

/** `client.whatsapp`: templates, session messages and message status. */
export class WhatsAppResource {
  readonly #core: ClientCore;

  /** @internal */
  constructor(core: ClientCore) {
    this.#core = core;
  }

  /**
   * Sends an approved template to 1 to 1,000 recipients. Rejected recipients are reported in
   * the result (`rejected()`); only when every recipient is rejected does it throw
   * {@link NoValidRecipientsError}. Retried after a timeout or a 5xx only when every recipient
   * has a `userReferenceId`.
   */
  async sendTemplate(
    params: TemplateSendParams,
    options?: RequestOptions,
  ): Promise<TemplateSendResult> {
    const json = await this.#core.request(
      "whatsapp.send_template",
      templateToWire(params),
      options,
    );
    return new TemplateSendResult(json);
  }

  /**
   * Sends a session message (build it with {@link Session}) while the customer's 24-hour window
   * is open; otherwise throws {@link SessionWindowClosedError}. Retried after a timeout or a
   * 5xx only when the message has a `userReferenceId`.
   */
  async sendSession(message: SessionMessage, options?: RequestOptions): Promise<SessionSendResult> {
    const json = await this.#core.request("whatsapp.send_session", sessionToWire(message), options);
    return new SessionSendResult(json);
  }

  /**
   * The status of 1 to 100 messages, by the `messageId` the sends returned. Ids are sent as
   * given. An unknown id comes back with status `NOT_FOUND`.
   */
  async status(messageIds: readonly string[], options?: RequestOptions): Promise<StatusResult> {
    const json = await this.#core.request(
      "whatsapp.status",
      { message_ids: [...messageIds] },
      options,
    );
    return new StatusResult(json);
  }

  /** Your approved templates, with their variables and buttons. */
  async templates(options?: RequestOptions): Promise<TemplateList> {
    const json = await this.#core.request("whatsapp.templates", undefined, options);
    return new TemplateList(json);
  }
}

/** `client.balance`: units remaining on your bundles. */
export class BalanceResource {
  readonly #core: ClientCore;

  /** @internal */
  constructor(core: ClientCore) {
    this.#core = core;
  }

  /**
   * Units remaining on one bundle: `SMS` (the gateway's default), `SMS_INTERNATIONAL`, `EMAIL`
   * or `WHATSAPP` (see {@link BundleType}).
   */
  async get(bundleType?: BundleTypeValue, options?: RequestOptions): Promise<Balance> {
    const body = bundleType === undefined ? {} : { bundle_type: bundleType };
    const json = await this.#core.request("balance.get", body, options);
    return new Balance(json);
  }

  /** Units remaining on every bundle. */
  async all(options?: RequestOptions): Promise<Balances> {
    const json = await this.#core.request("balance.all", {}, options);
    return new Balances(json);
  }
}
