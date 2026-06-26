---
name: AdaPos movement + transaction follow-up — 2026-06-26
description: "Afternoon follow-up note for evolving the existing admin movement page from summary-only product movement into a combined movement summary and transaction ledger view, starting with Branch 005."
type: project
originSessionId: codex
---

# AdaPos Movement + Transaction Follow-up — 2026-06-26

## Context

- Current working branch for live validation: `005`
- Access context: cashier PC / environment that can reach Branch `005` database
- Existing admin page already has a `movement-trace` view in `apps/admin-web`
- Current `movement-trace` is **summary-oriented**
  - transfer in
  - transfer out
  - supplier receipt
  - sales summary
- Current limitation: sales data is treated as aggregate summary, not bill-level transaction trace

## Decision From This Session

We should **continue from the existing movement page**, but evolve it from:

- `Product Movement Trace`

into a broader page such as:

- `Movement & Transactions`

This should remain **one page with shared filters**, but split into separate views/tabs rather than forcing everything into one table.

## Product Direction

Recommended structure:

1. `Summary`
   - product-level movement totals by date range
   - transfer in / transfer out / supplier receipt / sales / returns
   - KPI cards and top movers

2. `Transactions`
   - document-level or line-level event ledger
   - must show exact transaction references where possible
   - intended to answer:
     - transfer document no.
     - sale receipt no.
     - customer return document / return bill no.

3. `Document Drilldown`
   - click a document number to open full detail
   - show header + item lines + branch/warehouse references

## Required Transaction Types

Target normalized movement/event types:

- `transfer_out`
- `transfer_in`
- `supplier_receipt`
- `sale_receipt`
- `sale_return`

Optional later:

- `void`
- `cancel`
- `adjustment`

## UI Notes

Shared filters at top:

- branch
- warehouse
- date from
- date to
- movement type
- product search
- document number search

Suggested tabs:

- `Summary`
- `Transactions`
- `Documents`

Important UX rule:

- do **not** mix stock summary and transaction ledger into one overloaded table
- keep summary for quick reading
- keep transactions for audit / tracing

## Initial Scope For Afternoon Work

Start with Branch `005` only and prove the pattern there first.

### Phase 1

- inspect current `movement-trace` implementation in `apps/admin-web`
- identify current backend endpoint shape for `/api/admin/product-movement-trace`
- confirm what data sources can supply:
  - transfer docs
  - sale receipts
  - return receipts

### Phase 2

- define a normalized backend event schema
- add a transaction-focused response shape separate from summary totals
- preserve existing summary behavior so the current page does not regress

### Phase 3

- refactor frontend page into tabbed views:
  - summary
  - transactions
  - document detail

## Open Questions To Resolve Later

- Which exact AdaPos tables hold bill-level sale receipt rows for Branch `005` in the live path?
- Which exact tables represent customer returns in this branch workflow?
- Whether sale returns should be shown as a separate movement type or as negative sales in summary mode
- Whether transaction rows should be grouped by document by default or shown as raw item lines

## Working Conclusion

This feature should be treated as:

- **an upgrade of the existing movement page**

not:

- a completely separate page

But the upgrade must change the page architecture from **summary-only** to **summary + transaction ledger** with explicit view separation.
