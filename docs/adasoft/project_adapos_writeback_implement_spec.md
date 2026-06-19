---
name: AdaPos transfer write-back implementation spec
description: Implementation spec for safely creating real AdaPos Type 4 and Type 7 transfer documents from the SC-StockDay / PaaSRTSM stock-request workflow using a branch-local writer agent with strict guardrails.
type: project
originSessionId: codex-2026-06-19
---

## Project identity
This document specifies how SC-StockDay / PaaSRTSM can create **real AdaPos inter-branch transfer documents**
without violating the core safety rule that historic AdaPos documents must never be edited or deleted.

Target outcome:
- A staff user works in the web app.
- The central backend records the operational workflow.
- A **branch-local writer agent** on `POSSRV` creates the real AdaPos document.
- The system verifies what was created and stores a permanent audit trail.

This is a **write-back subsystem**, separate from the existing read-only sync subsystem.

---

## 1. Current facts that constrain the design

### 1.1 Proven architecture facts
- Each branch has its own local SQL Server: `POSSRV\SQLEXPRESS`.
- There is **no live branch-to-central SQL connection**.
- Central AdaAcc is an aggregated read model, not the source of immediate branch truth.
- Existing `adapos-sync` is a **read-only** agent that posts data up to PaaSRTSM.
- Current stock-request workflow writes only to PaaSRTSM PostgreSQL, not AdaPos.

Relevant evidence:
- `docs/adasoft/CODEX-CONTEXT.md`
- `docs/adasoft/VISION.md`
- `apps/adapos-sync/src/index.js`
- `apps/admin-api/src/services/stockRequests.js`

### 1.2 Safety facts
- Historic AdaPos transfer docs must be treated as immutable from the web platform.
- The current project explicitly assumes `AdaAcc` is read-only.
- If write-back is introduced, it must be fenced into a dedicated subsystem with narrower credentials, narrower code paths, and explicit confirmation.

### 1.3 Functional facts
- The existing stock-request flow already models:
  - request
  - response
  - acknowledge
  - dispatch
  - receive
  - printable response summary / packing slip
- The backend already knows branch-scoped identity and can produce structured payloads per request.

---

## 2. Decision

### 2.1 Chosen architecture
**Use a branch-local writer agent on each POSSRV machine.**

The web app and central backend must **not** write directly to local AdaAcc.

Instead:
1. Web UI confirms a stock request outcome.
2. PaaSRTSM creates a write job in PostgreSQL.
3. The writer agent on the relevant branch claims the job.
4. The agent validates, writes, verifies, and reports back.
5. Existing read-only sync and/or local reread confirms the created AdaPos document.

### 2.2 Rejected architectures
- **Direct cloud write into AdaAcc**
  - Rejected: wrong network model, high blast radius, poor auditability.
- **Writing PostgreSQL mirror tables and treating them as AdaPos**
  - Rejected: AdaPos will never see them.
- **Editing or deleting existing AdaPos transfer docs**
  - Rejected: too dangerous, violates guardrails.
- **RPA-only / AutoHotkey-only automation**
  - Rejected for primary path: too brittle. Keep only as emergency fallback if DB/proc path proves impossible.

---

## 3. Safety model

This subsystem must obey the following non-negotiable rules.

### 3.1 Immutable history rule
- No `UPDATE` to old AdaPos transfer documents.
- No `DELETE` of AdaPos transfer documents.
- No "edit existing transfer" capability in UI, API, or agent.
- Corrections happen only by **new compensating documents** or manual AdaPos work outside this subsystem.

### 3.2 Create-only rule
The subsystem may only:
- validate a planned document
- create a new Type 4 or Type 7 document
- read back the created result
- record audit and verification metadata

It may not:
- reopen old docs
- cancel old docs
- overwrite lines on old docs
- backfill arbitrary historical records

### 3.3 Positive allowlist rule
The writer agent may only call:
- approved local SQL stored procedures, or
- approved insert path for exactly the transfer document tables needed

Everything else is forbidden.

### 3.4 Least-privilege credentials
Use a **dedicated write credential** separate from the read-only sync account.

Preferred:
- one branch-local writer credential per branch
- rights limited to specific transfer-related stored procedures or tables
- no `sa`
- no broad DDL permissions
- no rights to unrelated modules

### 3.5 Human confirmation rule
Creating a real AdaPos document requires:
- preview
- explicit confirmation
- display of branch, document type, line count, and destination/source before submit

