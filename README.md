# SC-StockDay-Ordering

Internal pharmacy stock-ordering scaffold for replacing manual Excel-based branch ordering with:

- a branch ordering web app
- an admin stock-day dashboard
- a read-only adaPOS sync service intended to run on the mother PC

For branch laptop data transmitter installation, use:

- [apps/adapos-sync/installer/BRANCH-INSTALL.md](apps/adapos-sync/installer/BRANCH-INSTALL.md)
- [docs/MOTHER_PC_SETUP.md](docs/MOTHER_PC_SETUP.md)

This repository supports two server data modes:

- `DATA_MODE=mock` for scaffold/demo mode with in-memory sample data
- `DATA_MODE=postgres` for real PostgreSQL persistence in the app database

It still does not require direct access to the live `AdaAcc` database during development.

## Structure

```text
apps/
  admin-web/      React dashboard for boss/admin
  order-web/      React branch ordering page
  adapos-sync/    Node sync service for mother PC
server/           Express API + mock repository + PostgreSQL schema
docs/             Architecture and deployment notes
```

## Local prerequisites

- Node.js 18+
- npm 9+
- PostgreSQL only if you want to wire the real app database later

## Quick start

### 1. Copy environment templates

```powershell
Copy-Item .env.example .env
Copy-Item server\.env.example server\.env
Copy-Item apps\admin-web\.env.example apps\admin-web\.env
Copy-Item apps\order-web\.env.example apps\order-web\.env
Copy-Item apps\adapos-sync\.env.example apps\adapos-sync\.env
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Pick a server data mode

For mock mode, set in `server\.env`:

```env
DATA_MODE=mock
```

For PostgreSQL mode, set in `server\.env`:

```env
DATA_MODE=postgres
DATABASE_URL=postgres://postgres:postgres@localhost:5432/sc_stockday_ordering
```

If your local PostgreSQL listens on a different port, update `DATABASE_URL` accordingly. On this machine the service is configured on `5433`.

### 4. Mock mode run

```powershell
npm run dev
```

### 5. PostgreSQL mode run

Create the database first if needed:

```powershell
createdb sc_stockday_ordering
```

Run migrations:

```powershell
npm run db:migrate
```

Seed sample branches/products/summaries/order requests:

```powershell
npm run db:seed
```

Then start the stack:

```powershell
npm run dev
```

### 6. Optional: run the sync service in dry-run mode

```powershell
npm run dev:sync
```

## Local URLs

- Order web: [http://localhost:5174](http://localhost:5174)
- Admin web: [http://localhost:5173](http://localhost:5173)
- API server: [http://localhost:4000](http://localhost:4000)

## Current behavior

### Mock mode

- API uses an in-memory repository
- order requests persist only during the current server process
- stock-day dashboard uses seeded mock synced data

### PostgreSQL mode

- API uses the PostgreSQL repository
- order requests persist in `branch_order_requests` and `branch_order_request_items`
- stock-day dashboard reads from `products`, `product_sales_summary`, and `product_purchase_summary`
- sync ingestion endpoints store incoming payloads in PostgreSQL

## PostgreSQL schema

The initial database schema is in:

- [server/db/migrations/001_init.sql](/C:/Users/scgro/Desktop/Webapp%20training%20project/SC-StockDay-Ordering/server/db/migrations/001_init.sql)

The schema includes:

- `branches`
- `products`
- `product_stock_snapshots`
- `product_sales_summary`
- `product_purchase_summary`
- `branch_order_requests`
- `branch_order_request_items`
- `sync_runs`
- `sync_errors`
- `staff_accounts`

Useful commands:

```powershell
npm run db:migrate
npm run db:seed
```

## Verification checklist

With `DATA_MODE=postgres`:

1. `npm run db:migrate`
2. `npm run db:seed`
3. `npm run dev`
4. Open [http://localhost:5174](http://localhost:5174) and submit an order request
5. Open [http://localhost:5173](http://localhost:5173) and confirm:
   - the new request appears
   - stock-day rows load from PostgreSQL
6. Confirm [http://localhost:4000/health](http://localhost:4000/health) returns `"mode":"postgres"`

With `DATA_MODE=mock`:

1. set `DATA_MODE=mock`
2. run `npm run dev`
3. confirm [http://localhost:4000/health](http://localhost:4000/health) returns `"mode":"mock"`

## adaPOS sync deployment note

The live `AdaAcc` SQL Server is not assumed to be reachable from this development machine.

The sync service in `apps/adapos-sync` is designed to run later on the mother PC where adaPOS is installed. For now it uses:

- `.env`-driven SQL Server settings
- dry-run mode by default
- placeholder SQL query modules based on confirmed table/field names

See:

- [docs/ARCHITECTURE.md](/C:/Users/scgro/Desktop/Webapp%20training%20project/SC-StockDay-Ordering/docs/ARCHITECTURE.md)
- [docs/MOTHER_PC_SETUP.md](/C:/Users/scgro/Desktop/Webapp%20training%20project/SC-StockDay-Ordering/docs/MOTHER_PC_SETUP.md)

## Notes

- PostgreSQL mode does not touch adaPOS directly
- authentication is still intentionally not implemented
- sync service remains read-only and independent for later mother-PC deployment
