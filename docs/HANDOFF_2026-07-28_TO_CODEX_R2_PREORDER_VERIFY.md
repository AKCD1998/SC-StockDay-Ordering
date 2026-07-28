# Handoff → Codex: verify Cloudflare R2 credentials for customer preorders (READ-ONLY)

Date: 2026-07-28 (Asia/Bangkok). From: Claude. Reason for handoff: this task needs the Render
dashboard/API, which Claude does not have a tool for in this session; Codex has Render MCP access.

## 0. Scope — observe only, do not edit/overwrite/delete anything

The user's explicit instruction: **just observe, don't edit, overwrite, or delete anything.**
That applies to Render env vars, the R2 bucket contents, and any repo file. This is a
verification task, not a rollout step. Do not flip `FEATURE_CUSTOMER_PREORDERS` on, do not
change any Render env var, do not write/delete R2 objects.

## 1. Background

The Customer Preorder feature (design: `docs/CUSTOMER_PREORDER_SYSTEM_DESIGN.md`, full context:
`docs/PREORDER_IMPLEMENTATION_STATE.md`, `docs/SOL_CUSTOMER_PREORDER_IMPLEMENTATION_GOAL.md`) is
**fully coded and committed but not deployed**:

- PaaSRTSM-project commit `e47e4f0` (2026-07-22) — migration `062_add_customer_preorders.sql`,
  routes/services, `services/storage/r2PreorderStorageProvider.js`.
- SC-StockDay-Ordering commit `0c22088` — `apps/admin-web/src/preorders/`.
- Feature flags default off: backend `FEATURE_CUSTOMER_PREORDERS`, frontend
  `VITE_FEATURE_CUSTOMER_PREORDERS`. Local `.env.example` at
  `PaaSRTSM-project/apps/admin-api/.env.example` still shows `FEATURE_CUSTOMER_PREORDERS=false`
  and empty `R2_*` placeholders — confirming nothing has been wired up locally.
- Migration 062 has **not** been applied to production Postgres yet (static/syntax-verified only).

Expected R2 env var contract (from the design doc, section 7.6), all backend-only, must exist on
the `paasrtsm-project` Render service, never as `VITE_R2_*`:

```env
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_BUCKET_NAME=<bucket name>
R2_REGION=auto
R2_SIGNED_URL_TTL_SECONDS=300
```

## 2. What just happened

The user created a new R2 bucket today and said the credentials are set "only in Render
dashboard" (not in any local `.env` — confirmed empty). The bucket name they gave verbally was
`FADA-preorder-system/ fadapreorderimage`, which is very likely **not a valid single R2/S3
bucket name** — bucket names must be lowercase, no slashes, 3–63 chars. That string looks like it
might actually be two separate things (an account/project label and a bucket name) or a typo.
**Do not guess or fix this — just report exactly what `R2_BUCKET_NAME` is set to on Render and
what buckets actually exist in the Cloudflare R2 dashboard/API, and flag the mismatch if any.**

## 3. Your task

1. Via Render MCP, read (do not modify) the `paasrtsm-project` service's environment variables.
   Report which of the 6 `R2_*` keys above exist and whether each has a non-empty value (do not
   print the actual secret value back in plaintext in your report — just confirm
   present/non-empty, and it's fine to show `R2_ENDPOINT`/`R2_BUCKET_NAME`/`R2_REGION` since
   those aren't secrets).
2. Confirm `R2_ENDPOINT` is an account-level S3 endpoint
   (`https://<account-id>.r2.cloudflarestorage.com`), not a per-bucket or public URL.
3. Confirm `R2_BUCKET_NAME` is a single valid bucket name (no slash, lowercase) and that it
   matches a bucket that actually exists — if you have R2 API/dashboard access, do a read-only
   `HeadBucket` or list-buckets equivalent to confirm. If you don't have Cloudflare API access,
   just report what Render says and tell the user to confirm the bucket name in the Cloudflare
   dashboard themselves.
4. Confirm `FEATURE_CUSTOMER_PREORDERS` is still `false` (expected/correct at this stage — do
   NOT change it).
5. Report back: which vars are set, whether the bucket name looks valid, whether the endpoint
   format looks right, and what (if anything) looks misconfigured. Do not proceed to apply
   migration 062, do not deploy, do not toggle any flag — that's a separate, later step the user
   will explicitly request.

## 4. Do not do

- Do not run `npm run db:migrate` from Windows or apply migration 062 to production (see
  `PaaSRTSM-project/AGENTS.md` for why — Windows path-separator bug re-applies old migrations).
- Do not edit any Render env var, even to "fix" the bucket name.
- Do not upload/delete/list-with-side-effects any R2 object beyond a read-only existence check.
- Do not enable any feature flag.
