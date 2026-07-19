# Read-only diagnostic - does not change any settings or files, does not scan the disk.
# Purpose: list OTHER devices on the same local network as this machine
# (branch 003's real POS machine). Reasoning: the suspicious traffic shares
# this machine's PUBLIC IP (182.53.106.138), but that IP is shared by the
# whole store's internet connection via the router/NAT - it does not by
# itself prove the traffic came from THIS specific Windows machine. Item 1-4
# checks on this machine (scheduled tasks, startup, registry, running
# processes) all came back clean, pointing at a SEPARATE device on the same
# local network instead (e.g. an old branch notebook from a retired
# architecture, still powered on).

Write-Host "===== MACHINE: $env:COMPUTERNAME =====" -ForegroundColor Cyan
Write-Host "Time now: $(Get-Date)"
Write-Host ""

Write-Host "----- 1. This machine's own local network info -----" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|Tailscale" } |
    Select-Object InterfaceAlias, IPAddress, PrefixLength | Format-Table -AutoSize

Write-Host ""
Write-Host "----- 2. ARP table - other devices this machine has recently talked to on the LAN -----" -ForegroundColor Yellow
Write-Host "(A device with a Windows/PC-like presence here, other than known printers/routers/phones, is worth asking about)"
arp -a

Write-Host ""
Write-Host "----- 3. Ping-sweep the local subnet to wake up ARP entries for anything currently online -----" -ForegroundColor Yellow
Write-Host "(Windows PowerShell 5.1 compatible - sequential, short timeout per address, ~1-2 minutes total)"
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|Tailscale" } | Select-Object -First 1).IPAddress
if ($localIp) {
    $prefix = ($localIp -split '\.')[0..2] -join '.'
    Write-Host "Sweeping $prefix.1 - $prefix.254 ..."
    for ($i = 1; $i -le 254; $i++) {
        $ip = "$prefix.$i"
        $reply = ping.exe -n 1 -w 200 $ip
        if ($reply -match "Reply from") {
            Write-Host "  alive: $ip"
        }
    }
} else {
    Write-Host "Could not determine local subnet - skipping sweep."
}

Write-Host ""
Write-Host "----- 4. ARP table again, now that the sweep populated more entries -----" -ForegroundColor Yellow
arp -a

Write-Host ""
Write-Host "===== END OF REPORT - copy everything above and send back ====="
