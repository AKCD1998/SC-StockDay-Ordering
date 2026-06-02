---
name: branch005 loyalty evidence collection prompt
description: "Read-only, branch005-first operator prompt for collecting the remaining live AdaPos/AdaAcc evidence needed to design a mobile CRM loyalty system without disrupting cashier flow."
type: project
originSessionId: codex
---

# Branch005 Evidence-Collection Prompt for SCCRMMVP Loyalty MVP

## Purpose

Use this prompt on the Branch 005 laptop when we need fresh, read-only evidence to finish the design of a mobile CRM loyalty app that:

- accumulates and redeems points
- supports promotions
- tracks who bought what, when, and at which branch as close to real time as possible
- supports returns, cancellations, and exchanges
- requires no window switching in the AdaPos cashier flow
- feeds `SCCRMMVP` and the shared backend instead of relying on AdaSoft loyalty features

This prompt is intentionally branch005-first. It assumes the repo already proves:

- AdaSoft loyalty is effectively dead and not a usable CRM base
- branches are offline-first and sync manually
- central `AdaAcc` is the aggregated truth source, but Branch 005 is still the best place to observe live cashier and return behavior
- `SCCRMMVP` is already shaped as a backend-driven mobile loyalty client, not a direct `AdaAcc` client

## Read Before Running

Ask the operator to read these files in this workspace first:

- `docs/adasoft/project_adapos_branch005_workstation.md`
- `docs/adasoft/project_adapos_nb005_laptop_recon.md`
- `docs/adasoft/project_adapos_nb005_final_scan.md`
- `docs/adasoft/project_sccrmonpos.md`
- `docs/adasoft/CODEX-CONTEXT.md`

These documents already establish the branch topology, known machine roles, current loyalty dead-end, and likely companion-app direction. The live investigation should focus only on evidence that is still missing or not yet proven.

## Operator Prompt

