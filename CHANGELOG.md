# Changelog

All notable changes to this package are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this package adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - Unreleased

First release, targeting the Unicom360 API contract v0.1.0.

### Added

- `Unicom360` client with `sms.send`, `email.send`, `whatsapp.sendTemplate`,
  `whatsapp.sendSession`, `whatsapp.status`, `whatsapp.templates`, `balance.get`,
  `balance.all` and `health`.
- `Session` builders for every WhatsApp session message type, and the `TemplateHeader`,
  `TemplateBody` and `TemplateButton` factories.
- Typed result models that keep the raw JSON, with `accepted()`, `invalid()`, `rejected()`,
  `byNumber()`, `byAddress()`, `byId()` and `byName()` helpers.
- The error hierarchy (`Unicom360Error` and its subclasses), with normalised error codes.
- Retries that never risk a duplicate send: 429 waits for the next UTC minute, and sends are
  retried after a timeout or 5xx only when they carry a `userReferenceId`; email never is.
- The `autoReferenceIds` option.
- `Webhooks.verify` and `Webhooks.constructEvent` for signed WhatsApp webhooks (Web Crypto),
  and `Webhooks.parseSmsCallback` and `Webhooks.parseEmailCallback` for delivery reports.
- `gsm` helpers matching the gateway's GSM-7 rules and billing units.
- Optional logging with redaction of the API key everywhere.
- ESM and CommonJS builds with type declarations; no runtime dependencies.

[Unreleased]: https://github.com/TechRode-Solution-Limited/unicom360-node/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/TechRode-Solution-Limited/unicom360-node/releases/tag/v0.1.0
