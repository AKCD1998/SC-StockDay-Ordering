# 19 November — branch004 front and Shopee physical count groups

User clarified the two teams and their physical layout: front sales area plus a
middle/front-team warehouse; Shopee at the back. They normally count separately.
Shopee can urgently pick from that front warehouse directly into an order's
packing. Cross-branch001/003/005 supply uses transfer files; this internal004 handoff
does not. Requested separate login: **01004SHPEE**, with shared branch004 stock.

[Concrete design and current-state findings](../BRANCH004_COUNT_AREAS.md): separate
actor, count scope, physical location and commitment state.01004 covers front plus
front store;01004SHPEE covers the Shopee area. Packed/unshipped goods stay in branch
totals, linked to their order. Internal handoff conserves branch total. Scope,
time/unit completeness and movement coverage qualify a combined physical total;
independent counts/rounds are not added blindly. A front-only count must not
replace004's branch total. Existing unscoped observations remain unscoped.

Read-only runtime:01004 present,004 enabled,01004 count admission enabled; current
published release R16. No004 pairing/login/count evidence found.01004SHPEE absent.
The existing live Shopee commitment bridge is enabled and metadata reports partial
coverage and unposted-in-POS policy with an accepted-estimate opening. Reuse that
single ledger and reconcile which shipments a new physical baseline already
includes to prevent double deductions; no reset or new reservation authority.

This checkpoint records the confirmed workflow and proposed implementation. No
new account, permission, migration, APK build, release, stock/Ada write, internal
movement or shipment was performed. R17 daily QR/Drive work is preserved; company
Google Cloud project exists, but its ID/client/runtime grant remains pending.
