@echo off
cd /d "%~dp0"
title AdaPOS Sync Launcher

echo ========================================
echo   AdaPOS Back Office Sync Launcher
echo ========================================
echo.
echo This will:
echo 1. Open AdaPOS Back
echo 2. Try to log in
echo 3. Wait 60 seconds
echo 4. Run the branch sync
echo.

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0open-adapos-and-sync.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
  echo Sync finished successfully.
) else (
  echo Sync failed with exit code %EXIT_CODE%.
  echo Check the logs folder in this same directory for details.
)
echo.
pause
