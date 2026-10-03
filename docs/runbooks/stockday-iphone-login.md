# StockDay iPhone login investigation — 2026-10-03

The user reports “Failed to fetch” or immediate “session expired” in Safari and
the ChatGPT browser on iPhone 17, while laptop login works.

## Evidence and limits

- The deployed frontend at `https://sc-stockday-ordering.onrender.com` is the admin
  app, not `apps/order-web`. Its deployed JS calls
  `https://paasrtsm-project.onrender.com` with `credentials: "include"`.
- `onrender.com` is in the Public Suffix List. The two hosts are different sites,
  so backend session cookies are third-party cookies in this frontend.
- WebKit's Safari policy blocks third-party cookies by default. `SameSite=None`
  and `Secure` alone do not override that policy:
  <https://webkit.org/tracking-prevention/>.
- Live `/admin/health` returned 200. `/admin/me` without authentication returned
  the expected 401. Login preflight returned 204 with the frontend origin and
  credential support. No production account login was attempted.
- Desktop Playwright WebKit with an iPhone viewport sent a synthetic third-party
  cookie. This runner does **not** reproduce the actual iPhone privacy policy.
  The domain architecture and documented Safari behavior strongly support a
  blocked-cookie explanation; actual-device diagnosis remains necessary.
- “Failed to fetch” can also indicate network/content-blocking failures. These
  checks do not establish its exact cause on the user's device.

## Prepared local fix

`apps/admin-web/server.mjs` serves the existing admin build and forwards only
`/backend/admin/*` and `/backend/api/*` to a fixed server-side backend origin.
Build with `VITE_API_BASE_URL=/backend`. Every existing admin API helper already
accepts this relative prefix, so frontend panels need no changes.

The browser receives host-only HttpOnly session cookies from its own website.
Cookies, CSRF headers, JSON bodies, multipart uploads, binary responses, query
strings, and logout expiration pass through to the existing backend. Backend
authentication and authorization remain authoritative. Cross-origin proxy
requests are rejected; private responses are marked `no-store`.

The shared backend and production data need no code or migration changes.

## Local validation

Completed on 2026-10-03:

- All 3 gateway integration tests passed (cookie roundtrip, CSRF enforcement,
  multipart bytes, logout, cross-origin rejection, private caching, static paths,
  unavailable upstream, and configuration constraints).
- Admin frontend built successfully with `/backend` as the API prefix.
- Render candidate passed validation against the official Blueprint JSON schema.
- Desktop WebKit with iPhone emulation passed the synthetic same-origin browser
  check: login 200, session 200, refresh restored the user, JavaScript could not
  read the HttpOnly cookie, invalid CSRF 403, valid CSRF 200, logout 204, and
  subsequent session check 401. The corrected fixture rendered the stock page
  without application exceptions. These are local fixture results, not a
  production account or real iPhone test.

```powershell
node --test tests/admin-web-gateway.test.mjs
$env:VITE_API_BASE_URL = '/backend'
npm run build
$env:STOCKDAY_API_ORIGIN = 'https://paasrtsm-project.onrender.com'
node apps/admin-web/server.mjs
```

Use a separate shell for these environment values; do not persist changes into
existing `.env` files. Local HTTP does not reproduce the backend's Secure cookie
behavior. The gateway's browser cookie test uses a synthetic local fixture.

## Release boundaries

`render.admin-gateway.yaml` is a separate deployment candidate, not a change to
the current static services. It uses a paid Starter Web Service; review the
current Render price before provisioning. A Static Site cannot run this Node
gateway. The alternative is frontend and API custom subdomains under one owned
registrable domain, with appropriate backend cookie and CORS configuration.

Do not apply the candidate automatically. Commit/push, infrastructure creation,
deployment, and changes to the current public URL require the user's request.
There are unrelated uncommitted changes in this workspace. Assemble a reviewed
release containing only the gateway changes and the intended production frontend
revision; do not deploy the entire current working tree.

Preserve current feature flag values when creating the candidate service. Start
with its separate hostname and verify real Safari login, refresh, stock loading,
CSRF-protected actions, and logout. Confirm laptop login and repeat in ChatGPT's
browser. If the embedded browser still rejects its session, use Safari directly
and investigate its separate cookie/storage environment. The original static
site remains available while evaluating the candidate. Retaining the exact
existing Render hostname requires a separately reviewed routing/migration plan.

No production settings, services, records, or accounts were changed during this
investigation.

## Authorized test deployment

On 2026-10-03 the user asked to push the fix and deploy the previously proposed
separate paid test service for iPhone validation. Release branch:
`fix/iphone-same-origin-login-2026-10-03`, based on remote main `f9f82b9`.
This release includes only the gateway, its integration tests, deployment
configuration, and this runbook. It excludes unrelated local edits. Node tests
live outside the admin workspace so its Vitest discovery does not import them.
The test service targets Virginia, matching the shared backend, and keeps
automatic deployments disabled. Compiled flags in the current production bundle
confirm customer preorders are enabled and sync event logging is disabled; the
test service preserves those values.