No silent background creation from a casual click.

### 3.6 Idempotency rule
Every create action must carry a stable idempotency key.

Recommended key:
- `request_public_id + branch_code + action_type + version`

If the same job is replayed, the system must return the same outcome instead of creating a duplicate document.

---

## 4. Subsystem boundaries

### 4.1 Existing read-only subsystem
Purpose:
- read AdaAcc
- sync products, transfers, receipts, stock, sales to PaaSRTSM

Files:
- `apps/adapos-sync/src/index.js`
- `apps/adapos-sync/src/queries.js`
- `apps/adapos-sync/src/transform.js`

This remains read-only.

### 4.2 New write-back subsystem
Purpose:
- create brand-new AdaPos Type 4 / Type 7 documents from approved stock-request flows

Suggested component name:
- `adapos-write-agent`

Suggested location:
- same repo family as `apps/adapos-sync`, but separate app/folder and separate env file

Reason:
- keep read-only and write-back code physically separate
- keep credentials separate
- keep review surface small

---

## 5. Write-back scope

### 5.1 In scope for v1
- Type 4 outbound transfer creation at the **source branch**
- Type 7 inbound receipt creation at the **requesting branch**
- local verification that the created doc exists
- central audit trail
- replay-safe job handling

### 5.2 Out of scope for v1
- editing old AdaPos documents
- deleting old AdaPos documents
- arbitrary transfer creation unrelated to an approved stock request
- stock adjustment automation
- financial reversal automation
- generic write access to AdaAcc

---

## 6. Mapping from stock-request flow to AdaPos write jobs

### 6.1 Operational workflow stays in PaaSRTSM
The existing request workflow remains the business truth layer:
- `SUBMITTED`
- `RESPONDED`
- `ACKNOWLEDGED`
- `DISPATCHED`
- `RECEIVED`

### 6.2 AdaPos write state must be separate
Do **not** overload the existing request status with AdaPos write success.

Add separate fields:
- `pos_outbound_status`
- `pos_inbound_status`

Recommended values:
- `NOT_REQUIRED`
- `PENDING_CONFIRMATION`
- `QUEUED`
- `CLAIMED`
- `WRITTEN`
- `VERIFIED`
- `FAILED_RETRYABLE`
- `FAILED_FINAL`
- `CANCELLED`

Reason:
- a request can be operationally acknowledged while AdaPos doc creation is still pending
- verification may happen after write

### 6.3 Job creation triggers
- After source branch confirms dispatch intent:
  - create outbound Type 4 write job
- After destination branch confirms receive into AdaPos:
  - create inbound Type 7 write job

Alternative stricter v1:
- only implement Type 4 first
- keep Type 7 manual until pilot stabilizes

That is the safer rollout.

---

## 7. Central PostgreSQL schema additions

All proposed tables belong in `PaaSRTSM-project`.

### 7.1 `ordering.stock_request_pos_jobs`
Purpose:
- central durable queue of requested AdaPos writes

Suggested columns:
- `job_id BIGSERIAL PRIMARY KEY`
- `request_id BIGINT NOT NULL REFERENCES ordering.stock_requests(request_id)`
- `batch_id BIGINT NULL REFERENCES ordering.stock_request_batches(batch_id)`
- `job_public_id TEXT UNIQUE NOT NULL`
- `job_type TEXT NOT NULL`
  - `ADAPOS_TYPE4_OUTBOUND`
  - `ADAPOS_TYPE7_INBOUND`
- `target_branch_code TEXT NOT NULL`
- `source_branch_code TEXT NULL`
- `destination_branch_code TEXT NULL`
- `status TEXT NOT NULL`
- `idempotency_key TEXT NOT NULL`
- `requested_by TEXT NOT NULL`
- `requested_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `confirmed_by TEXT NULL`
- `confirmed_at TIMESTAMPTZ NULL`
- `claimed_by_agent TEXT NULL`
- `claimed_at TIMESTAMPTZ NULL`
- `payload_json JSONB NOT NULL`
- `result_json JSONB NULL`
- `error_code TEXT NULL`
- `error_message TEXT NULL`
- `retry_count INTEGER NOT NULL DEFAULT 0`
- `last_retry_at TIMESTAMPTZ NULL`
- `verified_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `idempotency_key`
- check on `status`
- check on `job_type`

