# Env Var Collision Audit

Values are intentionally omitted. This report lists env names only.

## Tooling Availability

- `dotenv-linter`: not found
- `gitleaks`: not found
- `trufflehog`: not found

## Repos Scanned

| Repo | Prefix | Path |
|---|---|---|
| `SC-StockDay-Ordering` | `SC_STOCKDAY_ORDERING` | `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering` |

## Tracked Env Files

- None detected.

## Tracked Env Templates

- `SC-StockDay-Ordering` tracks template `.env.example`
- `SC-StockDay-Ordering` tracks template `apps/adapos-sync/.env.example`
- `SC-StockDay-Ordering` tracks template `apps/admin-web/.env.example`
- `SC-StockDay-Ordering` tracks template `apps/ocr-worker/.env.example`
- `SC-StockDay-Ordering` tracks template `apps/order-web/.env.example`
- `SC-StockDay-Ordering` tracks template `server/.env.example`

## Duplicate Keys Inside Env Files

- None detected.

## Duplicate Names Across Repos

- None detected.

## Sample Occurrences

## Recommended Follow-Up

- Rename P0/P1 backend secrets to project-scoped names before sharing one runtime.
- For one frontend app calling multiple modules, replace generic API prefix vars with `VITE_<PROJECT>_API_PREFIX`.
- Run `dotenv-linter` on `.env*` files when available.
- Run `gitleaks` or `trufflehog` before committing or deploying.
- Update code, workflows, env examples, deployment docs, and Render/GitHub variables together.
