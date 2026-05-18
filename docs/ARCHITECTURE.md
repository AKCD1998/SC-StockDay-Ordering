# Architecture

## V1 scope

- Branch staff submit order requests into this app only
- No direct writes to adaPOS
- Sync service reads `AdaAcc` on the mother PC using read-only credentials
- Admin dashboard compares branch requests against synced product, stock, sales, and purchase summaries
- Use global stock first for V1
- No branch-level stock reconstruction yet
- No AI forecasting
- No automatic purchase-order submission

## Apps

### `apps/order-web`

- Simple React app for branch staff
- Search product by code, barcode, or name
- Enter qty, unit, and note
- Submit order request

### `apps/admin-web`

- Simple React dashboard for management
- Review latest order requests
- View stock-day cards and product summaries
- Show clear status labels:
  - `Reorder soon`
  - `Normal`
  - `Overstock / slow moving`
  - `No sales`

### `server`

- Express API
- Mock repository for local scaffold mode
- Planned PostgreSQL repository later
- Sync ingestion endpoints for product/sales/purchase snapshots

### `apps/adapos-sync`

- Runs independently on the mother PC later
- Pulls from `AdaAcc` using configurable interval
- Normalizes qty using `qty * stock_factor`
- Calls our own API endpoints
- Never writes to adaPOS

## Core formulas

- `Average Daily Usage = sold_qty_period / period_days`
- `Stock Day = current_stock / average_daily_usage`
- `Ending Stock = starting_stock + purchased_qty - sold_qty`
- `Average Inventory = (starting_stock + ending_stock) / 2`
- `Turnover Rate = sold_qty / average_inventory`

## V1 status guidance

- `Reorder soon`: stock at/below min stock, or stock day below lead-time-aware threshold
- `Normal`: stock day and stock quantity in a healthy range
- `Overstock / slow moving`: no sales or very high stock day, or stock above max stock

## Confirmed adaPOS source tables

- Product master: `TCNMPdt`
- Sales: `TPSTSalHD`, `TPSTSalDT`
- Purchase/order-in: `TACTPiHD`, `TACTPiDT`

## Known exclusions

- `TCNTPdtReqHD/DT`: not used
- `TACTPoHD/DT`: not used
- `TCNMPdtBar`: empty
- `TCNMRateUnit`: currency rounding only
