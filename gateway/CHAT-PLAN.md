# Private chat preparation

## Audited 2026-11-17

The public `index.html` implements `chat.history` and `chat.stream` in a local mock adapter shared with the demonstrative workspace and Voice Demo. It is not an authenticated production chat backend.

Read-only inspection of deployed `nexo-discord` Railway Function source found no dedicated `/chat` route. It contains an AI-provider integration and task/action and communication routes. None were invoked or modified. This does not establish that its AI integration currently works or is suitable for an owner-only chat.

## Current candidate

`GET /chat` and `POST /chat` reuse the gateway's owner-only GitHub session. The isolated simulator uses fixed replies, has no injected HTTP client or tool dispatcher, and stores no messages. A single exchange is rendered in the response page; starting a new conversation discards that view. Only expiring, single-use CSRF forms are held in memory and removed with the owner session.

The HTTP boundary accepts a body only for exact `POST /chat`, caps it at 16 KiB, and retains the existing body prohibition for every other route. Inputs are URL-encoded forms with at most 1000 UTF-16 code units of message text; unknown fields and scenarios are rejected. HTML is escaped, responses are no-store, and the existing no-script CSP remains intact. The form explicitly requests fictitious text. There is no streaming, persistent history, AI billing, microphone access, or external action.

## Future real integration, not enabled

1. Define a provider-neutral reply adapter returning text plus explicit mode/provenance, with a timeout and cancellation contract. Never reuse CORE task/action endpoints as a generic chat transport.
2. Choose the existing authorized provider and credential destination, a model, and explicit usage/cost limits before any real request. Keep credentials on the server.
3. Review retention and deletion before introducing durable conversation memory. Do not import public demo localStorage into the private gateway automatically.
4. Add streaming, agent selection and voice independently, with capability checks. No mission execution, Discord or Gmail sending is part of chat authorization.

## Validation

51 automated tests pass, covering owner auth, session-bound forms, expiry and replay, invalid origin, escaped input, size limits, simulated failure, transport isolation, and logout. Production validation of this candidate is pending deployment. Existing Railway dashboard/OAuth functionality remains covered by the same suite.
