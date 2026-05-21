# Adasoft Reverse Engineering Progress

Documentation-only tracking board for the Adasoft reverse-engineering expedition.

- Baseline source: previous Claude audit findings, cross-referenced memory files, plus confirmed observations listed below
- Scope rule: do not modify Adasoft production files, configs, databases, IIS settings, or running services
- Working assumption: unknown details stay marked as `unknown` until backed by evidence
- Calibration note: the mother-PC audit covered the loyalty sync layer well, but not the Adasoft core POS/business stack

## Overall Progress

Overall: 12% [██░░░░░░░░░░░░░░░░░░] 12/100

- Current estimate: `12%`
- Target: `100%`
- Remaining unknown: `88%`
- Audit mode: `documentation only`
- Cross-check summary: roughly `65%` of the loyalty sync layer is understood, but that layer appears to represent only about `15%` of the overall Adasoft ecosystem

## Investigation Areas

### 1. Executable discovery

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `In progress`
- Evidence found: `unknown`
- Important files/folders: `C:\Program Files\Adasoft`, `unknown`
- Next action: inventory EXE, DLL, service, and scheduled-task entry points without changing them
- Risk level: `Medium`
- Notes: build a read-only map of executable names, install folders, and launch relationships

### 2. Architecture understanding

Progress: 12% [██░░░░░░░░░░░░░░░░░░]

