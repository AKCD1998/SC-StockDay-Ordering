# Codex Handoff — Branch Laptop Installer Bundle
**Date:** 2026-05-27
**Author:** Claude (prev session)
**Next agent:** Codex

---

## Read this first

Before doing anything, read `docs/CODEX_HANDOFF_2026-05-27_HQ_ATTRIBUTION.md`'s **"Architecture"** section. The same two-repo split applies here — this task lives entirely in **`SC-StockDay-Ordering`** (the repo you are reading right now) because the sync agent's source code lives at `apps/adapos-sync/`. Do not touch `PaaSRTSM-project`.

---

## What you're building

A **turnkey installer bundle** that a non-developer at any branch (000, 001, 003, 004, 005) can run on the Mother PC to get the nightly sync agent working from scratch. It's the productionized version of what was done by hand on branch 005.

The bundle must also include a **diagnostic script** that captures everything an off-site engineer would need to debug if the install/sync isn't working. The diagnostic must produce a single text file the branch staff can email/LINE to the engineer.

This unblocks the user from needing remote assistance for every branch rollout (phase 2 of the project roadmap).

---

## What already exists — do NOT duplicate

- `apps/adapos-sync/src/` — the Node.js sync agent itself. Works. Don't change behaviour.
- `apps/adapos-sync/sync-and-shutdown.ps1` — wrapper that fires at 22:00, runs the sync with retries, then shuts down. Works. Don't change behaviour.
- `apps/adapos-sync/register-task.ps1` — registers the Windows Task Scheduler entry. Works. Don't change behaviour. **You will call this from your installer.**
- `apps/adapos-sync/.env.example` — template for required env vars.

The pieces above are correct and tested with branch 005. Your job is to wrap them in an installer experience, not rewrite them.

---

## Deliverables

Create `apps/adapos-sync/installer/` with the following files:

### 1. `install.ps1` — interactive setup
A PowerShell script the IT person runs once. It must:

1. **Self-check (no admin → tell them to re-launch as admin and exit cleanly)**
2. **Check prerequisites:**
   - Node.js 20+ installed (test `node --version`)
   - Git installed (test `git --version`)
   - If missing, print the exact download link and exit cleanly
3. **Confirm repo location:** assume the script is being run from inside an already-cloned `apps/adapos-sync/installer/` directory. `cd ..` to `apps/adapos-sync/` for all subsequent operations.
4. **`npm install --production`** in `apps/adapos-sync/`
5. **Interactive .env creation:** if `.env` already exists, ask whether to keep, edit, or overwrite. Then prompt for:
   - `ADAPOS_SYNC_BRANCH_CODE` (default: prompt with no default)
   - `ADAPOS_SQLSERVER_HOST` (default: `localhost`)
   - `ADAPOS_SQLSERVER_PORT` (default: `1433`)
   - `ADAPOS_SQLSERVER_USER` (default: `readonly_user`)
   - `ADAPOS_SQLSERVER_PASSWORD` (use `Read-Host -AsSecureString`, convert to plaintext for the file)
   - `ADAPOS_SQLSERVER_DATABASE` (default: `AdaAcc`)
   - `ADAPOS_SYNC_API_BASE_URL` (default: `https://paasrtsm-project.onrender.com`)
   - `ADAPOS_SYNC_SHARED_TOKEN` (no default; this is sensitive — `AsSecureString`)
   - `ADAPOS_SYNC_DRY_RUN` (default: `false`)
   - Other vars from `.env.example` get sensible defaults written without prompting
   Write the result to `apps/adapos-sync/.env` with UTF-8 no-BOM encoding.
6. **Smoke test the sync agent in dry-run mode:**
   `node src/index.js --branch=$Branch` (without `--execute`)
   If it errors, print the error and offer to abort or continue.
7. **Test the heartbeat endpoint:**
   `POST $ADAPOS_SYNC_API_BASE_URL/api/sync/heartbeat` with the token in `x-api-key`. Expect 200 + JSON `{ ok: true, heartbeatId: ... }`. If 401, the token is wrong; if connection refused, the URL is wrong.
