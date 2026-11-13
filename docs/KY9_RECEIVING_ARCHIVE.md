# KY9 receiving archive in StockDay

The existing เอกสาร ขย.9 admin page now includes a cross-month draft search.
It reads the shared backend's private KY9 archive, separate from stock balances.
Search supports product/name, lot, invoice and receipt/transfer references, branch
and actual receiving date. Result quantities use the original reviewed display;
raw pack quantity and already-converted base quantity remain separate.

The detail view retains source filename/SHA, full original row, exceptions and
version manifest. Proposed branch lots remain proposals. Missing batch dates
stay missing. Month-only date precision is displayed without manufacturing a day.

ส่งต่อ ขย.10/11 (JSON) exports all rows matching the applied filters, not only the
visible page. A changed but unapplied filter disables export. The export is
receiving/lot evidence, not sales or buyer allocation, and does not change any
stock, case, period coverage or pharmacist-signature status.

The archive is under the existing admin boundary and shared authenticated API.
No private source/business data is bundled into frontend assets. API errors do
not display zero/empty results as if the month had no receipts. Old responses
cannot overwrite a later search/detail selection.

Validation: focused archive/register/navigation tests plus production Vite build.
Backend schema, import guards and endpoint contract are documented in
PaaSRTSM-project/docs/ky9-documents/RECEIVING_ARCHIVE.md.
