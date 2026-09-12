# AdaPOS SQL Connection Resilience — Tech Lead Review Packet

Date: 2026-09-12 (Asia/Bangkok)
Status: READY FOR TECH LEAD REVIEW — local-only, uncommitted, unpushed, undeployed

## 1. Executive verdict

Branch 000's 2026-09-10 and 2026-09-12 morning failures occurred before any
central sync run existed. In both windows the local SQL Server Browser emitted
Event ID 8 (`unable to process a client request`) while the Agent was resolving
the named instance `SERVER\SQLEXPRESS`. The SQL engine service remained running.

The machine runs SQL Server Browser `10.50.1600.1` (SQL Server 2008 R2 RTM).
Microsoft KB2526552 documents the same periodic Browser non-response and Event
ID 8 symptom on SQL Server 2008/2008 R2.

The Agent currently makes one 15-second connection attempt and exits. The
candidate adds bounded recovery before any central write: up to three attempts,
with 5-second then 10-second waits, only for transient connection codes.

## 2. Incident evidence

Branch 000 log path:

`\\100.90.166.72\C\Users\Administrator\Desktop\Stockdays\SC-StockDay-Ordering\apps\adapos-sync\logs\`

| Date | Natural 08:20 result | Agent HEAD | Local SQL result | Central run |
|---|---|---|---|---|
| 2026-09-09 | success | `5003414` | connected | present |
| 2026-09-10 | failed | `fb3cbd2` | `ETIMEOUT`, named instance, 15,000 ms | absent |
| 2026-09-10 09:06 | manual success | `fb3cbd2` | connected | present |
| 2026-09-11 | success | `fb3cbd2` | connected | present |
| 2026-09-12 | failed | `fb3cbd2` | `ETIMEOUT`, named instance, 15,000 ms | absent |

The same Agent code both succeeded and failed, including a success between the
two failures. This refutes a deterministic application-release regression.

Windows Application events on branch 000:

- 2026-09-10 08:20:16: six SQLBrowser Event ID 8 records.
- 2026-09-12 08:20:35: four SQLBrowser Event ID 8 records.
- Event binary `46270000` decodes to WinSock 10054 (`WSAECONNRESET`).

The instance uses dynamic TCP port `49800`; TCP 1433 is not listening. A named
instance therefore depends on SQL Server Browser/UDP 1434 to discover the port.
SQL ERRORLOG shows no AdaAcc startup/query activity in either failed 08:20
window, which places the failure before database query execution.

SQL Browser executable:

- Path: `C:\Program Files (x86)\Microsoft SQL Server\90\Shared\sqlbrowser.exe`
- Product version: `10.50.1600.1`
- File version: `2009.0100.1600.01`

Primary references:

- Microsoft KB2526552: https://support.microsoft.com/en-us/servicing/sql/hotfix/kb2526552-fix-sql-server-browser-service-periodically-does-not-respond-to-incoming-requests
- SQL Server Browser and named-instance discovery: https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/sql-server-browser-service-database-engine-and-ssas
- SQL connection timeout troubleshooting: https://learn.microsoft.com/en-us/troubleshoot/sql/database-engine/connect/timeout-expired-error

## 3. Candidate behavior

Files changed:

- `apps/adapos-sync/src/sqlConnection.js` (new)
- `apps/adapos-sync/src/index.js`
- `apps/adapos-sync/tests/sql-connection.test.js` (new)
- `apps/adapos-sync/tests/index-runtime.test.js`
- `apps/adapos-sync/package.json`

Behavior:

- First connection attempt remains immediate.
- Retry only `ETIMEOUT`, `ESOCKET`, or `ECONNCLOSED`.
- Never retry `ELOGIN`, query errors, or configuration errors.
- Maximum three attempts total.
- Wait 5 seconds before attempt 2 and 10 seconds before attempt 3.
- Emit only attempt number/error code/delay; no connection string, username,
  password, token, or SQL payload.
- If all attempts fail, preserve and throw the final original error.
- Retry occurs before `run-start`, data fetch, HTTP POST, cache write, or any
  other central-side effect.
- No environment/config change is required; successful-path behavior is
  unchanged.

## 4. Verification

Commands:

```powershell
cd 'C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering.sql-connect-resilience-2026-09-12\apps\adapos-sync'
node --test tests/sql-connection.test.js tests/index-runtime.test.js
npm test
```

Results:

- Focused connection/runtime: 15/15 passed.
- Full AdaPOS Agent suite: 173/173 passed, 0 failed.
- `git diff --check`: passed (existing Windows LF-to-CRLF warnings only).

The runtime regression proves a first `ETIMEOUT` is retried before the first
central POST and the successfully acquired pool is closed at the end.

## 5. What this does not do

This candidate reduces the chance that a short SQL Browser incident loses the
whole morning run. It does not patch SQL Server and cannot guarantee recovery
if SQL Browser remains unhealthy through all attempts.

The durable infrastructure choices require separate AdaSoft/operator approval:

1. Apply a vendor-approved SQL Server 2008 R2 service pack/cumulative update
   that includes the Browser fix; or
2. Configure a fixed TCP port and point the Agent at that port, bypassing SQL
   Browser.

Hard-coding today's dynamic port without making it static is not acceptable;
the port can change after a SQL Server restart. Automatically restarting the
AdaSoft SQL service or SQL Browser from the Agent is also outside this candidate.

Increasing the 15-second timeout alone is not a root-cause fix.

## 6. Rollout and observation gate

After review: commit/push/PR, require CI, then merge. Branch PCs will receive the
change through the existing self-update path. The first natural morning run must
confirm either a clean first-attempt connection or a retry warning followed by
success. Repeated exhaustion after three attempts escalates the fixed-port or
vendor patch decision.

Today's missing Branch 000 run is separate operational recovery. No manual rerun
or Scheduled Task change was performed by this candidate.

## 7. Mutation declaration

No branch-PC config, service, Scheduled Task, firewall, SQL Server setting,
database, cache, Render service, production environment, commit, push, PR,
merge, or deploy was changed. Only this isolated local worktree was edited.
