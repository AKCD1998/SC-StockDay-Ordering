param([int]$ExitCode = 0)

# Thai console output. This file is UTF-8 with BOM so editors and PowerShell
# both read the Thai text correctly. Output is encoded to the Thai console
# code page (874) so a normal cmd window renders it properly.
try { [Console]::OutputEncoding = [System.Text.Encoding]::GetEncoding(874) } catch {}

Write-Host ""
if ($ExitCode -eq 0) {
  Write-Host "การส่งข้อมูลเสร็จสมบูรณ์"
} else {
  Write-Host "การส่งข้อมูลล้มเหลว (exit code $ExitCode)"
  Write-Host "กรุณาตรวจสอบไฟล์ log ในโฟลเดอร์ logs ที่อยู่ในไดเรกทอรีเดียวกันนี้"
}
Write-Host ""
Write-Host "กดปุ่มใดก็ได้เพื่อออก"
