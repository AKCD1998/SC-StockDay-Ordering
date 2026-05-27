@echo off
cd /d "%~dp0"
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0diagnose.ps1" > "%~dp0diagnose-output.txt" 2>&1
start "" "%~dp0diagnose-output.txt"
pause
