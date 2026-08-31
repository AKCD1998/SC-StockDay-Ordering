# Transfer Delta + Content Capture — Pull Request Review Packet

## Status and isolation

- Status: **RELEASE CANDIDATE — AUTHORIZED FOR COMMIT AND PR REVIEW**
- Worktree: `C:\Users\scgro\Desktop\Webapp training project\SC-StockDay-Ordering.transfer-delta-local-2026-08-28`
- Branch: `codex/transfer-delta-local-2026-08-28`
- Candidate baseline: `2432890753a4e506ade9b602dd637c674ce6fe84`
- Intended release state: committed to the candidate branch and submitted by PR; unmerged and undeployed
- Production/config impact: none; no branch environment, schedule, Render setting, or feature flag was changed
- Backend: `PaaSRTSM-project` was inspected read-only and received no candidate edit

## Round-2 blockers and disposition

1. **AdaAcc branch-field proof and Postgres-key impact:** completed with aggregate-only AdaAcc reads from branch 004 and an explicit PostgreSQL `READ ONLY` transaction. The transformer key projection preserves existing keys, but does not expand the current runtime query scope.
2. **Composite line without a matching header:** fixed fail-closed before POST and before Shadow counting/cache write; regression coverage added.
3. **Full chunk acknowledgements:** every Transfer chunk must acknowledge exactly the header/line counts sent; missing, partial, non-integer, or excessive counts fail before Shadow/cache advancement; regression coverage added.
4. **Adversarial Full-vs-Delta:** added a forged-unchanged fingerprint test that changes both header and line content and proves the content comparison reports a mismatch.
5. **Review packet / CLAIM-X-236:** updated to the observed round-2 results below.
6. **Fleet-wide Full-transfer isolation:** fixed after final Tech Lead review. With Transfer Shadow OFF, the Agent keeps the deployed Full payload, `docNo` chunking, and acknowledgement behavior. Composite identity, strict header ownership, and exact acknowledgements activate only when `ADAPOS_DELTA_SHADOW_TRANSFERS=true`.

## Read-only evidence: AdaAcc branch 004

Method and safety boundary:

- Source: the deployed branch-004 Agent configuration, using its configured non-`sa` read/sync SQL identity.
- Operation: aggregate `SELECT` statements only against `TCNTPdtTnfHD` and `TCNTPdtTnfDT`.
- Output intentionally contained only document types, branch mappings, and counts; no document numbers, product codes, payloads, passwords, or customer data were selected.
- No AdaAcc row, schema, login, environment variable, or Agent file was changed.

Observed header relationship:

| docType | headers | `FTBchCode = BchFrm` | `FTBchCode = BchTo` | `BchFrm = BchTo` | `FTBchCode` equals neither |
|---:|---:|---:|---:|---:|---:|
| 2 | 22 | 0 | 0 | 22 | 22 |
| 3 | 9 | 0 | 0 | 9 | 9 |
| 4 | 1,704 | 1,704 | 0 | 0 | 0 |
| 7 | 1,595 | 1,595 | 0 | 0 | 0 |
| 8 | 1,766 | 1,766 | 0 | 0 | 0 |

Interpretation scoped to this branch/database snapshot:

- docType 4/7/8: `FTBchCode` is the source/from branch for every observed row; `FTPthBchTo` is the destination.
- docType 2/3: `FTPthBchFrm` and `FTPthBchTo` are blank on all 31 observed rows while `FTBchCode` is `004`.
- Across 5,096 headers, the old projection based on `FTPthBchFrm` and a projection based on `FTBchCode` each had zero composite collision groups for `(docNo, docType, branch)`.
- Exactly 31/5,096 source rows would change branch-key value if `FTBchCode` replaced the old blank `branchFrm`; they are precisely docType 2/3.
- A raw composite left join found **0 orphan lines out of 53,733** for `(FTBchCode, FTPthDocType, FTPthDocNo)`. The code still fails closed because a future or truncated scan can violate this invariant.

