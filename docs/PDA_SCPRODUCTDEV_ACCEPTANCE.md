# Bounded ScProductDev local acceptance

## Completed host acceptance — 2026-10-31

**VERIFIED_SC_PRODUCTDEV_LOCAL_FIXTURE_ONLY**, coordinator-supplied at 15:40 ICT. Exact `SC-PDA-LOCAL-R2` ZIP/hash matched; Windows Node v24.11.1 preflight, all eight portable verifier checks, and the staff02 / DEMO-004 browser receipt flow passed. Receipt: `d6788587-5b08-47c7-84b6-ec998cd4d045`. The owned port-4180 process was stopped; the fixture account logged out and acceptance tab closed.

See the [normalized sanitized host evidence](evidence/PDA_SCPRODUCTDEV_ACCEPTANCE_2026-10-31.json) and [living state](PDA_DEMO_INTEGRATION_STATE.md). Evidence provenance is the coordinator's actual host run; this owner did not independently open the remote screenshot or rerun acceptance. The exact ZIP and original packaging reports remain unchanged. Windows offline/camera/HID, staging/production compatibility and physical-phone acceptance were not added by this result.

The bounded procedure below is retained as the executed acceptance scope. It is **not a pending request or instruction to repeat the run**.

## Original acceptance scope

Artifact identity: **SC-PDA-LOCAL-R2**. Same SC StockDay PDA owner/project; no replacement Site or engineering owner. This is an isolated review-bundle run, not deployment. The coordinating conversation may execute these routine steps with its existing local tools. No physical Android or user-operated camera step is required.

## Authority and limits

Allowed: inspect/extract the reviewed bundle, use an already installed Node runtime and existing backend dependencies, start one loopback-only fixture process, run its Node verifier, perform ordinary local browser clicks, retain sanitized reports, and stop only that process.

Excluded: installs/upgrades, changing PowerShell execution policy, real credentials/enrollment, production/staging access, official stock/financial writes, migrations, permissions/CORS/auth changes, tunnels, remote bindings, persistent services or costs. Do not touch Shopee, OCR, JAPEMS, Transfer/Hourly, SERVER004 or CPU-v5 work. Leave the old static port 8765 and hosted v4 alone.

If 4180 is occupied, report it and leave that listener untouched. Do not kill another service or silently select another port. A different port can be reviewed explicitly if needed.

## Artifact and inputs

The owner supplies the exact ZIP path and SHA-256 in the adjacent `ARTIFACT-IDENTITY.json`. Verify that identity before extraction. Contents: existing PDA frontend/theme/decoder, isolated demo server, read-only preflight, portable Node verifier, contract/living-state docs, and synthetic evidence. No SQLite/session files, node_modules, cookies, CSRF values, bearer tokens or private credentials are bundled.

Use a review directory belonging to this PDA work. A copied/extracted review bundle is not a new app project or Site. Do not overwrite another active checkout. Locate the existing PaaSRTSM-project path read-only; do not clone, checkout, edit, install dependencies in, or restart the Transfer owner's repository.

Define these absolute paths for the local host:

- `PDA_ROOT`: extracted `SC-StockDay-Ordering` folder.
- `BACKEND_ROOT`: existing `PaaSRTSM-project` checkout.
- `DB_FILE`: isolated review data file, e.g. a `local-data/pda-review.sqlite` under the PDA review directory; never an official or unrelated database.
- `REPORT_FILE`: `ScProductDev-verification.json` in that review directory.

The source route is pinned to owner-reviewed SHA `40ef239a43b7ba2104376aad296242b062ba28d1`, canonical mobile-products file SHA-256 `3ffbc9413cc9f6ca164953c1dea1dac28bd48d40929ce3b66c086e3feabf038c`. CRLF/LF differences are normalized; actual source drift stops startup and requires contract review.

## Commands (use actual paths, preserve quoted spaces)

First read-only preflight, with an **already installed** Node 24+ executable:

```text
node "PDA_ROOT/apps/pda-demo-server/preflight.mjs" --backend-root "BACKEND_ROOT" --database "DB_FILE"
```

Expected: `ok:true`, platform/node version, expected route hash, fixture-only, and no software installation/production access. A missing runtime, dependency, route mismatch or unrelated existing SQLite file is a bounded **BLOCKED** result. Do not install, bypass or alter the existing source to force success.

Start one foreground process, retaining its own process ID/terminal:

```text
node "PDA_ROOT/apps/pda-demo-server/server.mjs" --fixture-demo --backend-root "BACKEND_ROOT" --database "DB_FILE" --port 4180
```

Expected URL: `http://127.0.0.1:4180/`, environment `isolated-fixture-demo`, officialStockWrites=false. Nothing listens on external interfaces.

In a separate terminal, use Node built-ins only:

```text
node "PDA_ROOT/apps/pda-demo-server/verify-local.mjs" --fixture-demo --port 4180 --output "REPORT_FILE"
```

This verifies local target identity before login/write. It creates synthetic count/correction records, checks exact-retry receipt, a second authenticated client, lot/manufacture/expiry data and source-choice history, then logs out its temporary sessions. It does not create real identities or need Python, Playwright, a mobile token or a physical phone.

## Routine browser check

Open **`http://127.0.0.1:4180/index.html`** in the existing authorized local browser. This must display `DEMO · SHARED API`, not browser-only `DEMO PREVIEW`.

1. Select fixture staff02, PIN `2222`.
2. The sample scan should open assigned product `DEMO-004`. DEMO-001–003 count buttons should be disabled for this account.
3. Enter lot `SCPRODUCTDEV-LOCAL-CHECK`, quantity `1`; explicitly choose unknown manufacture/expiry if appropriate for this synthetic test. Leave complete-product unchecked (partial survey) and save.
4. In History, confirm a real `Receipt` UUID, server received time, actor staff02 and assignment-consistent product. Do not interpret it as official stock publication.
5. Capture only the nonsecret UI/receipt evidence. Close the browser tab and stop only the newly started fixture process after acceptance. No autostart/service/task is installed.

The three fixture PINs remain the original public demo values; they are not production auth. The production contract has no PIN/refresh endpoint. No test targets production.

## Return evidence only

Return: artifact ZIP/hash, actual host/platform/node version, sanitized preflight result, portable verifier JSON, browser entry mode/product/receipt ID (or screenshot), port used and whether the owned process was stopped. Never return cookies, CSRF, bearer tokens, environment dumps or SQLite/session files.

Classify separately:

- Cloud-local tests: already completed by PDA owner; not ScProductDev proof.
- ScProductDev integrated run: VERIFIED only after these host-specific results.
- Old ScProductDev port-8765 HTML: static theme review, unchanged.
- Hosted Site: v4 unchanged; not this loopback API.
- Staging: no approved reachable HTTPS count backend; production CORS 403 remains a gate.
- Physical phone: later camera/torch/Volume+ acceptance; not needed for this phase.

For any block, return action, target, reason, outcome (blocked/pending/uncertain), and completed steps. The PDA owner continues independent safe work; do not create another engineering owner or ask the user to perform routine tooling steps.
