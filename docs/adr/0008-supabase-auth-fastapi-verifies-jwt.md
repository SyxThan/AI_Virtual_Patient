# ADR-0008: Supabase Auth; FastAPI verifies the JWT

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Hard rules" 5-7; docs/specs/tech-stack.md

## Context
Students sign in, and some use the app as guests. The API must authenticate
requests without the browser holding any secret, and guest sessions still need an
ownership check.

## Decision
We will use **Supabase Auth** for sign-in (browser uses `supabase-js` for
sign-in only) and have **FastAPI verify the JWT** (via Supabase JWKS) on each
request: `Authorization: Bearer <access token>`. For WebSocket the token is sent
as the **first message after connecting, not in the URL** (URLs end up in logs).
Guest sessions carry an unguessable token header; every session route checks
ownership. Only `NEXT_PUBLIC_*` values reach the browser; a Supabase
secret/service-role key is never one of them.

## Consequences
- No auth secret in the browser; the API is the trust boundary.
- WS tokens stay out of logs.
- Guest and signed-in flows share one ownership check.

## Alternatives considered
- Roll our own auth: rejected — cost and risk for no benefit.
- Trust Supabase RLS instead of verifying in the API: rejected — see ADR-0007.
