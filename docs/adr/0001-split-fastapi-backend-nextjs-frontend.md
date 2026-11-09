# ADR-0001: Split FastAPI backend and Next.js frontend

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture"; docs/specs/tech-stack.md

## Context
The interview is voice-first and turn-based: it needs a long-lived WebSocket and
background work (the cold-path evaluation/debrief jobs). Serverless Next.js route
handlers do not provide long-lived connections or durable background workers.

## Decision
We will run two services: **FastAPI** (`apps/api`) owns all business logic, data
access, agents, guardrails and jobs; **Next.js** (`apps/web`, App Router,
TypeScript strict) renders UI only. Voice/WebSocket traffic goes browser →
FastAPI directly; Next.js route handlers hold no business logic.

## Consequences
- The WebSocket voice loop and the job worker have a home that fits them.
- Two deploy targets: a Next.js host for web, a container host that supports
  long-lived WebSockets for the API.
- One typed contract to keep in sync (see ADR-0011, `make gen-client`).

## Alternatives considered
- All-in-one Next.js (route handlers + serverless functions): rejected — no
  durable WebSocket or background worker.
- Next.js + serverless functions for the API: rejected — same limitation, plus
  cold starts hurt the <1.5 s first-audio target.