This evidence is fresh proof for AdaAcc branch 004 only. It is not represented as proof for every branch PC/database.

## Approved Slice-1 runtime scope

The aggregate audit above inspected the tables independently of the Agent's runtime predicates. The current Full header and line queries still require:

```sql
FTPthBchFrm = @branchCode OR FTPthBchTo = @branchCode
```

Consequently, branch-004 docType 2/3 rows—with both `FTPthBchFrm` and `FTPthBchTo` blank—are not selected by the current runtime queries. Seeing those 31 headers in the aggregate audit is source-schema/key evidence only; it is not runtime coverage evidence.

Transfer Slice 1 is therefore limited to the unchanged existing Full-query scope, observed on branch 004 as:

```text
docType 4 / 7 / 8
```

The `FTBchCode` fallback remains a transformer capability and a regression-tested defensive rule for rows explicitly supplied to the transformer. It does not make docType 2/3 part of this Slice, does not cause the Agent to fetch them, and does not authorize a query expansion.

Runtime coverage for docType 2/3 is a future, separately authorized scope. It would require an explicit query/ownership decision and its own impact review, tests, and acceptance evidence before any code or configuration change.

## Read-only evidence: configured PaaS PostgreSQL target

Method and safety boundary:

- The configured PostgreSQL target was queried inside `BEGIN TRANSACTION READ ONLY` and ended with `ROLLBACK`.
- The database query's structured result printed only constraints and aggregate counts/payload-key presence; it did not print raw payload values or credentials.
- No backend row, schema, setting, or file was changed.

Observed constraints:

```text
ada.transfer_headers UNIQUE (doc_no, doc_type, branch_code)
ada.transfer_lines   UNIQUE (doc_no, doc_type, branch_code, line_no, product_code)
```

Observed existing state:

- 3,475 headers and 33,500 lines.
- 0 lines lack a header under `(doc_no, doc_type, branch_code)`.
- 3,473/3,475 header raw payloads contain `branchFrm` and no explicit `branchCode`; their stored `branch_code` matches `branchFrm`.
- The remaining 2/3,475 contain explicit `branchCode`; their stored key matches it.
- No stored header contains raw `FTBchCode` because the existing client payload dropped that source field.
- No docType 2 or 3 header exists in the configured PostgreSQL target at the observation time, consistent with the current runtime queries not selecting branch-004 rows whose from/to fields are blank.

## Full payload key decision and impact

The persisted document identity remains the deployed contract:

```text
(branchCode, docType, docNo)
```

The line identity remains:

```text
(branchCode, docType, docNo, lineNo, productCode)
```

When Transfer Shadow is explicitly enabled, the candidate derives the payload `branchCode` as:

```text
first non-blank of (FTPthBchFrm, FTBchCode)
```

This order is deliberate:

- A non-blank `FTPthBchFrm` preserves the exact semantic branch key used by existing Full payloads/Postgres rows, even on a future branch where `FTBchCode` might differ.
- `FTBchCode` is used only when `FTPthBchFrm` is blank. This makes such an explicitly supplied row representable inside the transformer, but current runtime queries do not supply branch-004 docType 2/3 rows. The fallback is capability, not Slice-1 coverage.
- On observed docType 4/7/8, both values are equal, so the resulting key is unchanged.
- No cleanup/delete/backfill of existing PostgreSQL rows is part of this candidate.

The line is matched to a source header first (using `FTBchCode` when present), then receives the header's persistence branch projection. Header, line, chunk, fingerprint, and Full projection therefore share the same tuple.

When Transfer Shadow is OFF, `toTransferPayload` and document chunking keep the deployed Full-transfer body and `docNo` grouping. They do not add line `docType`/`branchCode`, do not add header `branchCode`, and do not run the new composite validation. A wiring regression test captures the outbound body and locks this isolation behavior.

## Fail-closed orphan handling

