@echo off
cd /d "%~dp0"
title AdaPOS Sync Launcher

echo ========================================
echo   AdaPOS Back Office Sync Launcher
echo ========================================
echo.
echo Make sure AdaPOS Back Office is already open and logged in.
echo This will run the branch sync now.
echo.

REM Task Scheduler passes args in either order, e.g. "nopause" or
REM "nopause eveningcheck" (evening trigger only - see register-task.ps1).
set "SKIP_ARG="
if /i "%~1"=="eveningcheck" set "SKIP_ARG=-SkipIfSyncedToday"
if /i "%~2"=="eveningcheck" set "SKIP_ARG=-SkipIfSyncedToday"

REM Generate one attemptId per invocation and hand it to both the launcher
REM and the checker. This is what lets the checker prove the status file it
REM reads was actually written by *this* run, instead of trusting a leftover
REM CURRENT/UPDATED status from an earlier day that a silently-broken
REM launcher never overwrote.
set "ATTEMPT_ID="
for /f "usebackq delims=" %%A in (`powershell -NoProfile -Command "[guid]::NewGuid().ToString()"`) do set "ATTEMPT_ID=%%A"

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0open-adapos-and-sync.ps1" %SKIP_ARG% -AttemptId "%ATTEMPT_ID%"
set "SYNC_EXIT_CODE=%ERRORLEVEL%"

REM Always check the self-update status file after the launcher returns
REM control, even when the sync itself succeeded, so Task Scheduler can never
REM report 0 when self-update ended FAILED, never reached a terminal result,
REM or (via -ExpectedAttemptId) never actually ran this invocation's attempt
REM at all (see check-self-update-result.ps1 exit codes).
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0check-self-update-result.ps1" -ExpectedAttemptId "%ATTEMPT_ID%"
set "CHECK_EXIT_CODE=%ERRORLEVEL%"

if not "%SYNC_EXIT_CODE%"=="0" (
  set "FINAL_EXIT_CODE=%SYNC_EXIT_CODE%"
) else if not "%CHECK_EXIT_CODE%"=="0" (
  set "FINAL_EXIT_CODE=%CHECK_EXIT_CODE%"
) else (
  set "FINAL_EXIT_CODE=0"
)

REM Thai status message lives in show-result.ps1 (UTF-8). Keeping it out of this
REM .bat means this file stays pure ASCII and renders correctly in any editor,
REM while PowerShell prints the Thai text to the Thai (874) console correctly.
REM Reports the sync's own result; self-update health is reported separately
REM above and folded into FINAL_EXIT_CODE below.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0show-result.ps1" -ExitCode %SYNC_EXIT_CODE%

REM Skip the interactive pause when launched non-interactively (e.g. Task
REM Scheduler passes "nopause"); otherwise the scheduled run hangs here forever.
if /i not "%~1"=="nopause" if /i not "%~2"=="nopause" pause >nul

REM Propagate FINAL_EXIT_CODE (captured before show-result.ps1 ran, so its
REM own exit code/ERRORLEVEL can never overwrite this) as this .bat's own
REM exit code. Without this, cmd.exe falls through to the no-op "if" above
REM and always returns 0, so Task Scheduler reports success even when the
REM sync or the self-update check failed.
exit /b %FINAL_EXIT_CODE%
