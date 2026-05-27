# Codex Handoff — HQ Own-Stock Attribution
**Date:** 2026-05-27
**Author:** Claude (prev session)
**Next agent:** Codex (continuing on the branch 005 laptop or wherever)

---

## Read this first: the architecture (don't get this wrong)

There are **TWO separate GitHub repos** in play. They are deployed as two Render services:

| Repo | Render service | Role | URL |
|------|---------------|------|-----|
| `AKCD1998/SC-StockDay-Ordering` | `sc-stockday-ordering` | **STATIC SPA host only**. Builds the admin web (Vite/React in `apps/admin-web/`) and serves the `dist/` files. Also contains `apps/adapos-sync/` — the Node.js agent that runs on each branch laptop's Mother PC. **Has no live API.** | `https://sc-stockday-ordering.onrender.com` |
| `AKCD1998/PaaSRTSM-project` | `PaaSRTSM-project` | **The shared backend.** All `/api/*` traffic from the admin SPA, from sync agents, and from anywhere else lands here. Postgres lives here. | `https://paasrtsm-project.onrender.com` |

The admin SPA is built with `VITE_API_BASE_URL=https://paasrtsm-project.onrender.com` baked in at build time. So when you see `apiFetch("/api/...")` in `apps/admin-web/src/App.jsx`, that call hits paasrtsm, **not** sc-stockday-ordering.

**If you add a new backend endpoint, it goes in `PaaSRTSM-project/apps/admin-api/src/routes/*.js`, not in `SC-StockDay-Ordering/server/`.** The `SC-StockDay-Ordering/server/` code exists in this repo but is not the running backend — it's vestigial / used for local dev only.

Local clone locations on Chavit's machine:
- `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering` (this repo)
- `C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project` (the backend repo)

Render config: PaaSRTSM service has **no `preDeployCommand`**, so migrations need to be applied manually via `npm run db:migrate` in the Render Shell after each deploy that adds a migration.

---

## What was just built (session 2026-05-27, commit chain visible in git log)

### 1. Nightly sync log feature
The admin "ประวัติ Sync" tab shows a per-branch per-night calendar grid with ✅ / ❌ / 💤 / 🌙 / ⏳ icons.

- **SC-StockDay-Ordering**:
  - `apps/admin-web/src/App.jsx` → new `SyncLogPanel` component, fetches `/api/sync/nightly-log?days=14` via `apiFetch`
  - `apps/admin-web/src/styles.css` → `.sync-log-*` styles, dark-mode variants
  - `apps/adapos-sync/sync-and-shutdown.ps1` → wrapper script for branch laptops. Sends heartbeat, runs sync up to 3×, shuts down via `shutdown.exe /s /f /t 60`
  - `apps/adapos-sync/register-task.ps1` → installs the Windows Task Scheduler entry that fires the wrapper at 22:00 nightly
- **PaaSRTSM-project**:
  - `migrations/024_add_branch_sync_log.sql` → `ingest.laptop_heartbeats` table (`sync_runs` was already there)
  - `apps/admin-api/src/routes/sync.js` → new `POST /api/sync/heartbeat` (api-key gated, called by PS1)
  - `apps/admin-api/src/routes/ordering.js` → new `GET /api/sync/nightly-log` (cookie-auth, called by admin SPA). Builds the calendar via CTE: `ingest.sync_runs` joined with `ingest.laptop_heartbeats`, branch derived from `sync_type LIKE 'adapos_branch_XXX'`.

### 2. Branch 005 pilot status
Branch 005's Mother PC at `C:\Users\scgro\Desktop\Rxอู๋ห้ามลบ\SC-StockDay-Ordering\apps\adapos-sync` runs the sync agent nightly. Currently syncs: `products, sales, transfers, transfer_lines, branch_stock, pending_receipts, approved_receipts` to paasrtsm.

**Branches 000, 001, 003, 004 are NOT syncing yet.** Their data in paasrtsm is whatever was bulk-imported earlier, not live.

---

## The next feature to build: HQ own-stock attribution

### The problem

The "สต็อกสาขา" tab (`BranchStockPanel` in App.jsx) shows per-branch stock columns: 000, 001, 003, 004, 005. The branch 000 column is "HQ stock". But HQ stock is misleading because it includes **stock that was transferred IN from other branches** but hasn't been redistributed yet.

**Example: Tylenol shows HQ qty = 12.** Of those 12:
- 2 came from branch 001
- 2 came from branch 003
- 2 came from branch 004
- 4 came from branch 005
- → only **2** were actually purchased at HQ and never transferred in.

The user needs a new column **"HQ own stock"** that subtracts inbound transfers from HQ's reported qty, so they know how much HQ actually owns versus how much is "pass-through".

### The math

```
HQ own stock = HQ current stock (qty_branch_000)
             - SUM(transfers received FROM 001/003/004/005 INTO 000)
             + SUM(transfers sent FROM 000 OUT TO 001/003/004/005)
```

Plus-back the outbound because once HQ ships stock back out, it's no longer in HQ's qty and shouldn't be subtracted.

In practice, the simpler accurate formula: **`HQ own stock = qty_branch_000 - net_inbound_to_HQ`**, where net_inbound is `(transfers in from others) - (transfers out from HQ back to others)`.

### Data source

Transfers live in **`PaaSRTSM-project`** Postgres:

