# PDA category and independent round controls

Date: 2026-11-04, Asia/Bangkok. Same SC StockDay PDA project, Site and owner. User requested only workbook category and counting round for this phase.

## Interface

Two separate dropdowns replace the combined task/area/round selector:

- หมวด: เภสัช / สามัญ / ปกติ.
- รอบนับ: รอบ 1 / รอบ 2 / รอบ 3.

Physical area is not a selectable dimension in this interface. The prepared jobs cover the whole branch for each product. Category is a workbook counting workgroup, not a physical floor, fridge or warehouse location. Both controls lock after product lookup and are restored from the saved product/scope when reopening a draft or correcting a record. Review shows category and round before confirmation. Different rounds remain independent observations; their quantities are never added.

## Existing backend contract reused

No backend source, route, schema, authentication, role or stock-source policy changed. The two UI values resolve to one existing server-issued `scopeId`; the count payload builder, API client and immutable outbox are unchanged. The server receipt already freezes the scope's session key, label, whole-branch location/coverage and round in its evidence. This phase does not append a category to a note or invent a scope ID.

`count-choice.mjs` contains explicit category-to-session bindings. Each category uses a separate counting-job session key and rounds 1–3 within that job. Every location key remains `whole-branch`; category is never placed into a physical location key. The caller must provide exactly one registered stocktake scope for the configured session, whole-branch coverage and chosen round. Missing or ambiguous mappings block a new lookup rather than silently using round 1 or the legacy ad-hoc scope.

Loopback fixture bindings are `fixture-001-pharma`, `fixture-001-common`, `fixture-001-normal`. The actual HTTP/PostgreSQL check registered all nine scopes through the existing authenticated web-session/CSRF `POST /api/stock-counts/scopes` API. No production scope was created. Live bindings are intentionally empty until the real active category jobs are approved and registered. Existing deployment/auth/CORS/count-service gates remain in force.

Existing records without a verified category binding retain their original scope. When editing one, the UI shows an unspecified legacy category and the original round, with selectors locked; it does not reclassify old evidence. After saving a legacy correction, a new observation must use an available configured category/round.

The category selector records a chosen counting workgroup. It does not import the supplied Excel rows, alter product-master classification or assert server-side SKU/category membership enforcement. The current mobile product lookup has no authoritative workbook-group membership field. Approved catalog membership/mapping remains a live acceptance requirement; this UI must not be advertised as a verified live catalog category filter.

## Verification

- Three focused mapping tests passed: all nine choices map to distinct registered IDs; missing/ambiguous/physical-location scopes cannot fall back; labels/order do not replace the configured session identity.
- Browser rendering with explicit synthetic reads checked all nine choices, avatar/account behavior, unchanged mobile viewport fit, review/corrections, and actual offline app-shell reopening including the new public mapping module. No HTTP count was submitted in that presentation-only check.
- The existing full StockDay React/PDA/HTTP/PostgreSQL flow passed after registering the fixture jobs. The first real fixture receipt stored category label เภสัช, round 1 and location `whole-branch`. Website readback/cold reload, linked correction, offline immutable retry, expired enrollment recovery, conflict retention and actor-bound drafts passed. SQL readback retained one row for the offline request, zero for the conflicting request and official fixture stock 6.
- A focused actual HTTP/PostgreSQL browser check selected เภสัช / รอบ 2 with a different enrolled counter, saved a real receipt and read both round heads from the web API. Round 1 remained 9 and round 2 remained 6 as separate observations; the selected Full Sync reference stayed 6. An attempt by the round-1 counter to submit round 2 received 409 `INDEPENDENT_COUNTER_REQUIRED` and persisted no event. Selectors were locked and review displayed the chosen category/round.
- Existing backend/React unit suites and prior consultations were reused, not repeated. All data was synthetic; no official inventory write, production/staging deployment or physical Android acceptance occurred. PostgreSQL fixture data used an owned temporary loopback container, not a production store or disk-durability acceptance.

Evidence, current screenshots, source patches and locally prepared assets are delivered as SC-PDA-WORKER-UX-R8. Earlier archives remain unchanged. The hosted preview and old ScProductDev port-8765 page are unchanged; the prior Windows R2/SQLite acceptance does not establish Windows acceptance of this update.
