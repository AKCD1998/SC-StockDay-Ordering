# AI Video Content Studio

> Phase 1 (MVP). Backend: `PaaSRTSM-project/apps/admin-api`. Frontend: standalone repo `SCAiGenVid` (sibling to this repo, NOT part of `apps/admin-web`).

## Purpose

Lets authorized staff turn a product image + prompt into a short AI-generated promotional video clip (Shopee/TikTok/Reels/Facebook/motion-infographic), track the async render job, preview/download the result, and run an approve/reject review before it's used. It is an application layer over a configurable video-generation provider — not a video model itself.

Out of scope for this phase (see plan): auto-posting to social platforms, video editing, subtitles, voice cloning, multi-scene storyboards, bulk generation, customer-facing access, patient/member/PHI data.

## Architecture

```
SCAiGenVid (new standalone frontend repo, Vite + React)
  cookie session login -> POST /admin/auth/login (existing admin-api auth, shared with admin-web/order-web)
  session restore -> GET /admin/me
        │
        ▼
PaaSRTSM admin-api (Express 4, Render, shared backend — no new service, no new DB)
  /api/content/video-jobs*        -> src/routes/video-content.js
  /api/content/assets*
        │
        ├─ src/services/videoJobsService.js    (job CRUD, submit/retry/cancel/approve/reject, visibility)
        ├─ src/services/videoAssetsService.js  (upload finalize, download authorization)
        ├─ src/services/videoJobRunner.js      (in-process poll loop, setTimeout chain — no separate worker)
        ├─ src/services/video-providers/       (provider adapter layer — see below)
        ├─ src/services/storage/               (storage adapter layer — see below)
        └─ src/auth/permissions.js             (role -> content.video.* permission map)
        │
        ▼
Postgres — schema `content` (video_jobs, video_assets, video_job_events)
        │
        ▼
Local disk (Phase 1 storage) at VIDEO_STORAGE_LOCAL_DIR, served via an
HMAC-signed backend proxy route — swappable for R2/S3 later behind the
same StorageProvider interface.
```

## Data model (migration `043_add_video_content_studio.sql`, schema `content`)

- **`content.video_jobs`** — one row per generation job. `status` ∈ `draft, queued, processing, completed, failed, cancelled, approved, rejected`. Key columns: `prompt`, `negative_prompt`, `aspect_ratio` (`16:9`/`9:16`/`1:1`), `duration_seconds`, `provider`, `model`, `provider_job_id`, `input_asset_id`/`output_asset_id` (FK → `video_assets`), `product_id_or_sku_reference` (soft text reference, not a hard FK), `estimated_cost`/`actual_cost` (nullable — `NULL` means "unavailable", never guessed), `retry_count`, full audit timestamps (`submitted_at`, `completed_at`, `approved_at`/`approved_by`, `rejected_at`/`rejected_by`/`rejection_reason`).
- **`content.video_assets`** — metadata only, never binary bytes in Postgres. `asset_type` ∈ `input_image, input_video, generated_video, thumbnail, export`. `storage_provider`/`storage_key` are the pointer into object storage.
- **`content.video_job_events`** — append-only audit trail per job (`job_created`, `submitted_to_provider`, `provider_status_updated`, `output_downloaded`, `output_stored`, `job_completed`, `job_failed`, `approved`, `rejected`, `retry_requested`, `job_cancelled`, `provider_cancel_attempted`/`_failed`).

## Routes (`/api/content`, mounted in `server.js`, gated by `FEATURE_VIDEO_STUDIO`)

