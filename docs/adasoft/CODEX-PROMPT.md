# Codex Starting Prompt — SC Group System

Paste this at the start of any Codex/Copilot session before asking it to build anything.

---

## PASTE THIS INTO CODEX:

Before you write any code, read these two files in this workspace:
- `docs/adasoft/VISION.md` — full system vision, architecture, and constraints
- `docs/adasoft/CODEX-CONTEXT.md` — AdaAcc database schema and expedition findings

Here is a summary so you can start immediately:

---

I am building an operational platform for SC Group, a Thai pharmacy chain with 6 branches
(000=HQ, 001–005) running Adasoft AdaPos HyperMart 4.0 POS/ERP.

**We are NOT replacing AdaPos. We build on top of it. AdaAcc database is READ-ONLY always.**

There are five components that form one system:

1. **PaaSRTSM-project** — Node.js/Express + PostgreSQL on Render. The central nervous system.
   Unified backend API for CRM (loyalty points, tiers, campaigns), stock transfer reconciliation,
   audit trail, analytics, and branch ordering. Everything talks to this.

2. **SCCRMonPOS** — C# .NET 4.8 Windows tray app on each branch's POSSRV machine. Sensor and
   transport bridge. Watches AdaAcc (SQL Server) for new sales, calculates points, pushes events
   to PaaSRTSM API. Has offline queue. Also reads transfer docs to flag unprocessed inbound
   receipts. NEVER writes to AdaAcc.

3. **Rx1011** — Specialized operational workflow module. NOT obsolete. Contains mature proven
   operational philosophy: lot-aware inventory truth, expiry-aware workflows, send/receive
   confirmation, audit-first corrections, branch accountability, discrepancy-conscious workflows.
   Evolves into a specialized module connected to PaaSRTSM. Its philosophy must heavily influence
   all reconciliation UX and audit architecture we build.

4. **SC-StockDay** — Reconciliation engine (in this repo + PaaSRTSM backend). Records operational
   truth AdaPos cannot: actual received qty, discrepancy qty, lot mismatch, damaged goods,
   approval chain, transfer event history. Does NOT replace AdaPos stock/accounting.

5. **SCCRMMVP** — React Native (Expo) mobile app. Customer mode: points/tiers/history.
   Staff mode: lookup, add/redeem points, register members. Talks only to PaaSRTSM API.

**Core operational philosophy:**
- Corrections are EVENTS, not overwrites
- Preserve original events and timelines
- Record discrepancies with reasons
- "Minimum staff effort, maximum operational truth"
- Thai-first UX, max 3 taps for any staff action

**The two pain points being solved:**

PAIN 1 — Transfer reconciliation: 2,835 of 3,091 inbound stock receipts (91.7%) were never
processed into AdaPos. Staff patch phantom stock manually with 1,632 adjustment docs — no link
to original transfers. FCPthQtyRcv field does not exist in AdaAcc — it architecturally cannot
record received ≠ dispatched. We record actual received quantities and discrepancies in
PostgreSQL without touching AdaAcc.

PAIN 2 — CRM/Loyalty: AdaPos loyalty system has been dead since 2020 (33 rows total, ever).
WCF sync broken since March 2026. We build a real loyalty system that reads sales from AdaAcc
and awards points in our PostgreSQL.

**Key AdaAcc facts:**
- Central server: 192.168.100.124 over WAN (internet-hosted, not local LAN)
- TPSTSalHD = 429,054 sales | TCNMCst = 1,305 customers | TCNMPdt = 6,663 products
- Point formula: 1 point per 100 baht (FCShdGndAmt / 100)
- Only count paid sales: FTShdStaPaid = '1'
- Transfer inbound docs: FTPthDocType = '7', unprocessed = FTPthStaPrcDoc != '1'
- Lot/expiry tracking in every sale line: TPSTSalDT.FTSdtLotNo / FDSdtExpired
- Sync lag: branches sync manually, central may be 1-8 days behind
- Two backup DBs (9GB each) remain ONLINE simultaneously with live AdaAcc

**Hard rules:**
- NEVER write to AdaAcc
- NEVER copy TCNMCst.FTCstPin to our database (it is plaintext in AdaAcc)
- Always show "as of [sync timestamp]" on AdaAcc-sourced data
- All staff UI must work in Thai language, max 3 taps for any action
- PaaSRTSM API requires JWT auth on all endpoints
- Corrections are events not overwrites — never silently fix stock numbers
- Do not treat Rx1011 as obsolete — its operational philosophy is proven and must be preserved

Now help me build: [YOUR SPECIFIC REQUEST HERE]
