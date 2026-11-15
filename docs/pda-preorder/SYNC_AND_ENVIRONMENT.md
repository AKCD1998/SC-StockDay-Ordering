# Common-ledger synchronization and Cloud reuse

## What can be reused

Keep the same repositories, code commits, environment configuration and accepted contracts. A branched chat may inherit conversation context, but the platform decides its attached Cloud computer. The current tools do not let the PDA owner create/fork a user chat or bind another chat to a selected executor.

- If the new chat has the same machine/files, inspect and reuse the existing clean preorder worktree. Do not reinstall packages or reconfigure credentials without a real need.
- If it has another executor, inspect its selected environment, existing checkout and configured connections, then recover the exact source through Git and this ledger. Do not ask the user to re-explain the whole project or paste secrets. Missing private media/artifacts may need retrieval through the original chat; they are not all mirrored into GitHub.
- A configured environment is not a saved live desktop/browser/database state. Check readiness and actual access. Never copy a `.env`, token, cookie, enrollment/private-install file or database to simulate reuse.
- Do not reuse an old `environment_id` as if it selects a machine. Use the status of the environment actually attached to the new chat.

## Read before working

Canonical remote ref: `refs/heads/coord/pda-preorder-ledger` in `AKCD1998/SC-StockDay-Ordering`.

From an existing matching checkout, a safe read-only update is:

```sh
git fetch origin coord/pda-preorder-ledger
git show FETCH_HEAD:docs/pda-preorder/STATE.md
git show FETCH_HEAD:docs/pda-preorder/CONTRACT.md
git show FETCH_HEAD:docs/pda-preorder/owners/PREORDER.md
git show FETCH_HEAD:docs/pda-preorder/owners/PDA.md
```

These commands do not switch/reset the engineering branch. If using the connected Git provider instead, request the exact coordination ref. Do not assume `main` contains this documentation.

## Write after significant progress

On the original executor the dedicated docs worktree is `/workspace/reviews/pda-preorder-common-ledger/`. Reuse it only after checking HEAD/status and ensuring another writer is not actively editing it. On separate executors, use an isolated docs checkout/worktree tracking the same canonical ref.

1. Fetch the latest canonical branch. Check dirty files and remote/local differences before editing.
2. Edit only your own `owners/PDA.md` or `owners/PREORDER.md`. Add a uniquely named event file. Update shared STATE/CONTRACT only when their facts actually change.
3. Record the distinction between planned / implemented / tested / fixture / blocked. Include source SHAs, evidence links and the next concrete dependency. Do not mark a sent handoff as received without the destination's actual admission.
4. Review the exact documentation diff, commit and push **only** `coord/pda-preorder-ledger`.
5. If push is rejected, fetch and merge the peer's ledger update, resolve a real overlap without erasing their record, then retry. Never force-push. Stop and report a conflict you cannot resolve from evidence.

Do not share one mutable working tree for simultaneous engineering changes. Separate owner files and append-only event files reduce ledger collisions; Git still requires synchronization. There is no automatic watcher/daemon/schedule in this design, and no cross-chat wake-up is claimed.

## Event shape

Each event should state ID/date/timezone, actual author/workstream, affected area, source/base SHAs, changed decisions/contracts, completed work, evidence/check results with environment scope, pending/denied/uncertain gates and next owner/action. Do not include secrets or private customer documents. New events supersede errors in older records; do not rewrite history to make an earlier assumption appear correct.

## Lifetime and boundaries

The coordination branch stays independent from PDA code and PR #100 so it survives feature-branch changes. It does not need a production deploy or a new service. Any future relocation requires a recorded replacement canonical URL and both readers updated first. The ledger is not part of application auth and grants no new permissions.
