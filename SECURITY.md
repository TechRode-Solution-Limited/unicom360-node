# Security policy

## Reporting a vulnerability

Please report security problems privately, never in a public issue or pull request.

- **GitHub:** use private vulnerability reporting on this repository (the "Security" tab,
  then "Report a vulnerability").
- **Email:** info@techrode.co, with "Security" in the subject.

Tell us what is affected, how to reproduce it, and what an attacker could do with it. We
acknowledge reports within three working days and keep you informed until it is fixed.

## Scope

This repository holds the official Node.js SDK for the Unicom360 API. Of particular interest:
anything that could leak an API key or webhook secret, accept a forged or replayed webhook, or
send a message twice. Problems in the Unicom360 API itself can be sent to the same address.

The webhook secrets in `test/conformance` are throwaway test values, not credentials.

## Supported versions

Only the latest release receives security fixes.
