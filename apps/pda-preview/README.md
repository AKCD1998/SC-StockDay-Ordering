# SC StockDay PDA preview

Interactive Thai mobile/desktop prototype. Synthetic data only. Does not call the live backend or create real staff accounts. PINs and mock sync are browser demonstrations, not real authentication or server acceptance.

Run from repository root:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory apps/pda-preview
```

Open `http://localhost:4173`. Accounts: staff01 `1111`, staff02 `2222`, lead03 `3333` (branch 004).

Try: login -> sample scan -> enter lots and dates (or explicitly unknown) -> check complete -> save. For a HID scanner, pair in OS settings, select English keyboard, set Enter/CR suffix, focus scan input. Test actual hardware before rollout.

Use Settings for offline simulation, account switching, JSON export and explicit reset. History allows mock sync. Pending events do not replace selected stock. Simultaneous offline counts preserve revision conflicts. Source scenarios demonstrate count expiry, hourly failure, Full Sync fallback and unknown stock. Data persists in this browser only; clearing site data deletes it.

Run policy and outbox tests:

```sh
node --test apps/pda-preview/tests/domain.test.mjs
```

See [implementation design](../../docs/PDA_STOCK_COUNT_DESIGN_2026-10-31.md) for verified source findings, existing native-app decisions, server-side auth, lot/date semantics, source-policy limits and rollout.
