# SCCRM member directory

StockDay `#/members` shows the original Supabase CRM members, including QR and
staff registrations. It uses the existing shared backend and its admin cookie
session: `GET /api/admin/sccrm-members` and
`GET /api/admin/sccrm-members/:id/purchase-history`. Staff/branch accounts do not
receive the directory. No CRM service credentials are included in the browser.

Search accepts name, phone or member code; the directory has 25 members per
page. The final table column opens a member-specific modal. Each receipt shows
its number, branch/POS, Bangkok date/time including seconds, SKU, product name,
unit, quantity, unit price, line total and available refund records. History
loads another 25 bills on demand. Closing or switching members cancels the old
request; expired/denied authorization clears cached member data.

Only bills explicitly linked to a member and confirmed in SCCRMonPOS appear.
An empty history does not mean the customer never purchased. Historical rows
without units display `ไม่ระบุ`; the UI never substitutes a current catalog unit
for the unit actually sold. Legacy totals are labelled separately from stored
POS-header totals. Future unit snapshots require a POS version that sends them
(1.3.3+); older clients retain the existing claim contract.

Verification: full admin-web Vitest suite (139 tests), production build, and
browser inspection of directory/modal with synthetic multi-receipt data.
