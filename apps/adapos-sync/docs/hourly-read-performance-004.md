# Branch 004 Hourly reader performance candidate

The 2026-10-21 11:00 B50 pilot accepted all 50 distinct products but reported
2,521 ms inside `readHourlyDerivedStock`. This exceeds the existing 2,000 ms
review point. Source and receiver were stopped; no larger cohort is enabled.
The pilot recorded total read duration, not per-batch CPU/compile/elapsed times,
so that historical delay cannot be assigned to compilation, execution, network
or host load from the retained total alone.

The original movement query joins a product-per-arm CTE to the master table
inside a scope referenced by 16 movement views in a single UNION query. This
candidate submits each of the 16 aggregates as its own SELECT within the same
request. Each scope uses the same parameterized `FTPdtCode IN (...)` predicate
as the master reads. There are still three requests (identity, first sample,
second sample); only the movement result sets change from one combined set
to sixteen ordered component sets. Missing/mislabeled/extra sets fail closed.
SQL Server can compile each SELECT independently without optimizing one large
UNION over all expanded vendor views. SQL Server does not promise
materialization of a CTE; see [Microsoft's CTE guidance](https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql).
Reduced optimization complexity is a hypothesis until measured on SERVER004.

Scope is consumed only through `EXISTS`; multiple products sharing a stock
code and aliases preserve existential membership. Active-product filtering,
all 16 component aggregates, PR68 transfer branch filtering including missing
identities, both opening/closing bookends, two full samples, timeout handling
and derived suppression are unchanged. No canonical Full Sync, transfer Delta,
transport, credential, configuration, task, isolation or vendor schema changes
are part of this patch.

## Required local acceptance before activation or scale

- Keep Hourly OFF, the original B50 cohort, and all 11 intraday tasks disabled.
- Use the existing readonly SQL login on SERVER004 in a quiet period, not a
  manually invoked Full Sync or stock posting operation.
- Capture metadata/first-sample/second-sample duration, own-session CPU/reads,
  local host CPU and SQL parse/compile/execute statistics where available.
  `SET STATISTICS TIME` is confined to the test connection; do not clear plans,
  force hints, warm the reader, create source objects or change DB options.
- Run at most three candidate B50 observations and one installed-baseline
  observation, with at least 30 seconds between starts. Stop adding reads on
  a completed read above 2,000 ms, a 3,000 ms reader deadline, CPU >= 70%,
  existing Agent activity, or the 15-minute Full Sync exclusion window.
- Compare candidate and baseline in RAM only when all observed input sets are
  identical, normalizing all 16 component sets before comparison with the
  installed combined set. Changed inputs are non-comparable, not a mismatch or
  a successful data validation. Persist aggregates only.
- Require three candidate observations within the unchanged timing/CPU guards,
  50/50 completeness and 50/50 observed-input comparison before calling this
  candidate validated. A slow baseline remains a failed baseline and stops
  additional reads; it never becomes a passing timing result.

Local fixtures cannot establish SQL load on SERVER004. Passing this test also
does not establish committed posting, NOLOCK atomicity/ABA safety, clock sync
or business freshness, and does not activate or authorize a larger cohort.
