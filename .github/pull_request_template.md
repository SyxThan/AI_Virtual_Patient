## Task
[AVP-xxx] <title>

## What and why
<!-- two or three sentences -->

## Acceptance
<!-- paste the acceptance command and its result -->

## Checklist
- [ ] `make lint` and `make test` pass
- [ ] Clinical content touched (`data/cases/**`, rubrics, prompts)? No / Yes: review status reset to `draft`: <!-- explain -->
- [ ] Migration included? No / Yes: RLS enabled and `anon`/`authenticated` revoked, `make db-check-rls` passes
- [ ] Delegated to agy? No / Yes: retries <!-- n -->, summary reviewed
- [ ] Any number quoted (latency, kappa, hallucination rate, cost) comes from a file in `evals/results/`
- [ ] No secrets, `.env`, or real student data in the diff