### 7.2 `ordering.stock_request_pos_job_attempts`
Purpose:
- append-only attempt history

Suggested columns:
- `attempt_id BIGSERIAL PRIMARY KEY`
- `job_id BIGINT NOT NULL REFERENCES ordering.stock_request_pos_jobs(job_id) ON DELETE CASCADE`
- `agent_id TEXT NOT NULL`
- `attempt_no INTEGER NOT NULL`
- `started_at TIMESTAMPTZ NOT NULL`
- `finished_at TIMESTAMPTZ NULL`
- `outcome TEXT NOT NULL`
- `error_code TEXT NULL`
- `error_message TEXT NULL`
- `request_payload_json JSONB NULL`
- `response_payload_json JSONB NULL`

### 7.3 `ordering.stock_request_pos_documents`
Purpose:
- immutable record of the AdaPos documents created by this subsystem

Suggested columns:
- `pos_document_id BIGSERIAL PRIMARY KEY`
- `job_id BIGINT NOT NULL REFERENCES ordering.stock_request_pos_jobs(job_id)`
- `request_id BIGINT NOT NULL REFERENCES ordering.stock_requests(request_id)`
- `branch_code TEXT NOT NULL`
- `doc_no TEXT NOT NULL`
- `doc_type TEXT NOT NULL`
- `reference_doc_no TEXT NULL`
- `reference_doc_type TEXT NULL`
- `created_in_adapos_at TIMESTAMPTZ NULL`
- `verified_source TEXT NOT NULL`
  - `LOCAL_DB_READ`
  - `READONLY_SYNC_ECHO`
  - `MANUAL_CONFIRM`
- `verified_payload_json JSONB NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints:
- unique on `(branch_code, doc_no, doc_type)`

### 7.4 Add columns on `ordering.stock_requests`
- `pos_outbound_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'`
- `pos_inbound_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED'`
- `pos_outbound_job_id BIGINT NULL`
- `pos_inbound_job_id BIGINT NULL`
- `pos_outbound_doc_no TEXT NULL`
- `pos_inbound_doc_no TEXT NULL`

Keep these as references for UI convenience; the full truth remains in the job tables.

---

## 8. API design

### 8.1 Staff-facing API

#### `POST /api/stock-requests/:publicId/pos-outbound/prepare`
Purpose:
- validate business eligibility
- build preview payload
- do not create AdaPos document yet

Returns:
- proposed branch
- line items
- warehouse/source/destination mapping
- warnings
- generated idempotency key

#### `POST /api/stock-requests/:publicId/pos-outbound/confirm`
Purpose:
- create central queue job
- mark `pos_outbound_status = QUEUED`

Body:
- `version`
- `confirmationNote`
- optional explicit warehouse overrides if UI supports them

#### `GET /api/stock-requests/:publicId/pos-outbound/status`
Purpose:
- poll job status

#### `POST /api/stock-requests/:publicId/pos-inbound/prepare`
Same structure for Type 7.

#### `POST /api/stock-requests/:publicId/pos-inbound/confirm`
Same structure for Type 7.

### 8.2 Internal writer-agent API

These endpoints are not for browser users.

#### `POST /internal/adapos-write/jobs/claim`
Input:
- `agentId`
- `branchCode`
- `supportedJobTypes`

Behavior:
- claim the oldest eligible queued job for that branch
- atomically move `QUEUED -> CLAIMED`

#### `POST /internal/adapos-write/jobs/:jobPublicId/heartbeat`
Purpose:
- prove liveness during long-running write

#### `POST /internal/adapos-write/jobs/:jobPublicId/complete`
Body:
- local doc metadata
- verification data
- local timestamps
- procedure path used

Behavior:
- store result
- set `WRITTEN` or `VERIFIED`

#### `POST /internal/adapos-write/jobs/:jobPublicId/fail`
Body:
- `retryable`
- `errorCode`
- `errorMessage`
- diagnostic metadata

Behavior:
- mark `FAILED_RETRYABLE` or `FAILED_FINAL`

### 8.3 Auth for internal agent
Do not reuse browser auth.

Use:
- per-branch static token initially, or
- mutual TLS later if needed

Minimum:
- token bound to branch
- branch mismatch rejects claim

---

## 9. Writer agent design

### 9.1 Process model
The writer agent runs on branch `POSSRV`.

Loop:
1. authenticate to central
2. claim one job for its branch
3. validate payload
4. acquire local write lock
5. perform local write
6. verify local result
7. report complete/fail
8. sleep and repeat

