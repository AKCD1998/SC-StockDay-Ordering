# Branch 001 Sales Detail Backfill Status - 2026-07-10

Survey:
- Earliest paid sale bill: 2024-07-01
- Latest paid sale bill: 2026-07-10
- Total paid sale bills: 279,465

Backfill plan:
- Added branch `001` to `apps/adapos-sync/installer/backfill-branch.ps1`
- 75 chunks, newest to oldest, covering 2024-07-01 through 2026-07-10
- Dry run completed successfully for all 75 chunks

Execution status before the 20:50 GMT+7 stop on 2026-07-10:
- Completed through chunk 20: `2025-12-21` to `2025-12-31`
- Last successful chunk sent 4,164 sales headers and 8,083 sales lines
- Chunk 21 failed: `2025-12-11` to `2025-12-20`
- Failure reason: API request timed out after 300000ms posting 3,274 sales headers and 6,094 sales lines

Completion status on 2026-07-12:
- Backfill completed successfully through the full surveyed range: `2024-07-01` to `2026-07-10`
- The previously failing `2025-12-11` to `2025-12-20` window was split into two smaller windows and both posted successfully
- Remaining history was completed with smaller 5-day windows to avoid backend/API timeout pressure
- One transient SQL Server connection timeout occurred at `2024-10-16` to `2024-10-20`; retry succeeded
- Final successful window: `2024-07-01` to `2024-07-05`, posting 1,704 sales headers and 3,090 sales lines

No further branch 001 historical sales-detail backfill is pending from this surveyed range.
