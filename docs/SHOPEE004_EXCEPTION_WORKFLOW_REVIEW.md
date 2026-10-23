# Shopee 004 exception workflow — candidate review

The current durable reservation ledger and its opening cutover remain the source
of truth. This change adds an authenticated administrator view at
`#/shopee004-exceptions` and consumes the additive StockDay bridge contract. It
does not introduce a second reservation account, change quantities, credentials,
flags, SQL readers, scheduled tasks or automations.

## User-visible behavior

- Each exception shows the public product and variation, reason category,
  observed unit, affected-order count, verified evidence and proposed POS
  components. No customer, raw email or order/document number is displayed.
- Proposed matches are never pre-approved. An administrator explicitly selects
  every component of the evidence-backed bundle, positive integer quantity per
  Shopee sale, verified evidence and unit attestation. Multipliers are read-only
  facts from the proposal: a different multiplier requires newly verified unit
  evidence first. A fuzzy/AI proposal without verified evidence cannot be approved.
- Mapping approval is independent from shipment, cancellation and return review.
  This page exposes no lifecycle approval action.
- Rule revocation requires a separate reason, current version and acknowledgement
  that existing holds/history remain. The backend must enforce append-only audit
  and hold fencing; the UI does not manufacture a release operation.
- A revision conflict reads current data while retaining the draft selection,
  but clears the unit attestation so it must be checked again.
- A successful exception list remains visible with its timestamp after a later
  read failure. Mutations are disabled until a current successful read returns.
- An ambiguous POST outcome retains its exact operation ID and payload in the
  open form. No automatic mutation retry occurs. The administrator can explicitly
  resend the same request; pagination and other changes are disabled until its
  outcome resolves. This in-memory draft is not a durable server operation log;
  server idempotency/revision checks remain mandatory after browser closure.
- A configured bridge is required by the API. Explicit fail-closed 503 responses
  show unavailable; other 5xx/transport/invalid POST responses remain ambiguous.
- Recovery state, attempt count and next retry time are displayed from the server.
  This page never starts a worker retry itself. A pending durable rule-recovery job
  is labelled pending rather than presented as zero successfully requeued orders.
- If the bridge omits malformed records, an explicit `unreadableRecords` count
  warns that those entries still need review. Valid records remain actionable
  under their own verified evidence; omitted entries have no approval action and
  an unreadable-only page is not labelled as an empty exception queue.
- Multi-item exceptions identify whether the shown product is the current failed
  item, an original failed item, or only a reference whose role is not established.
  Reference-only items cannot approve mapping even if an upstream applicability
  flag is accidentally true. Item-level unresolved counts and reasons remain
  available in a disclosure without adding text to branch-stock rows.

The branch-stock table keeps its compact number plus information disclosure.
`confirmed`, `reference` and `unverified` displays remain distinct. A cached
`lastConfirmed` value appears only as a labelled, timestamped reference and never
becomes `qtyBranch004`, a current total, or a current export value. Unknown values
are not converted to zero. The export source sheet can hold reference values in
separate labelled columns; qualified 004 exports also include an explicit status
column. Existing known-only Shopee balances remain explicitly incomplete when
unallocated orders exist. The API intentionally gives these known-only balances
`viewStatus:unverified`: the UI retains the known numeric calculation and its
temporary qualification rather than treating every product as a hard unknown.
A missing known-only quantity still remains unknown. Cached reservation and
shipped-unposted quantities are disclosed from `lastConfirmed` with their own
reference time; they never replace current commitments.

## API contract

Uses the existing session cookie, `apiFetch` unauthorized handling and CSRF token.
All reads are bounded to eight seconds and old requests are cancelled on route
change. Provider error details are never rendered.

- `GET /admin/shopee004/stock-exceptions?limit=25&cursor=...`
- `POST /admin/shopee004/stock-exceptions/:exceptionId/mapping`
- `POST /admin/shopee004/stock-rules/:ruleId/revoke`
- `GET /admin/shopee004/stock-reconciliation`

The exception envelope is `shopee004-exceptions-v1`, branch `004`, with `asOf`,
`status`, `records` and cursor pagination. Revision is echoed as opaque data.
Mapping body: `operationId`, `expectedRevision`, `listingId`, `variationId`,
explicit `components`, `evidenceRefs`, `acknowledgeUnitEvidence:true`.
Revocation body: `operationId`, `expectedVersion`, `reason` (a bounded reason code:
`unit_evidence_changed`, `mapping_incorrect` or `listing_changed`, with Thai labels).

Optional record fields `ruleId` and `auditHistory[{action,at,ruleVersion,reason}]`
support review and revocation. Audit data must already be administrator-scoped
and filtered by the bridge. The client validates the additive contract and keeps
existing per-product-review-v2 branch-stock fields compatible.

Unit approvals require selected server-verified `seller_catalog`, `pos_unit` and
quantity evidence (`seller_description`, `owner_unit` or `reviewed_stock_rule`).
The two contextual kinds `source_item` and `retained_contract` can be displayed
but do not confer unit authority, even when timestamped. References must belong
to the current exception response and the complete proposed components. The
source API independently verifies the server-owned evidence registry, scope,
units, exact quantities and aliases; client checkboxes cannot create trusted
evidence. Empty public names or audit reasons remain displayable without hiding
other valid exceptions.

## Stock-count preparation

The read-only reconciliation section displays the preserved cutover, reserved,
shipped-unposted and review counts, and whether physical stock was verified.
Its separate `asOf` timestamp remains visible when a later failed read leaves the
previous reconciliation available as a stale reference.
Before a new stock count is adopted, the operator must reconcile which previous
commitments were included in that count and approve a separate boundary change.
There is no rebaseline or POS-write button, automatic opening adjustment, or
implicit evidence approval on this page.

## Validation and limitations

Synthetic tests cover exact evidence requirements, pack/bundle components,
unverified/fuzzy proposals, unrelated lifecycle holds, duplicate operation
responses, revision conflicts, 401/403/503, ambiguous POST outcomes, stale reads,
pagination, null/reference quantities, exports, administrator navigation and
existing authentication/session behavior. The fixtures contain no production
order/customer data. A Vite production build is checked separately.

Candidate browser verification uses only loopback API/UI with synthetic records;
it does not prove production write permissions, actual approval recovery or a
natural Hourly cycle. Production approval routes are intentionally fail-closed
until the separately reviewed privileged bridge is authorized and configured.

The stock table shows the primary number and an information button. Breakdown
details open in a speech bubble outside the table's layout, on hover, keyboard
focus or click. Only one bubble opens at a time; Escape/outside-click closes it.
The portal avoids clipping by the scrolling table and preserves compact row
heights. Temporary/reference badges remain visible beside qualified quantities.
This presentation change does not alter quantities, exports or backend behavior.

The large source-status card is replaced by a compact, transparent status line.
It keeps the latest Hourly slot and a short Shopee state visible, including
incomplete/review/unavailable warnings and a Full Sync fallback count when needed.
Counts, full timestamps and operational explanations move into the same speech
bubble pattern. Header and row details share the one-open-bubble rule.

## Release and rollback

Review together with the StockDay API bridge and SC producer changes before any
merge/deploy. This candidate adds no migration or environment variable. Preserve
the existing opening, cutover, held quantities and runtime flags.

Rollback is the previous frontend build. Existing reservations and rules remain
on the server; a frontend rollback must never delete a rule, release holds,
reconstruct an opening plan or replay historical email. If a rule itself is wrong,
use the separate versioned revocation workflow and inspect its fenced holds.