8. **Register the scheduled task:** call `..\register-task.ps1 -Branch $Branch` and surface its output.
9. **Final summary:** print task name, next run time, .env location, and a reminder that the script will run nightly at 22:00. Tell the user how to run `diagnose.bat` if anything goes wrong.

The script should be **idempotent** — re-running it on an already-set-up laptop should detect that and offer to repair / reconfigure rather than failing.

### 2. `diagnose.bat` — one-click diagnostic
A `.bat` file the IT person can double-click. Must:
- Set the working directory to its own folder via `cd /d "%~dp0"`
- Run `powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0diagnose.ps1" > "%~dp0diagnose-output.txt" 2>&1`
- `start "" "%~dp0diagnose-output.txt"` to open the result file in Notepad
- `pause` so the cmd window doesn't disappear before the user reads error output

### 3. `diagnose.ps1` — the actual diagnostic logic
Writes a comprehensive report to stdout (which `diagnose.bat` redirects to `diagnose-output.txt`). The report must include, with clear section headers:

1. **System info:** Windows version, hostname, current user, current date/time, time zone
2. **Prerequisites:** `node --version`, `npm --version`, `git --version`. Report "NOT INSTALLED" if missing rather than letting the script crash.
3. **Repo state:** `git -C ..\.. rev-parse HEAD`, `git -C ..\.. status --short`, current branch, last 5 commits
4. **`.env` audit:** check that every variable from `.env.example` is present in `.env`. **DO NOT print the values of `ADAPOS_SQLSERVER_PASSWORD` or `ADAPOS_SYNC_SHARED_TOKEN`** — show only "SET (xx chars)" or "MISSING".
5. **Scheduled task state:** find any task whose action contains `sync-and-shutdown`. Print TaskName, State, NextRunTime, LastRunTime, LastTaskResult (decoded — e.g. `0 = success`, `267009 = currently running`, `267011 = never run`, `-2147023673 = cancelled by user`).
6. **SQL Server connectivity:** attempt a TCP connection to `ADAPOS_SQLSERVER_HOST:ADAPOS_SQLSERVER_PORT` (use `Test-NetConnection`). Report pass/fail. Do NOT attempt to log in — credentials might be wrong even when network is fine, and we want to separate those cases.
7. **API connectivity:** `Invoke-WebRequest` to `${ADAPOS_SYNC_API_BASE_URL}/api/branches` with a 10-second timeout. Report HTTP status code. (We use `/api/branches` rather than `/api/sync/heartbeat` because it's a GET with no body — easier diagnostic, no api-key needed.)
8. **Heartbeat endpoint check:** POST to `${ADAPOS_SYNC_API_BASE_URL}/api/sync/heartbeat` with `x-api-key` header and a test payload (`event: "diagnostic"`). Report status code + response body. This is the real auth check.
9. **Disk space:** free space on `C:`. Sync agent fails if disk is full.
10. **Recent sync agent output:** if a log file exists at `apps/adapos-sync/sync.log` or similar, tail the last 200 lines. (If no log file exists today, recommend running the wrapper once manually so a log gets produced — see point 12.)
11. **Task Scheduler history:** last 5 run events for the sync task from the Windows event log (`Get-WinEvent -LogName "Microsoft-Windows-TaskScheduler/Operational"` filtered to the task).
12. **Next-step suggestions:** at the very end, based on what failed:
    - If task missing → "Run `install.ps1` as admin to register the task"
    - If API 401 → "Token is wrong — re-run install.ps1 and re-enter ADAPOS_SYNC_SHARED_TOKEN"
    - If SQL TCP fails → "SQL Server is unreachable from this machine. Check that AdaPOS is running and firewall allows port 1433."
    - If task exists but LastTaskResult ≠ 0 → "Run `sync-and-shutdown.ps1 -Branch XXX -NoShutdown` interactively to see the live error"

The script must never crash on a missing file or a network failure — every section should be wrapped in `try/catch` and report the failure to the output rather than aborting the whole report.

### 4. `uninstall.ps1` — clean removal
- Removes the scheduled task (`Unregister-ScheduledTask`)
- Does NOT delete the repo folder or the .env (the user might re-install; deleting their token is hostile)
- Prints what was removed and what was left behind

### 5. `README.md` — for the branch IT person, in Thai
The audience is non-developers. Use simple Thai sentences, no jargon. Cover:
- What this bundle does ("ติดตั้งโปรแกรมซิงก์ข้อมูลรายคืน")
- Prerequisites with download links (Node.js 20, Git for Windows)
- Step-by-step install: clone repo, run `install.ps1` as admin, answer prompts
- How to verify it worked
- How to run `diagnose.bat` and where to send the output file when asking for help
- A small troubleshooting table (3–5 most common issues with one-line fixes)

---

## Acceptance criteria

You're done when **all of the following** are true:

1. A staff member at a fresh branch, given only this folder and a piece of paper with the SQL Server password and the shared API token, can complete the install in < 10 minutes without calling for help.
2. Running `diagnose.bat` on a working laptop produces a clean "everything green" report.
3. Running `diagnose.bat` on a broken laptop (try: unset .env, then stop SQL Server service, then break the API URL — three failure modes) produces a report that clearly identifies which thing is broken in each case. **Test this yourself before committing.**
4. Running `install.ps1` a second time on an already-installed laptop does the right thing (asks before overwriting, doesn't double-register the task).
5. The README is in Thai and a layperson can follow it.

---

## Important constraints

- **Path with Thai characters:** the user's branch 005 laptop has the repo at `C:\Users\scgro\Desktop\Rxอู๋ห้ามลบ\SC-StockDay-Ordering\apps\adapos-sync`. Your scripts must work with Thai characters in the path. Use `$PSScriptRoot` and avoid string interpolation of paths into cmd commands where possible. Test with a Thai path before declaring done.
- **No em dashes, no Unicode box-drawing in PowerShell strings.** That bit Claude earlier this session — see commit `1c32f00`. Stick to plain ASCII inside `.ps1` files. The Thai content in the README is fine because it's a markdown file, not parsed by PowerShell.
- **PowerShell 5.1 compatibility.** Branch laptops run Windows PowerShell 5.1 (not PowerShell 7). Don't use `??` null-coalescing, `?:` ternary, `-AsHashtable` on ConvertFrom-Json, or any other 7-only feature.
- **No `Read-Host -Prompt` for the API token in plaintext.** Use `-AsSecureString` and convert just before writing to disk. Same for the SQL password.
- **The .env file must be UTF-8 without BOM.** PowerShell's default `Set-Content` writes UTF-16 LE BOM, which trips up Node's dotenv. Use `[System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))`.
- **Don't add `node_modules` to git.** Make sure `apps/adapos-sync/.gitignore` already excludes it (it should — verify).

---

## Suggested order of work

1. Stub out the 5 files with section headers but no logic. Commit as scaffold.
2. Build `diagnose.ps1` **first** — even before `install.ps1`. Because once that exists, you can use it to verify your own changes as you build the rest.
3. Build `install.ps1` next. After each section is done, run `diagnose.bat` and confirm the report reflects what install just did.
4. Write `uninstall.ps1` (small, ~30 lines).
5. Write the Thai README last, once you actually know the flow you're documenting.
6. Smoke-test the three failure modes from acceptance criterion #3 by hand.
7. Commit each file as its own commit so the user can revert any one of them independently if needed.

---

## Open questions to confirm with the user before sinking deep time

- Should `install.ps1` clone the repo itself, or assume the repo is already cloned by the time it runs? (Current draft assumes the latter — a one-line `git clone` is easier for the IT person to do manually than wiring credentials into PS.)
- For Node.js: bundle a portable Node.js install in the folder, or just direct the user to download from nodejs.org? (Bundling makes the folder ~80MB; not-bundling makes the install instructions one step longer. Recommend not-bundling for now — revisit when phase 3 MSI work begins.)
- Logging: should the sync agent start writing to a rotating log file so `diagnose.ps1` has something to tail? (Today output goes to whatever stdout Task Scheduler captures, which is invisible. A simple `sync.log` in the agent folder would be a big diagnostic win — propose this and let the user decide.)

Ask these in chat before committing major work along any of those forks.

---

## Latest commits at handoff time

- `SC-StockDay-Ordering@b6b62cc` — HQ attribution handoff doc
- `PaaSRTSM-project@f39eb8c` — nightly sync log backend