### 9.2 Local configuration
New env/config, separate from read-only sync:
- `ADAPOS_WRITE_BRANCH_CODE`
- `ADAPOS_WRITE_SQLSERVER_HOST`
- `ADAPOS_WRITE_SQLSERVER_DATABASE`
- `ADAPOS_WRITE_SQLSERVER_USER`
- `ADAPOS_WRITE_SQLSERVER_PASSWORD`
- `ADAPOS_WRITE_API_BASE_URL`
- `ADAPOS_WRITE_SHARED_TOKEN`
- `ADAPOS_WRITE_AGENT_ID`

### 9.3 Local locking
Only one active write per branch agent at a time for v1.

Reason:
- easier to reason about doc numbering and proc behavior
- lower blast radius during pilot

### 9.4 Local audit spool
The agent must also write a local append-only spool file:
- claimed job
- payload hash
- start time
- finish time
- local exception if any

Reason:
- if network breaks after local write, branch can still recover what happened

---

## 10. Write strategy

### 10.1 Preferred strategy: vendor-compatible stored procedure path
Best case:
- call the same stored procedure path AdaPos uses for transfer processing
- let AdaPos handle stock, process flags, references, and related side effects

Known clue:
- `STP_DOCxTCNTPdtTnfDT4` is documented as transfer processing for Types 4/7/8

This is the preferred path if signature and prerequisites can be proven safely.

### 10.2 Fallback strategy: direct table insert path
Only use if proc path cannot be operationalized.

Requirements before using:
- exact header table
- exact detail table
- exact doc number generation rule
- exact required fields
- exact post-insert processing sequence
- exact status/log side effects

This path is riskier and should be treated as second-best.

### 10.3 Last-resort fallback: guided RPA
Only if DB/proc integration proves impossible.

Not recommended as the primary path.

---

## 11. Local write algorithm

### 11.1 Common preconditions
Before any local write:
- job is `CLAIMED`
- target branch matches agent branch
- request state is still eligible
- no previously recorded `pos_document` exists for the same idempotency key
- all required mappings exist

### 11.2 Type 4 outbound algorithm
1. read local mapping config
2. validate products exist locally
3. validate source and destination branches
4. validate warehouse codes
5. create candidate doc number or obtain one through proc
6. write Type 4 header + lines or invoke proc
7. verify created header exists locally
8. verify line count and quantities match requested payload
9. report success with `doc_no`, `doc_type=4`

### 11.3 Type 7 inbound algorithm
1. validate corresponding outbound reference exists if required by AdaPos rules
2. validate receiving warehouse
3. create candidate Type 7 payload
4. write header + lines or invoke proc
5. verify local existence
6. report success with `doc_no`, `doc_type=7`

### 11.4 Retry behavior
Retry only on:
- network failure to central after local non-write
- temporary SQL connectivity failure before local write
- explicit retryable proc failure

Do not retry blindly if:
- doc may already have been created
- branch mapping is wrong
- duplicate business key detected

In ambiguous cases:
- switch to `FAILED_FINAL`
- require human review

---

## 12. Verification model

Write success is not enough.

### 12.1 Immediate local verification
The writer agent must reread local AdaAcc and confirm:
- header exists
- branch and doc type match
- line count matches
- quantities match

### 12.2 Secondary verification
Later, existing read-only sync may confirm the same doc appears in mirrored transfer data.

This secondary verification is valuable but not required to unblock the first success state.

### 12.3 Final states
- `WRITTEN`: local creation reported
- `VERIFIED`: local reread or sync echo confirmed

---

## 13. UI changes

### 13.1 Source branch UI
After request is acknowledged:
- show `เตรียมออกเอกสารจ่ายโอนใน AdaPos`
- show preview modal
- confirm button text must be explicit:
  - `ยืนยันสร้างเอกสารจ่ายโอน Type 4 ใน AdaPos`

### 13.2 Destination branch UI
When goods are ready to be received into AdaPos:
- show `เตรียมออกเอกสารรับโอนใน AdaPos`
- show Type 7 preview

### 13.3 Status display
Per request, display:
- operational status
- AdaPos outbound status
- AdaPos inbound status
- created doc numbers if available

### 13.4 No edit affordance
Do not show:
- edit AdaPos document
- delete AdaPos document
- retry with modified historical payload

