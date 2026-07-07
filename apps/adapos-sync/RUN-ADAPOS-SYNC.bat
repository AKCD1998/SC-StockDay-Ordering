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

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0open-adapos-and-sync.ps1" %SKIP_ARG%
set "EXIT_CODE=%ERRORLEVEL%"

REM Thai status message lives in show-result.ps1 (UTF-8). Keeping it out of this
REM .bat means this file stays pure ASCII and renders correctly in any editor,
REM while PowerShell prints the Thai text to the Thai (874) console correctly.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0show-result.ps1" -ExitCode %EXIT_CODE%

REM Skip the interactive pause when launched non-interactively (e.g. Task
REM Scheduler passes "nopause"); otherwise the scheduled run hangs here forever.
if /i not "%~1"=="nopause" if /i not "%~2"=="nopause" pause >nul
