@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"

if not exist "%NODE_EXE%" (
  echo Node.js not found at "%NODE_EXE%".
  exit /b 9009
)

REM Read-only AdaAcc receipt poll for the HQ preorder queue. This only posts
REM approved receipt snapshots to the existing sync API; it never writes AdaAcc.
REM The 90-day window matches the pending receipt review window so older
REM documents that become approved can still be observed by a later poll.
"%NODE_EXE%" src/index.js --branch=000 --datasets=approved_receipts --lookback-days=90 --execute
exit /b %ERRORLEVEL%
