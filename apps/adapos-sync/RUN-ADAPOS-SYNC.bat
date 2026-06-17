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

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0open-adapos-and-sync.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

REM Thai status message lives in show-result.ps1 (UTF-8). Keeping it out of this
REM .bat means this file stays pure ASCII and renders correctly in any editor,
REM while PowerShell prints the Thai text to the Thai (874) console correctly.
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0show-result.ps1" -ExitCode %EXIT_CODE%

pause >nul