- Current understanding %: `12%`
- Status: `Partially understood`
- Evidence found: mother-PC audit confirms the loyalty sync/gateway layer, but not the core POS/business stack
- Important files/folders: `C:\Program Files\Adasoft`, `D:\Adasoft\AdaPos4.0HpmFhn\`, `AdaCustomer.edmx`, `StoreProcedures.rar`, `AdaWebAbreast`, `AdaWebReport`
- Next action: draw component map from binaries, configs, DB objects, and web modules
- Risk level: `High`
- Notes: prior `40%` estimate was too high because it overweighted the portion visible from the hub machine

### 3. Workflow understanding

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `In progress`
- Evidence found: `รับส่งข้อมูล` exists as an operational concept, but exact trigger chain is still unknown
- Important files/folders: `unknown`
- Next action: trace one end-to-end business workflow from cashier action to DB write to sync/report outcome
- Risk level: `High`
- Notes: avoid changing live state while tracing workflow behavior

### 4. Database understanding

Progress: 10% [██░░░░░░░░░░░░░░░░░░]

- Current understanding %: `10%`
- Status: `Partially understood`
- Evidence found: `AdaAcc` database is active
- Important files/folders: live SQL Server `AdaAcc` database, MDF/NDF locations `unknown`
- Next action: list schema with read-only queries and map core functional table groups
- Risk level: `High`
- Notes: the live DB has not yet been queried directly in this audit baseline

### 5. Business-process understanding

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `In progress`
- Evidence found: loyalty and transfer/reconciliation gaps already suggest business-process-specific behavior
- Important files/folders: `unknown`
- Next action: map sales, loyalty, coupon, stock adjustment, sync, and reconciliation processes separately
- Risk level: `High`
- Notes: keep business rules separate from technical implementation notes

### 6. POS cashier software

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `Not started`
- Evidence found: AdaPOS active folders are considered dangerous-to-touch
- Important files/folders: `D:\Adasoft\AdaPos4.0HpmFhn\`, AdaPos active folders
- Next action: audit one cashier terminal in read-only mode and capture executable/config/runtime layout
- Risk level: `High`
- Notes: prioritize passive inspection over live interaction

### 7. Loyalty point system

Progress: 65% [█████████████░░░░░░░]

- Current understanding %: `65%`
- Status: `Partially understood`
- Evidence found: AdaUploadPoint sync failure due to blank `StaticWebServerIP`; sync failure dates back to 2022 from `AdaDownload.ada` plus logs; plaintext `sa`/`adasoft` credentials found in config; WCF security mode is `None`; `รับส่งข้อมูล` UI strings confirm the loyalty points sync role; loyalty/iPointz system has no goods transfer reconciliation
- Important files/folders: `AdaUploadPoint.exe`, `AdaDownloadPoint.exe`, `AdaAbreastTools.exe`, `AdaUploadPointConfig.exe`, `AdaUploadPointCfg.xml`, `AdaDownload.ada`, `AdaDownloadPoint.exe.config`, `AdaXML.ada`
- Next action: locate point calculation logic, sync payload source, and failure logging path
- Risk level: `High`
- Notes: this is the best-understood layer so far, but it is still only a slice of the whole ecosystem

### 8. Coupon/gift/reward workflow

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `Not started`
- Evidence found: coupon lifecycle logic location is still unknown
- Important files/folders: `unknown`
- Next action: identify tables, procedures, and binaries that create, redeem, expire, and reverse coupons/rewards
- Risk level: `High`
- Notes: separate coupon, gift, and reward logic if they diverge in code or schema

### 9. Sync/upload/download services

Progress: 65% [█████████████░░░░░░░]

- Current understanding %: `65%`
- Status: `Partially understood`
- Evidence found: mother-PC audit fully identified the hub/gateway executables as loyalty sync components; AdaUploadPoint sync failure due to blank `StaticWebServerIP`; sync failure dates back to 2022 from `AdaDownload.ada` plus logs; plaintext `sa`/`adasoft` credentials found in config; WCF security mode is `None`
- Important files/folders: `AdaUploadPoint.exe`, `AdaDownloadPoint.exe`, `AdaAbreastTools.exe`, `AdaUploadPointConfig.exe`, `AdaUploadPointCfg.xml`, `AdaDownload.ada`, `AdaDownloadPoint.exe.config`, `AdaXML.ada`
- Next action: enumerate sync executables/services and trace upload/download responsibilities per component
- Risk level: `High`
- Notes: current evidence strongly covers the loyalty sync layer, not the broader branch/HQ sync model

### 10. Branch configuration

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `In progress`
- Evidence found: branch machine audit is a stated next priority
- Important files/folders: branch-local configs, encrypted `.ada` files, sync service config `unknown`
- Next action: audit one branch machine and compare branch-specific settings against cashier terminal and HQ/server roles
- Risk level: `High`
- Notes: encrypted config files should not be edited or replaced

### 11. HQ/server role

Progress: unknown [░░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `unknown`
- Status: `In progress`
- Evidence found: question remains whether branches use local DB or central DB and how cashier terminals connect to HQ
- Important files/folders: server-side Adasoft install path `unknown`, IIS/web service folders `unknown`
- Next action: identify which host acts as source of truth for sync, auth, web admin, and reporting
- Risk level: `High`
- Notes: clarify HQ role before drawing architecture conclusions

### 12. SQL Server / AdaAcc schema

Progress: 10% [██░░░░░░░░░░░░░░░░░░]

- Current understanding %: `10%`
- Status: `Partially understood`
- Evidence found: `AdaAcc` is active and considered a live dependency
- Important files/folders: SQL Server instance hosting `AdaAcc`, schema objects, MDF/NDF locations `unknown`
- Next action: run read-only schema inventory and classify tables by domain
- Risk level: `High`
- Notes: no direct schema walk has been completed yet; `AdaCustomer.edmx` should be read before broad table sampling

### 13. Stored procedures

Progress: 5% [█░░░░░░░░░░░░░░░░░░░]

- Current understanding %: `5%`
- Status: `In progress`
- Evidence found: `StoreProcedures.rar` has been identified as a target for safe extraction
- Important files/folders: `StoreProcedures.rar`, SQL Server stored procedures
- Next action: extract `StoreProcedures.rar` safely and compare archive contents with live DB procedure names
- Risk level: `High`
- Notes: this likely contains core business logic and has not yet been reviewed

### 14. Reporting system

Progress: 10% [██░░░░░░░░░░░░░░░░░░]

- Current understanding %: `10%`
- Status: `In progress`
- Evidence found: `AdaWebReport` has been identified as a priority inspection target
- Important files/folders: `AdaWebReport`
- Next action: inspect `AdaWebReport` structure, references, configs, and report-generation path
- Risk level: `Medium`
- Notes: identification exists, but internal report logic is still unknown

### 15. Web admin portal

Progress: 10% [██░░░░░░░░░░░░░░░░░░]

- Current understanding %: `10%`
- Status: `In progress`
- Evidence found: `AdaWebAbreast` DLLs/resources have been identified for inspection
- Important files/folders: `AdaWebAbreast`, IIS site/app pool config, related DLL/resource folders
- Next action: inspect `AdaWebAbreast` binaries/resources and map admin features to backend dependencies
- Risk level: `High`
- Notes: web admin has been named, not meaningfully reverse-engineered yet

### 16. Security risks

Progress: 80% [████████████████░░░░]

- Current understanding %: `80%`
- Status: `Partially understood`
- Evidence found: plaintext `sa`/`adasoft` credentials found in config; WCF security mode is `None`; `StaticWebServerIP` can be blank and break sync; sync failures persisted from 2022
- Important files/folders: `AdaDownloadPoint.exe.config`, `AdaUploadPointCfg.xml`, WCF service configs, encrypted `.ada` configs
- Next action: inventory additional plaintext secrets, transport weaknesses, and excessive privileges using read-only review
- Risk level: `Critical`
- Notes: strong evidence of credential and transport exposure already exists

### 17. Dangerous-to-touch components

Progress: 70% [██████████████░░░░░░]

- Current understanding %: `70%`
- Status: `Confirmed`
- Evidence found: live MDF/NDF files, stored procedures, encrypted `.ada` config files, IIS app pool settings, `sa` credentials, sync service config, and AdaPos active folders are all high-risk
- Important files/folders: see Do Not Touch Without Backup section below
- Next action: preserve this list and require backup/read-only workflow before any future intervention
- Risk level: `Critical`
- Notes: this section is operationally confirmed even if some paths remain unknown

### 18. Transfer/reconciliation possibility

Progress: 50% [██████████░░░░░░░░░░]

- Current understanding %: `50%`
- Status: `Partially understood`
- Evidence found: loyalty/iPointz system has no goods transfer reconciliation
- Important files/folders: transfer-related tables/procedures `unknown`
- Next action: verify whether AdaPOS or AdaAcc contains transfer-in/transfer-out tables and any reconciliation workflow
- Risk level: `High`
- Notes: confirmed gap exists for loyalty transfer reconciliation, but broader stock-transfer behavior remains open

## Do Not Touch Without Backup

- Live MDF/NDF database files
- Stored procedures
- Encrypted `.ada` config files
- IIS application pool settings
- `sa` password / SQL credentials
- Sync service config
- AdaPos active folders

## Next Best Investigations

Priority order for safest, highest-yield next steps:

1. Read `AdaCustomer.edmx`
2. List live `AdaAcc` database schema with read-only queries
3. Extract `StoreProcedures.rar` safely
4. Inspect `AdaWebAbreast` DLLs/resources
5. Inspect `AdaWebReport`
6. Inspect `D:\Adasoft\AdaPos4.0HpmFhn\`
7. Audit one cashier terminal
8. Audit one branch machine

## Confirmed Findings

- AdaUploadPoint sync failure due to blank `StaticWebServerIP`
- AdaPreparePoint failure due to missing `AdaXML.ada`
- Sync failure has existed since `2022`
- Plaintext `sa` / `adasoft` credentials found in config
- WCF security mode is `None`
- `AdaAcc` database is active
- Mother-PC hub machine is confirmed to be a loyalty sync/gateway layer, not the real POS core
- `รับส่งข้อมูล` refers to loyalty points sync
- Loyalty/iPointz system has no goods transfer reconciliation
- `SC-StockDay-Ordering` is separate from Adasoft and can become a truth-layer

## Audit Boundary

- Confirmed audited scope on the mother PC:
  - `AdaUploadPoint.exe`
  - `AdaDownloadPoint.exe`
  - `AdaAbreastTools.exe`
  - `AdaUploadPointConfig.exe`
- Confirmed not yet audited in depth:
  - `D:\Adasoft\AdaPos4.0HpmFhn\`
  - live `AdaAcc` schema via direct queries
  - `StoreProcedures.rar`
  - `AdaCustomer.edmx`
- Practical interpretation:
  - current knowledge is strong on the loyalty sync layer
  - current knowledge is still shallow on the core POS, DB business logic, and branch operations

## Question Backlog

- How does branch sync really work?
- Where is point calculation logic?
- Where is coupon lifecycle logic?
- What tables represent stock adjustment?
- Does AdaPOS have transfer-in/transfer-out tables?
- How does cashier terminal connect to HQ?
- Are branches using local DB or central DB?
- What does `รับส่งข้อมูล` actually trigger?
- What data has not synced since failure?
- Is there duplicate/lost loyalty data risk?

## Operating Notes

- Use this board as the single place to move topics from `unknown` to evidence-backed understanding
- When evidence is collected, update the matching area before expanding scope
- Prefer read-only SQL queries, passive file inspection, exported copies, and offline analysis
- Do not modify Adasoft production files
- Do not change config
- Do not run destructive commands
