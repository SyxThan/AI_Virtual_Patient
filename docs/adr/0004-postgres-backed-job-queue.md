# ADR-0004: Postgres-backed job queue, no Redis

- Status: Accepted
- Date: 2026-11-09
- Deciders: Team TRINITY (human), Claude Code
- Related: AVP-005; CLAUDE.md "Architecture"; docs/specs/tech-stack.md, database.md

## Context
The cold path (evaluation, debrief) runs asynchronously and must survive restarts
and be processed exactly once by a worker. The team is small and wants to avoid
operating extra infrastructure for the MVP.

## Decision
We will use a **`jobs` table in PostgreSQL** as the queue, drained by a worker
loop using `SELECT ... FOR UPDATE SKIP LOCKED`. No Redis or external broker.

## Consequences
- One datastore to operate and back up; jobs are transactional with the data.
- Two workers each process a job once (tested in AVP-014).
- Throughput is bounded by Postgres; acceptable at MVP scale, revisit for Layer 2.

## Alternatives considered
- Redis / Celery / RQ: rejected — extra service to run and secure for little gain
  at this scale.
- Cloud queue (SQS, etc.): rejected — adds a provider and config for the MVP.
