# Handoff → Codex: deploy + enable customer preorders for ALL branches (WRITE, user-authorized)

Date: 2026-07-28 (Asia/Bangkok). From: Claude. This is a scoped, user-authorized write task —
different from the two prior handoffs today, which were observe-only. Only do the specific
actions listed in section 2. Do not do anything else, even if it seems related or helpful.

## 0. Context — why "all branches" is intentional, not a shortcut

The design doc (`docs/CUSTOMER_PREORDER_SYSTEM_DESIGN.md` §16) originally recommended a staged
rollout: admin + one M/W/F branch (003) first, then add branch 005 later to validate its
different Tue/Thu/Sat delivery schedule, then widen to everyone.

The user explicitly overrode that today: sales staff normally take preorders through a LINE chat
app on their phones and won't touch this web feature unless specifically told it's ready, so
there's no real exposure risk in enabling it for all branches now. This was a deliberate decision
after reviewing the state of the feature (migration confirmed applied, R2 bucket confirmed
correct/live) — proceed on that basis, don't relitigate it.

**Known, separately-deferred item — do not fix as part of this task:** the R2 API token
(`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` on Render) is account-wide instead of scoped to the
`sc-stockdays-images` bucket. The user knows and explicitly deferred fixing this. Do not touch
those two keys or suggest rotating them as part of this deploy — that's separate, future work.

## 1. Already confirmed true (do not re-verify)

- Migration `062_add_customer_preorders.sql` is applied in production; all 16
  `customer_relations.*` tables exist (confirmed via direct read-only production DB query).
- `R2_BUCKET_NAME=sc-stockdays-images` on Render is correct and live (5 objects already in it).
- All 6 `R2_*` env vars on `paasrtsm-project` are present and valid.
- `FEATURE_CUSTOMER_PREORDERS=false` currently (about to change — see below).

## 2. Exactly what to do, in order

1. **Check what's currently live on Render for `paasrtsm-project`** (the backend) — find the
   commit SHA of the currently active deploy and compare it against the latest commit on
   `origin/main` in PaaSRTSM-project. Report both SHAs. (The preorder backend code was committed
   on 2026-07-22 as `e47e4f0`; there have been commits since. We need to know if a deploy has
   happened since then or if the live service is still running pre-preorder code.)
2. **Trigger a Manual Deploy of `paasrtsm-project`** on Render so the live backend matches the
   latest `main` commit (this brings the preorder routes/services live in code, but the feature
   flag below still gates them off until step 3).
3. **Set `FEATURE_CUSTOMER_PREORDERS=true`** in the `paasrtsm-project` Render environment. Do not
   change any other env var on this service.
4. **Set `VITE_FEATURE_CUSTOMER_PREORDERS=true`** in the `sc-stockday-ordering` (admin-web) Render
   static site's build environment variables. Note: this is a Vite app, so the flag is baked in
   at **build time**, not read at runtime — setting the env var alone is not enough.
5. **Trigger a redeploy/rebuild of the `sc-stockday-ordering` admin-web static service** so the
   new build actually has the flag baked in as `true`. (This service already has
   `autoDeploy: true` for git pushes, but an env-var-only change may need an explicit manual
   redeploy trigger to take effect — confirm and trigger if needed.)
6. **Verify both deploys succeeded**: check the backend health endpoint
   (`GET /api/health` on the live `paasrtsm-project` URL) returns OK, and check the admin-web
   build log shows a successful build with no errors.
7. **Verify the feature is actually reachable**: confirm (via a safe, read-only check — e.g. that
   `GET /api/customer-preorders/unread-count` or similar now responds instead of 404/flag-gated,
   using a legitimate session if you have one, or just confirming the route exists post-deploy)
   that the preorder feature is live, without creating any real case/data yourself.

## 3. Do not do

- Do not touch `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — that's separately deferred, see §0.
- Do not change `R2_BUCKET_NAME` or any other R2 var.
- Do not run any database migration — 062 and everything after it is already applied.
- Do not create any real preorder case, message, or attachment as a test — verification should be
  read-only / health-check style, not data-creating.
- Do not modify any other feature flag or unrelated env var on either service.
- Do not touch `docs/PREORDER_IMPLEMENTATION_STATE.md` — Claude will update that after your report.

## 4. Report back

1. The two commit SHAs from step 1 (live-before vs. latest-main).
2. Confirmation both deploys succeeded (with any build/deploy log detail worth flagging).
3. Confirmation of the two flag values now set (`FEATURE_CUSTOMER_PREORDERS=true`,
   `VITE_FEATURE_CUSTOMER_PREORDERS=true`).
4. Result of the health/reachability check in step 6–7.
5. Anything unexpected — failed build, missing env var, deploy error, anything that doesn't match
   what section 1 says should already be true.
