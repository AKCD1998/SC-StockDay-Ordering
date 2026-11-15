# Event 010 — Product lookup and unregistered items

**Date:** 15 November 2026
**Source:** User clarification for the SCPDA request product screen
**Status:** UX requested; represented in the local preview only.

## Search existing ADA products

Search by company item code in the `IC-…` format, legacy `630…` code, Thai or English product name, or barcode. Tapping **ตกลง** opens the product picker. Keep the picker search input active and filter choices as the user continues typing. Display product names in Thai, wrap long names and allow each choice row to grow to the wrapped height. Barcode scanning must be a separate full-width action with enough spacing from **ตกลง** to avoid accidental taps. Place a prominent orange **สินค้าใหม่** button beneath the search actions.

## Add a product not yet registered in ADA

1. Tap **สินค้าใหม่**.
2. In the popup, upload or take a product photo and enter the drug trade name.
3. Tap **ยืนยัน**. Show a short loading overlay while looking for a matching ADA product name.
4. If a likely match exists, show the Thai name, item code, barcode, price and stock, then ask whether it is the intended item. If the user confirms the match, reuse that product in the request and discard the proposed new-item photo.
5. If there is no match, or the user says the match is a different product, offer **เพิ่มในคำขอ**. Keep this as an unregistered request line marked for central review; do not create a new ADA master record directly from the branch.
6. An authorized central product-data owner checks for duplicates, creates or maps the permanent ADA product record, then synchronizes its identity to SCPDA. The originating request links to that record before normal receipt/allocation work.

The product selection flow is the same for **พรีออเดอร์** and **สอบถามราคา**; the request mode determines the later lifecycle. The local preview uses sample products and a simulated delay. It does not query ADA or upload/store an image. Real lookup, product-master permissions, attachment handling and cross-system sync remain unimplemented.