Transfer ingestion is header-owned while Transfer Shadow is enabled; there is no line-only mode in that acceptance path.

- `toTransferPayload` refuses a line whose composite source identity has no matching header.
- It also refuses sparse identity unless exactly one header identity can be inferred.
- Transfer calls to `chunkPayloadByDoc` enable `requireMatchingHeaders`; this independently verifies that every transformed line tuple exists among transformed headers.
- Because `scanTransferDocuments` uses `toTransferPayload`, Shadow cannot count an orphan line or write a cache for it.
- The error contains only the identity-field names, not the document number or product content.

Regression tests prove both transformer/chunker failure and that an orphan attempt creates no Transfer cache file.

## Exact Full-chunk acknowledgement gate

When Transfer Shadow is enabled, every Full Transfer chunk accepts either response-name pair already supported by the client:

```text
acceptedHeaders / acceptedLines
headersAccepted / linesAccepted
```

Both values must be safe integers and must exactly equal `chunk.headers.length` and `chunk.lines.length`. The aggregate accepted totals must also exactly equal the source header/line counts. Any missing, partial, excessive, or non-integer acknowledgement throws before:

- adding the chunk to accepted totals,
- reporting Transfer success,
- invoking Transfer Shadow,
- writing or advancing the Transfer cache.

Round-2 tests cover a correct first chunk followed by a partial second chunk, plus a missing `acceptedLines` acknowledgement; each leaves an existing cache byte-for-byte unchanged.

When Transfer Shadow is OFF, the Agent retains the deployed acknowledgement fallback behavior. This avoids changing Full-transfer behavior on branches that are not participating in the Transfer acceptance window.

## Shadow flow

```text
AdaAcc HD/DT rows
  (unchanged Full query scope; branch 004 observed type 4/7/8 only)
  -> Transfer flag OFF: deployed Full payload/chunk/ack path; stop
  -> Transfer flag ON:
       Full transformer validates header-owned composite identity
       strict composite chunking
       authoritative Full POST(s)
       exact acknowledgement check for every chunk and aggregate totals
       only after all checks pass:
         Transfer fingerprint classification
         optional Transfer-only Content Capture comparison
         atomic local Transfer cache write
```

Flags remain default OFF:

```env
ADAPOS_DELTA_SHADOW_TRANSFERS=false
ADAPOS_DELTA_SHADOW_TRANSFER_CONTENT_CAPTURE_BRANCHES=
```

Shadow remains observational: it makes no write API call, emits no deletion/tombstone, and a Shadow-only error cannot change the already-completed Full result.

## Automated tests and observed results

Focused round-2 Transfer run:

```powershell
cd apps/adapos-sync
node --test tests/delta-transfer-shadow.test.js tests/delta-transfer-shadow-wiring.test.js tests/queries.test.js
```

Observed: **26/26 passed**.

Full Agent regression suite:

```powershell
cd apps/adapos-sync
npm test
```

Observed: **165 tests, 165 passed, 0 failed**. Coverage includes the six round-2 regressions plus final flag-isolation assertions:

- persistence key keeps `branchFrm` and falls back to `FTBchCode` only when blank,
- complete orphan composite fails in transformer/chunker,
- orphan cannot be counted/cached by Shadow,
- partial acknowledgement on a later chunk blocks cache advancement,
- missing acknowledgement blocks cache advancement,
- adversarial forged-unchanged fingerprint is caught by Full-vs-Delta content comparison.
- flag OFF preserves the deployed Full-transfer payload and tolerates the deployed missing-ack fallback without invoking Shadow,
- flag ON sends composite identity and invokes Shadow only after acknowledged Full success.

The adversarial test changes both `FCPthGrand` and `FCPtdQty`, injects a scanner that falsely returns the baseline fingerprint for both scans, and observes `unchangedCount=1`, `mismatchCount=1`, `matchedCount=0`. The result contains neither the raw document number nor product code.

