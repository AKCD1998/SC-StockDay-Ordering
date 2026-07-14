# Sync Resilience Program — Plan

Full phase plan (Phase 0–6, architecture diagram, master `/loop` prompt) supplied
by the user on 2026-07-14, sourced from a separate Codex session. Not duplicated
here in full — this file tracks the checkpoint structure this session works
against. See conversation history / user message for the verbatim spec if the
full text is needed again.

## Checkpoints

- **CP0** — Baseline, safety, capacity inventory (read-only)
- **CP1** — Immediate containment: fix 001/003/004 scheduling + fleet version drift
- **CP2** — Observability: correct run/dataset/chunk-level status, correlation IDs
- **CP3** — Set-based DB path (products), narrow branch-stock schema, snapshot retention
- **CP4** — Async ingestion v2 (`POST /api/sync/v2/batches` + worker, `SKIP LOCKED` queue)
- **CP5** — Load testing ladder (5→1000 synthetic branches), Render scale plan
- **CP6** — Canary rollout, soak, closure

## Non-negotiable rules carried through every checkpoint

- No Scheduled Task changes, remote `.env` edits, or remote process control by Claude — MANUAL ACTION only
- No production SQL writes/migrations/backfills/deletes by Claude — MANUAL ACTION only
- No Render deploy/restart/rollback/env/plan/autoscaling changes by Claude — MANUAL ACTION only
- No secret display, no `git push`/`merge`/force-push without explicit ask
- No raw `git pull` on field machines as a fix
- Never reduce lookback window or silently disable a dataset to make dashboard green
- Preserve SQL Server 2008 R2 compatibility on the agent side
- v1 sync endpoints stay live until v2 passes soak + reconciliation

## Definition of Done (program-level, not this session)

See MANUAL-ACTIONS.md and STATE.md for live gate status. Full DoD list matches
the user's original spec (both branches on pinned agent release, single
product-master writer, no branch-stock lost update, load test w/ 40% headroom
documented, etc.) — not re-copied here to avoid drift; check the original
message if a specific gate's wording is needed verbatim.
