# Branch 004 shared Shopee availability view

This UI depends on the separate PaaS API consumer and SC durable ledger PRs. Deploy the API first. Preparation does not activate the producer or either new feature switch, and does not change current production quantities.

The panel requests `hourly004-shopee`; a disabled API switch keeps the existing Hourly POS-only quantities. Once the backend explicitly enables the view, 004's orange quantity is labelled as availability shared with Shopee. Its POS quantity, reserved bucket, shipped-but-unposted bucket and times remain visible. Other branch quantities and existing scopes keep their behavior. No secret or producer control capability is added to this browser.

Unknown commitments show “รอตรวจ”, not zero or unadjusted available stock. Branch scope totals and Excel exports preserve unknowns. A failed background refresh invalidates previously displayed marketplace availability, while retaining the POS basis for inspection. Requests cannot add a donor snapshot based on unknown 004 availability. Existing replenishment recommendations are not changed by this display PR.

The existing once-per-minute visible-page refresh remains; this does not invoke POS SQL capture or any Sync/Task. The UI displays email ingestion and ledger times and explicitly states its email-only coverage. The upstream POS observation is not asserted to be an atomic/current physical stocktake.

Activation and stop must follow the SC ledger runbook. Pause retains holds and blocks availability. Do not remove a commitment or relabel an unadjusted POS-only quantity to make an issue appear resolved.