Only allow:
- create new pending job
- view result
- retry same job if retry-safe

---

## 14. Guardrails against touching old documents

This is the direct answer to the main safety concern.

### 14.1 Guardrail set
- No API route for update/delete of AdaPos docs
- No agent command for update/delete
- No SQL credential with delete privileges
- No job type that targets an existing `doc_no`
- If a referenced `doc_no` already exists locally and is not the expected idempotent replay target, hard fail
- Every successful creation writes a permanent central record in `stock_request_pos_documents`
- Every attempt writes append-only attempt history

### 14.2 Recovery policy
If a user made a business mistake:
- do not modify the old document via this subsystem
- either:
  - create a compensating document, or
  - resolve manually in AdaPos outside the subsystem

This must be a documented operating policy, not just code behavior.

---

## 15. Rollout plan

### Phase 0 — Evidence closure
Before implementation:
- decode exact Type 4 / Type 7 local table/proc path
- capture required fields and sequence
- prove how doc numbers are generated
- prove how references between outbound and inbound docs are stored

Output:
- one branch pilot write notebook
- one golden sample payload for Type 4
- one golden sample payload for Type 7

### Phase 1 — Shadow mode
Implement:
- queue tables
- preview endpoints
- internal claim/complete/fail endpoints
- writer agent with `validate-only` mode

No real AdaAcc writes yet.

### Phase 2 — Type 4 pilot only
Implement real local write for:
- one branch pair
- one outbound document type only

Verify:
- doc created
- no duplicate docs
- audit complete

### Phase 3 — Type 7 pilot
Implement inbound creation after outbound path is stable.

### Phase 4 — Broader rollout
- more branch pairs
- monitoring dashboard
- support playbook

---

## 16. Monitoring and operations

Minimum operational visibility:
- queued jobs count by branch
- failed jobs count by branch
- last successful write time by branch
- local agent heartbeat age
- jobs stuck in `CLAIMED`

Suggested admin views:
- `AdaPos write queue`
- `AdaPos write failures`
- `AdaPos write documents`
- `Jobs awaiting manual review`

---

## 17. Required code work by repo

### 17.1 `PaaSRTSM-project`
Add:
- migrations for queue/job/doc tables
- staff-facing write-job API
- internal agent API
- status plumbing on stock-request detail endpoints
- audit events for prepare / confirm / claim / complete / fail / verify

Likely files:
- `apps/admin-api/src/routes/stock-requests.js`
- `apps/admin-api/src/services/stockRequests.js`
- new migration files under `migrations/`

### 17.2 `SC-StockDay-Ordering`
Add:
- UI preview + confirm flow
- status surfaces in request detail
- operator warnings and doc references

Likely files:
- `apps/admin-web/src/App.jsx`
- `apps/admin-web/src/styles.css`

### 17.3 New writer agent
Create new app:
- suggested path: `apps/adapos-write-agent/`

Modules:
- `config.js`
- `db.js`
- `claimClient.js`
- `writer.js`
- `verify.js`
- `index.js`
- `localAudit.js`

Do not merge this into `apps/adapos-sync` in v1.

---

## 18. Open technical questions

These must be resolved before real write mode.

1. What exact local tables/procs does AdaPosBack use for Type 4 and Type 7 creation?
2. Is `STP_DOCxTCNTPdtTnfDT4` enough, or only one part of the sequence?
3. How is `TSBCHYY-######` generated?
4. Which fields are mandatory besides branch/doc type/date/user/warehouse?
5. How are line units and conversion factors validated?
6. Must outbound and inbound docs carry reference doc numbers?
7. Does AdaSky export these locally created docs automatically?
8. What local locking is needed to avoid doc-number collisions with human AdaPos use?
9. Can a narrow SQL login execute the required proc path, or does AdaPos depend on broader rights?

---

## 19. Feasibility verdict

### Yes, feasible
This is technically feasible **if and only if**:
- write-back is branch-local
- it is implemented as a separate subsystem
- old documents remain immutable
- local write path is proven on a pilot branch first

### Not feasible as a quick web-only feature
This is not a safe "just add one button" task.

It is a cross-system integration involving:
- central workflow state
- branch-local execution
- legacy AdaPos internals
- safety and audit requirements

### Recommended starting point
Implement:
1. central queue schema
2. preview/confirm API
3. writer agent in validate-only mode
4. Type 4 pilot on one branch pair

That is the smallest path that can become real.

