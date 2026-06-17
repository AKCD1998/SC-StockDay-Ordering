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

echo.
if "%EXIT_CODE%"=="0" (
  echo การส่งข้อมูลเสร็จสมบูรณ์
) else (
  echo การส่งข้อมูลล้มเหลว ^(exit code %EXIT_CODE%^)
  echo กรุณาตรวจสอบไฟล์ log ในโฟลเดอร์ logs ที่อยู่ในไดเรกทอรีเดียวกันนี้
)
echo.
echo กดปุ่มใดก็ได้เพื่อออก
pause >nul
