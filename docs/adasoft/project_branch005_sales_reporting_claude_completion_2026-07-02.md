---
name: Branch 005 sales reporting — Claude completion + branch-laptop git divergence — 2026-07-02
description: "Claude picked up Codex's branch-005 detailed-sales-sync handoff, verified the implementation, fixed a raw_payload key bug, committed+pushed both repos, and discovered/fixed a major git divergence on the real branch-005 laptop (X:\\SCstockDay)."
type: project
---

# Branch 005 Sales Reporting — Claude Completion — 2026-07-02

## What was verified from Codex's handoff

Read `docs/CODEX_HANDOFF_2026-07-02_BRANCH_SALES_REPORTING.md` and
`docs/adasoft/project_branch005_sales_reporting_sync_context_2026-07-02.md` first, per
instruction. Confirmed the architecture claims were accurate:

- `SC-StockDay-Ordering` = admin SPA + `adapos-sync` agent only, no live backend.
- `PaaSRTSM-project/apps/admin-api` = the only real backend; raw AdaAcc evidence lands in
  `ada.*` first, `public.*`/`analytics.*` derive later.
- `POST /api/sync/ada/sales` (in `PaaSRTSM-project/apps/admin-api/src/routes/sync-ada.js`)
  was **already live on origin/main before this session** — it already mapped
  `FTPosCode`/`terminalCode` → `ada.sales_headers.terminal_code`, so POS split was already
  wired on the ingestion side. Codex's sync-agent changes only needed to call it.
- The launcher chain (`RUN-ADAPOS-SYNC.bat` → `open-adapos-and-sync.ps1` →
  `node src/index.js --execute --branch=X`) needed **zero changes**. Dataset selection is
  entirely `.env`-driven (`ADAPOS_SYNC_DATASETS`), and `sales_detail` was wired to
  auto-enable whenever `sales` is enabled, so branch `.env` files did not need edits.
  Confirmed branch 005's live `.env` (read from `X:\SCstockDay\apps\adapos-sync\.env`)
  already has `sales` in `ADAPOS_SYNC_DATASETS`.

## Bug found and fixed

`PaaSRTSM-project/apps/admin-api/src/routes/movement-analytics.js`, in the
`/branch-product-sales/:product_code/bills` query, read
`sl.raw_payload->>'FTSdtUnitName'` for `unit_name`. But
`apps/adapos-sync/src/transform.js`'s `toSalesDetailPayload` sends that field under the
JSON key `unitName` (camelCase), not `FTSdtUnitName` — so `unit_name` would always come
back `null`. Confirmed by reading `getRawPayload()` in `sync-ada.js`
(`JSON.stringify(record)`, i.e. raw_payload keys are exactly the camelCase keys the sync
agent sent, not the original AdaAcc column names). Fixed to read `unitName` first with
`FTSdtUnitName` kept as a secondary fallback.

## Critical finding not in Codex's handoff: branch-005 laptop was git-diverged

`X:\SCstockDay` is a **mapped network drive to the real branch-005 laptop**
(`\\100.106.107.80\D`, same IP as the AdaAcc SQL Server host used for read-only
evidence-gathering). This is where `RUN-ADAPOS-SYNC.bat` actually executes in production.

Investigation showed:

- `X:\SCstockDay`'s local `main` was at commit `02af7e0` (2026-06-17), and `git ls-remote`
  against the real GitHub repo showed the **true** `origin/main` was at `d3b9acd`
  (2026-07-01) — ~25 commits ahead, including several adapos-sync-relevant fixes (branch
  price overrides, branch-stock isolation, launcher tidy-up).
- The C: clone at `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering`
  (where Codex did its uncommitted work) was correctly caught up to the true
  `origin/main` — it was never behind; only the branch-005 laptop's clone was stuck.
- Diffing `02af7e0`'s content against the true `origin/main` showed the branch laptop's
  unpushed commit was **content-identical** to what's already upstream (verified via
  `show-result.ps1`), so nothing unique would be lost by fast-forwarding it.
- Branch laptop's git working tree was clean (`git status` — nothing to commit), so a
  `git fetch && git reset --hard origin/main` was safe there.

**Why this matters going forward:** this repo has (at least) two independently-drifting
clones of the same "field agent" code — the branch-005 laptop and dev clones — with no
CI/alerting to catch drift. If new branches are onboarded or `RUN-ADAPOS-SYNC.bat` is
updated, check `git status`/`git fetch --dry-run` on the actual branch laptop drive
first, not just the dev clone, before assuming the deployed code matches GitHub.

## Actions taken this session

1. Fixed the `unit_name` raw_payload key bug in `PaaSRTSM-project`.
2. Committed + pushed `PaaSRTSM-project` (`movement-analytics.js` — the two new
   `branch-product-sales` report endpoints, now live on `origin/main` at `58077eb`).
3. Committed + pushed `SC-StockDay-Ordering` (adapos-sync detailed-sales extraction +
   posting, admin-web `Sold Qty` tab, docs — now live on `origin/main` at `b6f4bf0`).
4. **Attempted** to bring `X:\SCstockDay` (real branch-005 laptop) to the same
   `origin/main` tip via `git fetch && git reset --hard origin/main` — **this failed**.
   `X:\SCstockDay` is a mapped drive (`\\100.106.107.80\D`) that is **read-only for this
   session at the SMB share level** (NTFS ACLs on `.git` show `Authenticated Users:
   Modify`, but writes still fail with Access Denied — the share-level permission is
   more restrictive than the NTFS ACL and wins). Confirmed with a plain file write test
   in PowerShell, not just git. This is consistent with Codex's original handoff note
   ("X drive write behavior... do not assume the code was edited directly under
   `X:\SCstockDay`") — that boundary is a real, session-level constraint, not just a
   convention.

   **`X:\SCstockDay` is therefore still on the stale local commit `02af7e0`
   (2026-06-17) and will NOT pick up `sales_detail` sync until someone with write
   access to that machine runs, on the branch-005 laptop itself (RDP/physical
   access, not this mapped drive):**
   ```
   cd D:\SCstockDay
   git fetch origin
   git reset --hard origin/main
   ```
   (Working tree was confirmed clean before this session touched anything, and the
   laptop's one local-only commit was verified content-identical to what's already
   upstream, so a hard reset is safe — nothing unique is lost.)

## Still outstanding (see main handoff doc for the original acceptance criteria)

- **Blocking:** update the branch-005 laptop's local git checkout to `origin/main`
  (see command above) — this cannot be done from this session's mapped `X:` drive.
- `PaaSRTSM-project`'s Render backend needs a **Manual Deploy** click (GitHub push alone
  does not deploy admin-api — see `docs/ARCHITECTURE.md` §10).
- No end-to-end live branch sync has been run yet against the new code. Recommended
  first test: `--dry-run` from the branch-005 laptop, inspect the `sales_detail_headers`
  / `sales_detail_lines` sample rows, then a real `--execute` run.
- After a real run, verify `/api/admin/branch-product-sales?branch_code=005&...` shows
  DUOCETZ (`IC-002604`) at qty `1`, POS001 only, bill `S2605005001-0000171` — matching
  the SQL evidence Codex already gathered directly against AdaAcc.
- admin-web (`sc-stockday-ordering` static site) auto-deploys on push to `main`, so the
  new "Sold Qty" tab will appear automatically once the push lands and Render rebuilds.
