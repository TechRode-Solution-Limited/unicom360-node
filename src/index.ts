/**
 * The official Node.js and TypeScript SDK for the Unicom360 API: SMS, email and WhatsApp over
 * one JSON API. Targets Unicom360 API contract v0.1.0.
 *
 * @packageDocumentation
 */
export { Unicom360 } from "./client.js";
export type { AppInfo, ClientOptions, RequestOptions } from "./core/client-core.js";
export type { Logger } from "./core/logger.js";
export type { JsonObject, JsonValue } from "./core/json.js";
export {
  TransportError,
  type FetchInit,
  type FetchLike,
  type FetchResponse,
  type Transport,
  type TransportErrorOptions,
  type TransportRequest,
  type TransportResponse,
} from "./core/transport.js";
export { VERSION } from "./version.js";

export {
  APIConnectionError,
  APIError,
  APIServerError,
  APIStatusError,
  APITimeoutError,
  AuthenticationError,
  ConfigurationError,
  DuplicateReferenceError,
  ErrorCode,
  InsufficientBundleError,
  InvalidRequestError,
  NoValidRecipientsError,
  RateLimitError,
  SessionWindowClosedError,
  SignatureVerificationError,
  Unicom360Error,
  normalizeCode,
  type APIErrorOptions,
  type APIResponseErrorOptions,
  type KnownErrorCode,
  type RateLimitErrorOptions,
  type SignatureVerificationReason,
  type Unicom360ErrorOptions,
  type Unicom360ErrorType,
} from "./errors.js";

export {
  TemplateBody,
  TemplateButton,
  TemplateHeader,
  type EmailSendParams,
  type MediaTemplateHeader,
  type SmsSendParams,
  type TemplateRecipient,
  type TemplateSendParams,
} from "./params.js";
export {
  Session,
  type ContactCard,
  type ContactsSessionMessage,
  type InteractiveButtons,
  type InteractiveList,
  type InteractiveSessionMessage,
  type ListRow,
  type ListSection,
  type LocationSessionMessage,
  type MediaSessionMessage,
  type PlainMediaSessionMessage,
  type ReactionOptions,
  type ReactionSessionMessage,
  type ReplyButton,
  type SessionMessage,
  type SessionOptions,
  type TextSessionMessage,
} from "./session.js";
export { BalanceResource, EmailResource, SmsResource, WhatsAppResource } from "./resources.js";

export type { OpenEnum } from "./models/common.js";
export {
  SmsDeliveryReport,
  SmsResult,
  SmsSendResult,
  type SmsDeliveryStatus,
  type SmsResultStatus,
} from "./models/sms.js";
export {
  EmailDeliveryReport,
  EmailResult,
  EmailSendResult,
  type EmailDeliveryStatus,
  type EmailResultStatus,
} from "./models/email.js";
export {
  MessageError,
  MessageStatus,
  SessionSendResult,
  StatusResult,
  TemplateAuthentication,
  TemplateBodyInfo,
  TemplateButtonInfo,
  TemplateHeaderInfo,
  TemplateInfo,
  TemplateList,
  TemplateResult,
  TemplateSendResult,
  type MessageStatusValue,
  type TemplateRejectionReason,
  type TemplateResultStatus,
  type WhatsAppCategory,
} from "./models/whatsapp.js";
export { Balance, Balances, BundleType, Health, type BundleTypeValue } from "./models/account.js";
export {
  BaseWebhookEvent,
  InboundMedia,
  InboundMessage,
  MessageReceivedEvent,
  MessageStatusData,
  MessageStatusEvent,
  TestEvent,
  TestEventData,
  UnknownEvent,
  type InboundMessageType,
  type MessageStatusEventStatus,
  type WebhookEvent,
} from "./models/events.js";

export * as Webhooks from "./webhooks.js";
export * as gsm from "./gsm.js";