| Method/Path | Guard |
|---|---|
| `GET /video-jobs/config` | auth |
| `POST /video-jobs` | auth, csrf, `content.video.create` |
| `GET /video-jobs` | auth, `content.video.view` (role-narrowed — see Security) |
| `GET /video-jobs/:id` | auth, `content.video.view` + ownership/visibility |
| `POST /video-jobs/:id/submit` | auth, csrf, `content.video.create` |
| `POST /video-jobs/:id/retry` | auth, csrf, `content.video.retry` |
| `POST /video-jobs/:id/cancel` | auth, csrf, `content.video.create` |
| `POST /video-jobs/:id/approve` | auth, csrf, `content.video.approve` (admin only) |
| `POST /video-jobs/:id/reject` | auth, csrf, `content.video.reject` (admin only, `reason` required) |
| `GET /video-jobs/:id/events` | auth, `content.video.view` |
| `GET /video-jobs/:id/download` | auth, `content.video.download` → returns `{ url }`, a short-lived signed URL |
| `POST /assets/upload-init` | auth, csrf, `content.video.create` |
| `POST /assets/upload-complete` | auth, csrf, `content.video.create`, multipart (`multer`) |
| `GET /assets/binary` | HMAC token in query string (no session needed — the token *is* the auth) |

## Frontend location

New standalone repo: `SCAiGenVid/` (sibling directory to `SC-StockDay-Ordering`, `PaaSRTSM-project`, etc.). Deliberately **not** part of `admin-web` — unrelated domain (content creation vs. ERP stock management), and this repo may be published publicly later. React + Vite SPA reusing the existing admin-api cookie-session login (`/admin/auth/login`, `/admin/me`) — no new auth system. See `SCAiGenVid/README.md` for local dev setup.

## Storage design

`StorageProvider` interface (`apps/admin-api/src/services/storage/storageProvider.js`, doc-only module): `uploadAsset`, `getSignedDownloadUrl`, `getSignedUploadUrl`, `deleteAsset`, `copyAsset`, `downloadAsset`. Phase 1 ships `localDiskStorageProvider.js` (files under `VIDEO_STORAGE_LOCAL_DIR`, default `./data/video-studio`). Downloads go through an authenticated backend proxy (`GET /api/content/assets/binary`) gated by a time-limited HMAC token (`key:expiry` signed with `VIDEO_SIGNED_URL_SECRET`, falls back to `AUTH_JWT_SECRET`), verified with `crypto.timingSafeEqual` — drafts/unapproved outputs are never reachable without a valid token *and*, for the job-download endpoint, a valid session + visibility check. `storageRegistry.js` selects the provider by `VIDEO_STORAGE_PROVIDER`; setting it to anything but `local` currently throws a clear "not configured" error rather than silently no-op'ing — this is intentional so a misconfigured R2 setup fails loudly instead of pretending to work.

## Provider adapter design

`VideoProvider` interface (`apps/admin-api/src/services/video-providers/videoProvider.js`, doc-only): `createGenerationJob`, `getGenerationJobStatus`, `cancelGenerationJob`, `downloadGenerationOutput`, all normalized to `{ status: queued|processing|completed|failed, ... }`.