```text
You are running on Branch 005's laptop in a live AdaSoft environment. Your job is to gather decisive, read-only evidence for designing a new mobile CRM loyalty system that sits on top of AdaSoft POS without disrupting cashier flow.

Mission:
Find every essential piece of evidence needed to design a mobile loyalty app that can:
1. identify the customer during checkout without forcing staff to switch away from AdaPos
2. track exactly who bought what, when, where, and for how much
3. award points and apply promotions server-side
4. handle returns, voids, cancellations, and exchanges correctly so points can be reversed or adjusted
5. work with Branch 005 first, while clearly marking what must later be verified on central/HQ

Hard constraints:
- READ ONLY only
- Do not edit configs, registry, services, SQL data, scheduled tasks, or app files
- Do not stop/restart AdaSoft services
- Do not run UPDATE/INSERT/DELETE/EXEC against AdaAcc
- Do not expose secrets in the final write-up; redact passwords/tokens
- Prefer SQL SELECTs, passive file/config inspection, process/window observation, logs, and copied exports

Known context you should assume as true unless contradicted by local evidence:
- AdaSoft loyalty is not a reliable CRM foundation
- Branches are offline-first with local SQL Server
- Branch 005 uses local POSSRV\SQLEXPRESS
- Central aggregated AdaAcc exists, but branch sync is manual and laggy
- AdaPos runs as AdaPosFront.exe and AdaPosBack.exe
- Connection info may be recoverable from AdaTools\AdaIni.ada
- The target mobile app is external to AdaSoft; we are not trying to extend AdaSoft's dead loyalty subsystem

Primary questions to answer with evidence:

A. Cashier flow and zero-window-switch integration
- How can a cashier identify a member during checkout without leaving AdaPosFront?
- Is there any existing field, scan box, customer lookup, barcode input, hotkey, side panel, peripheral hook, or idle state that could accept a member code, phone, QR, or barcode?
- Can staff complete a normal sale without customer identity, then attach identity immediately before finalizing?
- Is there any practical place for a companion scanner, keyboard wedge, HID input, local tray helper, or background listener to feed customer identity into the flow without changing the AdaPos window?

B. Sales transaction evidence
- Which tables and columns represent:
  - sale header
  - sale lines
  - payment/tender
  - branch code
  - cashier/user
  - terminal/device
  - timestamps
  - receipt/document numbers
  - customer/member references if any
  - void/cancel flags
- Confirm the real join keys between header and lines.
- Provide 5-10 recent sample rows with sensitive values redacted only where necessary.
- Determine whether transactions are written immediately on completion or staged first and approved later.

C. Return / cancellation / exchange workflow
- Determine exactly how AdaSoft records:
  - full return
  - partial return
  - void before payment
  - void after payment
  - exchange if supported
  - refund tender method
- Identify the exact tables, document types, status flags, and link fields connecting a return to the original sale.
- Determine whether returns preserve original line item detail and quantities.
- Confirm whether negative sales lines, separate return documents, or adjustment documents are used.
- Capture enough evidence to define how a loyalty ledger should reverse points safely.

D. Customer identity possibilities
- Find whether AdaAcc has any customer linkage in live sales tables today.
- Check if customer phone, customer code, card ID, or tax/VAT buyer identity ever appears in sales docs.
- Determine whether Branch 005 actually captures customer identity only for VAT invoices, only for some tenders, or never during normal sales.
- Check whether Thai ID reader integration or other peripherals can be leveraged for identity capture.

E. Real-time or near-real-time capture path
- Determine the earliest stable point at which an external system can know a sale happened.
- Compare these possibilities:
  1. direct read from local branch SQL after commit
  2. log/file export detection
  3. central aggregated SQL after FTP sync
  4. companion helper on branch machine observing newly committed docs
- State expected latency and reliability for each.
- Explicitly call out which approach is good enough for "points feel instant to customer".

F. Promotions and points design inputs
- Gather evidence needed to compute promotions externally:
  - gross/net totals
  - line quantities
  - product code/barcode
  - branch
  - date/time
  - cashier
  - tender mix
  - lot/expiry if relevant
  - discount fields
  - promo/manual discount flags
- Identify any existing AdaSoft fields that would conflict with external loyalty promotions.
- Determine whether an external system can safely treat AdaSoft sales as immutable events plus later correction events.

G. Branch005 technical integration evidence
- Confirm how this laptop reaches POSSRV and SQL Server.
- Locate non-secret evidence of connection path in:
  - AdaIni.ada
  - config files
  - ODBC/OLEDB references
  - app binaries/strings
  - logs
- Identify machine roles:
  - cashier terminal
  - back-office laptop
  - POS server
  - printer server
- Clarify whether this laptop itself sees live POS writes, or only back-office data after the fact.

H. SCCRMMVP / backend fit
- Based on evidence, recommend the minimum event model needed for the new backend:
  - sale completed
  - sale line item
  - sale voided
  - return completed
  - points earned
  - points reversed
  - manual adjustment
- Do not design the full app yet; only infer what evidence proves these events are implementable.

Required outputs:
1. A concise executive summary
2. A "Known with evidence" section
3. A "Still unknown / must verify on central or cashier PC" section
4. A proposed source-of-truth table map:
   - sales headers
   - sales lines
   - returns
   - payments
   - customer references
   - users/cashiers
   - branches
5. A return-handling truth table:
   - user action
   - AdaSoft record shape
   - loyalty consequence
6. A recommended capture architecture for v1:
   - branch-local read model vs central read model
   - expected latency
   - confidence
7. An appendix with the exact read-only SQL queries and file paths used

Minimum investigation steps:
1. Inspect local repo/context for prior AdaSoft findings
2. Inspect machine/process layout to confirm whether AdaPosFront/AdaPosBack are present and running
3. Inspect passive config sources for SQL host/instance/database clues
4. Enumerate candidate AdaAcc sales/return/customer tables with SELECT-only schema discovery
5. Pull recent sample documents for:
   - normal sale
   - void/cancel if found
   - return if found
   - VAT/customer-linked sale if found
6. Trace document relationships and status fields
7. Determine whether a companion loyalty system should read from local branch SQL or rely on central
8. Produce the final evidence report with concrete table/column names and sample queries

Important:
If you cannot prove something from local evidence, say "not proven" and list the exact next machine to inspect:
- Branch 005 cashier PC
- Branch 005 POSSRV
- central SQL server
- HQ workflow/operator
```

## Acceptance Criteria

Accept the branch-laptop agent's output only if it includes:

- exact `AdaAcc` table and column names for sales and returns, not guesses
- a proven description of how returns are recorded
- a proven recommendation for the earliest reliable loyalty-capture point
- a clear answer on whether zero-window-switch member identification is possible, and by what mechanism
- a list of what Branch 005 cannot prove locally and must be verified elsewhere

## Default Assumptions

- scope is Branch 005 first
- evidence collection is read-only safe only
- the new CRM and loyalty system is external to AdaSoft loyalty
- `SCCRMMVP` remains a backend-driven mobile client
- the likely v1 architecture should favor branch-local transaction capture over waiting for delayed central FTP sync, unless branch evidence disproves that

## Why This Prompt Exists

The repo already proves a lot about AdaSoft architecture, but it does not yet prove the exact live cashier, return, and identity-capture behaviors that matter most for a zero-window-switch loyalty experience. This prompt narrows the next expedition to the evidence that directly decides whether `SCCRMonPOS`-style branch capture is enough for v1, or whether more central/HQ verification is required before committing to the CRM event model.
