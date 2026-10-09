# HHL factory station setup for Windows (Google Chrome and Microsoft Edge).
# HHL 工厂测试站设置（Windows，适用于 Google Chrome 和 Microsoft Edge）
#
# Lets the factory station page connect to HOJA controllers and their bootloaders without a
# permission prompt for every unit (browser policy WebUsbAllowDevicesForUrls).
# 允许工厂测试站页面直接连接 HOJA 手柄及其引导程序，无需每台都点击授权。
#
#   Install / 安装:   right-click → Run with PowerShell, or run setup-windows.bat
#   Remove  / 移除:   powershell -ExecutionPolicy Bypass -File setup-windows.ps1 -Remove
param([switch]$Remove)

$ErrorActionPreference = 'Stop'

# Needs administrator rights (machine-wide policy). Relaunch elevated if needed.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if ($Remove) { $argList += '-Remove' }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    exit
}

# HOJA controllers 2E8A:10C6/10DD/10DF, RP2040/RP2350 bootloaders 2E8A:0003/000F, Switch mode 057E:2009 (decimal).
$policy = '[{"devices":[{"vendor_id":11914,"product_id":4294},{"vendor_id":11914,"product_id":4317},{"vendor_id":11914,"product_id":4319},{"vendor_id":11914,"product_id":3},{"vendor_id":11914,"product_id":15},{"vendor_id":1406,"product_id":8201}],"urls":["https://handheldlegend.github.io"]}]'
$name = 'WebUsbAllowDevicesForUrls'
$browsers = [ordered]@{
    'Google Chrome'  = 'HKLM:\SOFTWARE\Policies\Google\Chrome'
    'Microsoft Edge' = 'HKLM:\SOFTWARE\Policies\Microsoft\Edge'
}

foreach ($browser in $browsers.Keys) {
    $key = $browsers[$browser]
    if ($Remove) {
        if (Test-Path $key) { Remove-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue }
        Write-Host "Removed for $browser / 已为 $browser 移除"
    } else {
        if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
        New-ItemProperty -Path $key -Name $name -Value $policy -PropertyType String -Force | Out-Null
        Write-Host "Set for $browser / 已为 $browser 设置"
    }
}

Write-Host ''
Write-Host 'Done. Close every Chrome / Edge window and open the browser again.'
Write-Host '完成。请关闭所有 Chrome / Edge 窗口后重新打开浏览器。'
Write-Host 'Check: open chrome://policy or edge://policy and look for WebUsbAllowDevicesForUrls.'
Write-Host '检查：打开 chrome://policy 或 edge://policy，确认 WebUsbAllowDevicesForUrls 已生效。'
Write-Host ''
Read-Host 'Press Enter to close / 按回车键关闭'
