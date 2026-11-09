# ADR-0011: REST/WebSocket conventions and OpenAPI as contract

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture", "Working agreements"; docs/specs/tech-stack.md

## Context
Two services share one contract (ADR-0001). Drift between the API and the web
client causes runtime bugs. The voice loop needs a WebSocket, and error responses
must never leak internals.

## Decision
We will standardise the API as follows (skeleton in `docs/specs/openapi.yaml`):
- **REST under `/api/v1`**, JSON, a response model on every route.
- **The OpenAPI schema is the contract**; `make gen-client` regenerates the typed
  TS client in `apps/web` after any endpoint change.
- **Auth**: `Authorization: Bearer <supabase access token>`; for WebSocket the
  token is the first message after connecting, not in the URL.
- **One error shape**: `{ "error": { "code": "...", "message": "..." } }`; never
  return stack traces or raw provider errors.
- **WebSocket** `/ws/sessions/{id}` carries the voice/text turn loop; the hot path
  uses one cached system prompt per case, no RAG, no blocking DB write before audio.
- Rate-limit and size-limit audio and text input; reject sessions not created by
  the caller.
- Core endpoints are frozen for the MVP in `openapi.yaml`; exam/lab actions arrive
  in Layer 2.

## Consequences
- The web client is generated, not hand-written, so it cannot drift silently.
- Errors are safe to show and consistent to handle.
- New endpoints follow one shape; reviewers check the diff against openapi.yaml.

## Alternatives considered
- Hand-written client types: rejected — drift and duplicated effort.
- GraphQL: rejected — REST + a generated client fits the fixed, small surface.
- Token in the WS URL: rejected — URLs are logged.