- **`mockVideoProvider.js`** — fully working without any credentials. Simulates `queued → processing → completed` over ~15 seconds (wall-clock based, tunable via `config.videoMockTimingMs` for tests) and synthesizes a real 2-second black MP4 via `ffmpeg` on demand (falls back to a checked-in placeholder at `apps/admin-api/assets/mock-placeholder.mp4` if `ffmpeg` isn't on `PATH`). This is the default provider (`VIDEO_PROVIDER_DEFAULT=mock`) so the whole vertical slice works out of the box.
- **`openaiVideoProvider.js`** — real adapter for OpenAI's Sora Videos API (`POST/GET https://api.openai.com/v1/videos`, `GET /v1/videos/{id}/content?variant=video`). Supports image-to-video via `input_reference` (multipart) when an input image is attached to the job. Reads `VIDEO_PROVIDER_API_KEY` or falls back to `OPENAI_API_KEY` — **the app boots and runs fine without either set**; the error only surfaces (503) if a job actually tries to use the `openai` provider with no key configured.
- **`providerRegistry.js`** — the single point that resolves a provider name to an instance, and the enforcement point that rejects any provider/model the client requests that isn't on the server's allow-list (`videoStudioConstants.js`).

**⚠️ Known risk**: OpenAI has stated the Sora 2 Videos API is deprecated and scheduled to shut down **2026-09-24**. Re-verify `openaiVideoProvider.js` against current OpenAI docs before that date, or add a successor-API adapter — the whole point of the adapter interface is that this swap doesn't require touching routes, services, or the frontend.

## Environment variables

See `apps/admin-api/.env.example` for the full annotated list (`FEATURE_VIDEO_STUDIO`, `VIDEO_PROVIDER_*`, `VIDEO_STORAGE_*`, `VIDEO_SIGNED_URL_SECRET`, `VIDEO_MAX_*`, `VIDEO_POLL_INTERVAL_MS`, `VIDEO_MAX_POLL_MINUTES`). No provider/storage secrets are ever read by, or should ever be committed to, the `SCAiGenVid` frontend — they are server-side only.

## Local development setup

1. In `PaaSRTSM-project/apps/admin-api/.env`, set `FEATURE_VIDEO_STUDIO=true` (everything else can stay at its default — the mock provider needs no credentials).
2. Run the backend as usual (`npm start` or however it's normally started locally).
3. `cd SCAiGenVid && cp .env.example .env` (point `VITE_API_BASE_URL` at the local backend), `npm install`, `npm run dev`.
4. Log in with an existing admin/staff test account, create a job with `provider=mock`, submit, and watch it complete in ~15 seconds.

## Mock provider usage

`VIDEO_PROVIDER_DEFAULT=mock` and `mock` always present in `VIDEO_PROVIDER_ENABLED` is the recommended default for local/dev/demo use and for staff to try the workflow before OpenAI credentials are configured. It requires no external network access or API key.

## Production deployment steps

1. Merge migration `043_add_video_content_studio.sql`; it runs automatically via the existing `preDeployCommand: npm run db:migrate` on the `paasrtsm-project` Render service (no manual DB step needed beyond the normal deploy).
2. On the `paasrtsm-project` Render service, set `FEATURE_VIDEO_STUDIO=true` and any `VIDEO_*` overrides needed (at minimum, `VIDEO_PROVIDER_API_KEY` or `OPENAI_API_KEY` once you're ready to use the real provider — the mock provider works with none of these set).
3. **Trigger a Manual Deploy on Render** — this repo has no `render.yaml`, so a `git push` alone does not deploy (matches the existing PaaSRTSM convention).
4. Deploy `SCAiGenVid` as a **new Render static site** (its own `render.yaml`), pointing `VITE_API_BASE_URL` at `https://paasrtsm-project.onrender.com`. This is a new static-hosting entry only — no new backend service, no new database.
5. `VIDEO_STORAGE_LOCAL_DIR` on Render's ephemeral filesystem does **not** survive redeploys/restarts — generated videos will be lost on the next deploy until an R2/S3 adapter replaces the local provider. Treat Phase 1 storage as demo/pilot-only in production; do not rely on it for anything that must persist past a deploy.

## Security assumptions

- Role-based permissions only (no new DB table / JWT claims): `admin` → full `content.video.*` set; `staff` → create/view-own/download/retry-own; `branch` → view **approved-only**, no create/approve. Enforced both at the route layer (`requirePermission`) and again inside the service layer (defense in depth, matching the existing `stockRequestDrafts.js` pattern).
- Server-side allow-lists (never trust client-supplied `provider`/`model`/`aspectRatio`/`durationSeconds`) — validated in `videoJobsService.validateJobInput` against `videoStudioConstants.js`.
- `inputAssetId` on job creation is ownership-checked (`resolveInputAssetId`) — a user cannot reference another user's uploaded asset as generation input.
- Local-disk downloads require a valid, non-expired, HMAC-signed token; constant-time comparison (`crypto.timingSafeEqual`) prevents timing side-channels.
- Idempotent submit: a CAS (`UPDATE ... WHERE status IN ('draft','failed')`) prevents double-submission/double-billing from a double-click or retry race.
- Rate limits: `VIDEO_MAX_JOBS_PER_USER_PER_DAY`, `VIDEO_MAX_CONCURRENT_JOBS_PER_USER`, `VIDEO_MAX_RETRIES` (capped, no infinite retry loop), `VIDEO_MAX_POLL_MINUTES` (a stuck/never-completing provider job is force-failed with `error_code=timeout` rather than polling forever).
- No raw provider errors, API keys, or storage credentials are ever returned to the browser.

## How to add a second provider

1. Create `apps/admin-api/src/services/video-providers/<name>Provider.js` implementing the four `VideoProvider` interface methods.
2. Add its allowed models/durations/aspect-ratio→size mapping to `videoStudioConstants.js`.
3. Register it in `providerRegistry.js`.
4. Add `<name>` to `VIDEO_PROVIDER_ENABLED`.
5. No route, service, or frontend changes are required — the whole point of the adapter layer.

## How to rotate provider API keys

Update `VIDEO_PROVIDER_API_KEY` (or `OPENAI_API_KEY`) in the Render environment variables for `paasrtsm-project` and trigger a Manual Deploy (or a dashboard-only env var update + restart, if Render doesn't require a full redeploy for env changes — confirm current Render behavior). The key is read fresh from `config`/`process.env` on every provider call, never cached in a DB row or in memory beyond process lifetime.

## How to clean up stale drafts/assets

Not automated in Phase 1. A `draft` job that's never submitted, or an uploaded `input_image` asset never attached to a submitted job, will sit indefinitely in `content.video_jobs`/`content.video_assets` and on local disk. Recommended follow-up (not built yet): a scheduled cleanup job (cron or an admin-triggered endpoint) that deletes `draft` jobs and orphaned assets older than N days, calling `storageProvider.deleteAsset` before removing the DB row.

## Known limitations

- **Sora 2 Videos API deprecation** — shuts down 2026-09-24 per OpenAI's own docs; re-verify `openaiVideoProvider.js` before then.
- **No native cancel on the OpenAI side** — `cancelGenerationJob` is a documented no-op for `openai` (no cancel endpoint exists in the API as of writing); cancelling a job stops the app from polling it and marks it `cancelled` locally, but the render may continue (and be billed) upstream.
- **Local disk storage is not durable in production** — see deployment step 5. Swap in an R2/S3 adapter (behind the same `StorageProvider` interface) before relying on this for real deliverables.
- **Runner polling, not webhooks** — `VIDEO_PROVIDER_WEBHOOK_SECRET` is reserved but unused; Phase 2 could move to provider webhooks without changing the job state-machine logic in `videoJobRunner.js`.
- **No automated stale-asset cleanup** — see above.
- **No upload progress bar** in the `SCAiGenVid` frontend (plain `fetch`, not `XMLHttpRequest`) — acceptable for MVP file sizes, revisit if upload UX complaints come in.
- **`videoJobRunner`'s live poll-loop DB mutations are only unit/component-tested, not exercised in a full integration test** against a real Postgres + real provider — validate this manually (see QA checklist below) before trusting it in production with the real OpenAI provider.

## Manual QA checklist (staff-facing)

1. Log into `SCAiGenVid` with an `admin` account.
2. Create a new job: upload a product image, enter a prompt, pick `9:16` + a duration, leave provider as `mock`, click Generate.
3. Confirm the job appears in History with status `queued`, then watch it progress to `processing` then `completed` within ~15 seconds (refresh or wait for the auto-poll).
4. Open the job detail — confirm the input image, prompt, and full event timeline are visible.
5. Preview the generated video and download it.
6. Approve the job; confirm it moves to `approved` and a `branch`-role test account (if available) can now see it in History (approved-only visibility) but still cannot create/approve.
7. Create a second job, and reject it after completion with a reason — confirm the reason is stored and visible in the event timeline, and that a `staff`-role account cannot approve/reject (403).
8. Force a failure (e.g. submit with `provider=openai` and no API key configured) — confirm the job lands in `failed` with a readable error message, and that Retry works up to the configured cap and then stops offering retry.
9. Confirm cost shows as "N/A" (not "$0"/blank) for the mock provider, since it never reports a real cost.
