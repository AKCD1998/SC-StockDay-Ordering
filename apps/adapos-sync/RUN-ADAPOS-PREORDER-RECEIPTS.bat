@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not exist "%NODE_EXE%" (
  echo Node.js not found at "%NODE_EXE%".
  exit /b 9009
)

REM Read-only AdaAcc receipt poll for the HQ preorder queue. This posts
REM pending and approved receipt snapshots to the existing sync API; it never writes AdaAcc.
REM Pending rows announce newly entered receipts; approved rows drive FIFO allocation cues.
REM The 90-day windows allow documents that change state late to be observed.
"%NODE_EXE%" src/index.js --branch=000 --datasets=pending_receipts,approved_receipts --lookback-days=90 --execute
exit /b %ERRORLEVEL%