```
ada.transfer_headers
  - doc_no, doc_type, branch_code (sender), branch_code_to (receiver),
    doc_date, source_synced_at, ...
  - doc_type '7' = the relevant inter-branch transfer type
    (verify in the data — there may be additional types like '5' for returns)

ada.transfer_lines
  - doc_no, doc_type, branch_code, line_no, product_code, qty, qty_base, ...
  - Join to headers on (doc_no, doc_type, branch_code)
```

So a transfer where branch 005 sent 4 units of Tylenol to HQ would have:
- header row: `branch_code='005', branch_code_to='000'`
- line row: `branch_code='005', product_code='TYLENOL_CODE', qty=4`

For HQ own-stock attribution for `productCode`:
```sql
WITH inbound AS (
  SELECT COALESCE(SUM(l.qty_base), 0) AS qty
  FROM ada.transfer_headers h
  JOIN ada.transfer_lines l
    ON l.doc_no = h.doc_no
   AND l.doc_type = h.doc_type
   AND l.branch_code = h.branch_code
  WHERE h.branch_code_to = '000'
    AND h.branch_code IN ('001', '003', '004', '005')
    AND l.product_code = $1
    -- AND h.doc_type IN ('7', ...)  -- restrict to actual transfers, not returns/adjustments
),
outbound AS (
  SELECT COALESCE(SUM(l.qty_base), 0) AS qty
  FROM ada.transfer_headers h
  JOIN ada.transfer_lines l
    ON l.doc_no = h.doc_no
   AND l.doc_type = h.doc_type
   AND l.branch_code = h.branch_code
  WHERE h.branch_code = '000'
    AND h.branch_code_to IN ('001', '003', '004', '005')
    AND l.product_code = $1
)
SELECT (inbound.qty - outbound.qty) AS net_inbound_to_hq
FROM inbound, outbound;
```

Then `hq_own = qty_branch_000 - net_inbound_to_hq`.

**You will need to verify the doc_type filter.** Run an exploratory query in the Render Shell for paasrtsm:
```sql
SELECT doc_type, COUNT(*) FROM ada.transfer_headers GROUP BY doc_type ORDER BY 2 DESC;
```
and pick the doc_type(s) that represent actual inter-branch stock movement (not, say, supplier receipts).

### The big caveat (must be in the UI)

**This number is only fully accurate once all 5 branches sync their transfers.** Right now only branch 005 syncs, so:
- Transfers 005→HQ: present and correct
- Transfers 001→HQ, 003→HQ, 004→HQ: **missing entirely** from `ada.transfer_headers`

So the computed "HQ own stock" will currently be **overstated** (because we're not subtracting all inbound transfers, only the 005 ones). The UI must show a warning badge or tooltip on the new column saying something like:

> "ข้อมูลนี้แม่นยำเมื่อทุกสาขาเชื่อมต่อแล้ว — ปัจจุบันมีเพียงสาขา 005 ที่ซิงก์อยู่ ตัวเลขอาจสูงกว่าความเป็นจริง"

Once branches 000/001/003/004 are wired in (planned next), the warning auto-resolves. You can detect the "all branches syncing" state by checking `ingest.sync_runs` for recent (last 48h) success rows with `sync_type LIKE 'adapos_branch_%'` from all 5 branches.

---

## Files to touch (PaaSRTSM-project repo)

1. **`apps/admin-api/src/routes/branch-stock.js`** — find the query that returns the rows displayed in `BranchStockPanel`. Add a computed `hq_own_qty` column to its SELECT, plus the count of which-branches-are-actively-syncing so the UI can decide whether to show the warning.

2. Possibly **a new migration `025_add_hq_attribution_view.sql`** if the math is heavy enough that you want a materialized view rather than computing it on every request. (Branch stock snapshots only change at 22:00 nightly, so a materialized view refreshed once per night is plausible.) Start without — go materialized only if perf is a problem.

3. **`apps/admin-web/src/App.jsx`** in SC-StockDay-Ordering repo — add the new column to `BranchStockPanel`'s table header + body, plus a warning chip/badge if the sync-status field shows incomplete coverage.

## Files NOT to touch
- `apps/adapos-sync/` — sync agent doesn't need changes for this feature
- `server/` in SC-StockDay-Ordering — vestigial, not running

---

## Reference: useful commands

```bash
# Local PaaSRTSM dev
cd "C:\Users\scgro\Desktop\Webapp training project\PaaSRTSM-project"
npm install
npm run admin-api:start  # listens on PORT env

# Apply migration to local dev DB
npm run db:migrate

# Deploy: just commit + push to AKCD1998/PaaSRTSM-project
# Then in Render dashboard → PaaSRTSM-project → Shell → npm run db:migrate

# Local admin web dev (calls live paasrtsm by default)
cd "C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering\apps\admin-web"
npm install
npm run dev
```

Latest commits on each repo at handoff time:
- `SC-StockDay-Ordering@607eef3` — adds `register-task.ps1`
- `PaaSRTSM-project@f39eb8c` — adds nightly sync log endpoints + migration 024

---

## Open question to answer with the user before coding

The user originally asked: *"build this now, or wait until all branches connected?"* They've now answered: **build it now, with the caveat warning visible**. Confirm scope before sinking time into a big query — they might just want a single `hq_own_qty` cell shown in the existing table, not a whole new view.
