# PDA preview login recovery and SC visual identity

5 November 2026, Asia/Bangkok. Continuation of the existing SC StockDay PDA project. This delivery is a local review artifact; hosted v4, StockDay and Ada are not deployed or changed.

## Problem and result

The user opened `pilot-001.html` outside the opt-in HTTP fixture server and received “Failed to fetch.” The source previously defaulted to the live API when it lacked injected fixture metadata. The three reusable public codes are fixture functionality, not a production mobile PIN contract. Downloading that backend-dependent page did not make a usable standalone demo.

The existing entry now distinguishes three modes before authentication:

| Binding | Adapter and storage | Meaning |
|---|---|---|
| Explicit loopback fixture metadata | Existing `MobileCountPilotClient`, authenticated HTTP/PostgreSQL and original outbox | Actual integrated synthetic backend demonstration |
| Explicit `sc-pda-api-origin` | Existing backend client and its origin-scoped outbox | Backend-dependent candidate; network/auth failures remain errors |
| No backend binding | `BrowserPreviewClient`, separate `sc-stockday-browser-preview-v1` IndexedDB | Public synthetic interactive preview, labeled **ทดลอง** |

A configured backend failure never selects the browser demo. Backend tokens, count payloads, public-identity recovery rules, server receipts and authentication remain on the existing path. Preview device keys, event IDs/references and storage are separate; no preview queue is offered to a real backend. Source preparation still injects the explicit backend origin.

The single-file build embeds the existing UI, Thai fonts, decoder WASM and sample barcode. Public demo codes are `1111` → `01001`, `2222` → `02001`, `3333` → `03001`. These are not private credentials. Preview records have `demo-` reference IDs and visible “บันทึกในเดโม / อ้างอิงเดโม” labels, never server-receipt labels. If initial browser storage access is prohibited, the preview uses page memory and visibly says **ทดลองชั่วคราว**. Mid-write storage failures are reported; they do not silently become successful in-memory saves.

Embedded frames may forbid HTML form submissions. Only the browser-preview review action uses a normal button to validate/open the local confirmation; it does not attempt a form submission. Backend mode retains its existing native form handler. This uses the permitted local interaction without changing frame policy.

## Visual changes

Colors come from existing repository assets: `apps/admin-web/src/assets/sc-pos-logo.svg` uses royal blue `#0b1fb8`, soft yellow `#f6e96b` and white. This is an implementation reference, not a newly verified corporate brand manual. The PDA uses blue primary actions, white cards, restrained yellow accents and locally packaged IBM Plex Sans Thai. Avatar/gear, five-digit operator IDs, separate category/round selectors, the exact 7:1 code/action row and accepted count/review layout remain.

The company text lockup appears before login; authenticated screens retain the operator code. Disabled navigation is hidden before login. A solid blue fallback fixes a transient blank camera-button appearance during CSS background transitions. Selected, focus, error, placeholder and disabled states have legible colors. Measured contrast examples: primary 11.04:1, dark text on yellow 12.01:1, muted text 5.26:1, disabled labels 4.78:1, placeholder/divider 4.82:1, errors 6.12:1.

Font source and OFL license are retained under `apps/pda-preview/assets/fonts/`; decoder notices are included in the generated artifact. Existing scanner capture policy/core, torch-off default, real mobile transport and official stock logic are unchanged.

## Verification actually performed

- Four existing Node test files: **14 passed** for quantity policy, category/round choice, count client and mobile read contract.
- The delivered self-contained HTML in actual Chromium, served by an owned static-file listener with all external/backend requests blocked: all three profiles; 360/390/496px 7:1 layout; embedded Thai fonts; actual sample PNG/WASM decode; torch off; whole-number validation; original 3 and linked correction 6; original observation time; close/new-page reopen; independent rounds; two-tab stale revision conflict; opaque `allow-scripts` frame with honest temporary storage; explicit backend request failure without synthetic fallback. No script errors or external preview requests.
- Actual existing opt-in HTTP/PostgreSQL fixture: all three reusable accounts, repeated login, six-month reminder and no token/raw code persistence. This is separate from browser-only preview authentication.
- Focused actual backend UI → HTTP → PostgreSQL run after adapter isolation: count 3 with manufacture/expiry dates, real server receipt, another authenticated browser reads that receipt, correction to 6 retains the original event/time and two durable rows. The guarded synthetic reference remains 6. Newly required shell module/CSS/fonts are in the actual service-worker cache. No browser script errors.
- Only the owned loopback fixture listener and labeled disposable PostgreSQL container were used and cleaned up. The backend worktree received no edits.

The QA browser explicitly rejected `file://` navigation with `ERR_BLOCKED_BY_ADMINISTRATOR`. No policy was disabled. Exact HTML execution was verified through static HTTP and an opaque embedded frame, not direct-file navigation. An HTML preview or permitted browser context needs no inventory backend; environments forbidding local files can use an existing localhost static-file server. Camera permission and hardware behavior remain context/device dependent.

## Artifact and limits

Build: `node scripts/build-pda-browser-preview.mjs --out /absolute/new-review-directory`.

Current delivery directory: `/workspace/artifacts/pda-preview-sc-brand-2026-11-05/`.

- `app/pilot-001.html`: actual interactive single HTML, not screenshot navigation.
- `app/ARTIFACT-IDENTITY.json`: immutable file bytes/hash for review.
- `qa/browser-recovery-evidence.json`, `qa/color-contrast.json`, `core-regressions.tap`: browser-preview/policy evidence.
- `backend-qa/login-browser-evidence.json`, `backend-qa/backend-roundtrip-evidence.json`: actual cloud-loopback backend evidence.

No new ScProductDev run, hosted update, reachable staging service, physical Android/iPhone acceptance, APK, scheduled AI run or live Ada write is claimed. The prior ScProductDev R2 acceptance and hosted v4 remain historical and unchanged. The absent accepted live count/auth/unit/movement contracts, deployment/migration approval and reported hosted CORS gate remain. Browser-preview save is local demonstration only; the actual backend candidate remains separately prepared and is not silently replaced.

Existing Android/iPhone planning notes in the shared workspace are preserved. This scoped fix does not choose the native/PWA packaging strategy.