Additional observed checks:

- `git diff --check`: pass; Windows emitted only expected LF-to-CRLF notices.
- Candidate was based on current `origin/main` with no baseline drift before commit.
- Transfer shadow default is false and the Transfer Content Capture allowlist is empty.

## Files changed

Client/runtime:

- `apps/adapos-sync/src/queries.js`
- `apps/adapos-sync/src/transform.js`
- `apps/adapos-sync/src/config.js`
- `apps/adapos-sync/src/index.js`
- `apps/adapos-sync/src/delta/transferFingerprint.js`
- `apps/adapos-sync/src/delta/transferShadow.js`
- `apps/adapos-sync/src/delta/transferShadowCache.js`
- `apps/adapos-sync/src/delta/transferShadowProjection.js`
- `apps/adapos-sync/.env.example`
- `apps/adapos-sync/package.json`

Tests:

- `apps/adapos-sync/tests/queries.test.js`
- `apps/adapos-sync/tests/delta-transfer-shadow.test.js`
- `apps/adapos-sync/tests/delta-transfer-shadow-wiring.test.js`

Review artifacts:

- `TRANSFER_DELTA_LOCAL_REVIEW_PACKET.md`

The authoritative append-only Codex ledger remains outside the Git repository and is not part of the PR.

Backend files changed: **none**.

## Known risks and limits

1. Fresh AdaAcc relationship evidence is branch-004-only. The branch-first key projection removes semantic migration risk for any existing non-blank `branchFrm`, but other branches were not queried in this round.
2. Composite Full payload identity and exact acknowledgement enforcement are gated by default-OFF Transfer Shadow. Branches left OFF retain the deployed Full path. On an enabled branch, the transformer can handle an explicitly supplied blank-`branchFrm` row through `FTBchCode`; branch-004 docType 2/3 remains outside runtime coverage and outside Slice 1.
3. On an enabled branch, if a backend ever returns a partial acknowledgement after committing a partial chunk, the Agent stops and preserves the old Shadow cache; remediation of that authoritative partial write remains a backend/operations concern and is not hidden as Delta success.
4. Transfer Content Capture stores canonicalized Transfer content locally only for explicitly allowlisted branches. Retention, access, and graduation rules still require an operational decision before enablement.
5. `disappearedCount` is metrics-only. This candidate never interprets absence as deletion.
6. The existing dependency tree reported 18 audit findings during preparation; none was introduced or remediated here.

## Security note requiring owner action

Before the encoded read-only query was run, an overly broad repository text search echoed the configured `DATABASE_URL` line from the local PaaS `.env` into this session's tool transcript. The secret is not copied into this packet, candidate code, test output, or ledger, and it was not used for a write. This session did not rotate it because credential management was not authorized. The credential owner should rotate that PostgreSQL credential before further use and update its approved secret stores.

## Not done / still prohibited

- Approved Receipts Delta/Content Capture
- backend code or schema changes
- production or branch-PC execution/configuration changes
- Transfer Shadow or Content Capture enablement on any branch
- runtime query expansion or Transfer coverage for docType 2/3
- merge, deploy, migration, release, or production enablement
- Transfer acceptance-window graduation decision

## Tech Lead round-2 review points

1. Approved Slice 1 remains the existing Full-query scope, observed as docType 4/7/8 on branch 004.
2. The backward-compatible transformer projection is non-blank `branchFrm`, otherwise `FTBchCode`; the fallback is not runtime coverage for type 2/3.
3. Fail-closed header ownership and exact per-chunk/aggregate acknowledgement are accepted gates.
4. docType 2/3 query coverage requires a separate future authorization and review.
5. Future Content Capture scope/retention and any dormant-code release remain separate decisions.

The Tech Lead round-2 verdict and final fleet-isolation correction are recorded here. Commit, push, and PR creation were authorized on 2026-08-31; this packet does not authorize merge, deployment, configuration changes, or production enablement.
