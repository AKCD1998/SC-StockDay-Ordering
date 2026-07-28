# Handoff → Codex: reconcile which R2 bucket is actually live (READ-ONLY)

Date: 2026-07-28 (Asia/Bangkok). From: Claude. Follow-up to
`docs/HANDOFF_2026-07-28_TO_CODEX_R2_PREORDER_VERIFY.md` (already completed by you).

## 0. Scope — observe only, do not edit/overwrite/delete anything

Same constraint as last time: do not change any Render env var, do not touch any R2 bucket
contents, do not toggle any feature flag, do not run any migration. Pure verification.

## 1. What's already confirmed (no need to redo)

- Render `paasrtsm-project` env vars: all 6 `R2_*` vars present/non-empty.
  `R2_BUCKET_NAME=sc-stockdays-images`, `R2_ENDPOINT=https://ad668595986473846fb5679d2c1530b4.r2.cloudflarestorage.com`.
- `FEATURE_CUSTOMER_PREORDERS=false` — correct, leave it.
- Claude independently confirmed via read-only production DB query that migration
  `062_add_customer_preorders.sql` **is fully applied** (recorded in `public.schema_migrations`
  at 2026-07-22T12:51:04Z, correct `/`-style filename, all 16 `customer_relations.*` tables
  exist). This contradicts `docs/PREORDER_IMPLEMENTATION_STATE.md`'s "not applied" claim — that
  doc is stale, not you touching anything about it needed right now.

## 2. The one open question

The user separately created a **new** Cloudflare R2 bucket today, verbally named something like
`FADA-preorder-system` / `fadapreorderimage` (note: that string has a slash in it, which is not a
valid single R2/S3 bucket name — bucket names must be lowercase, no slashes, 3–63 chars — so it's
likely either two separate names, a typo, or a folder-style label the user used informally).

This does **not** match `R2_BUCKET_NAME=sc-stockdays-images` currently set on Render. Two
possibilities:
- `sc-stockdays-images` already existed (created during the original 2026-07-22 implementation
  work) and is a *different, still-valid* bucket the app is currently pointed at, or
- Render's `R2_BUCKET_NAME` is stale/placeholder and doesn't point at any real bucket yet.

## 3. Your task

1. Using whatever Cloudflare/R2 access you have (dashboard, API, or wrangler), list the actual
   R2 buckets that exist in the account tied to `R2_ENDPOINT`'s account ID
   (`ad668595986473846fb5679d2c1530b4`).
2. Report whether a bucket named exactly `sc-stockdays-images` exists.
3. Report what buckets exist that resemble what the user described today (something like
   `fada-preorder-system` or `fadapreorderimage`), and their exact real names.
4. Report whether the credentials currently in `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` on
   Render are scoped to `sc-stockdays-images`, to the new bucket, or to the whole account (if you
   can determine that without making any write call — a read-only `HeadBucket` against each
   candidate bucket name is fine).
5. Do NOT change `R2_BUCKET_NAME` or any other env var yourself. Just report which bucket name is
   actually correct/live so the user can decide and make that one edit themselves (or ask me to).
6. If you cannot reach Cloudflare directly at all, say so plainly and report only what Render
   shows.

## 4. Do not do

- Do not edit `R2_BUCKET_NAME` or any other Render env var.
- Do not create, delete, or write any object in any bucket.
- Do not toggle `FEATURE_CUSTOMER_PREORDERS`.
- Do not run any migration or touch `PREORDER_IMPLEMENTATION_STATE.md` — Claude will update that
  doc separately once this bucket question is resolved.
