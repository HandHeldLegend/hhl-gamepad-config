# HHL factory station setup for Windows (Google Chrome and Microsoft Edge).
# HHL 工厂测试站设置（Windows，适用于 Google Chrome 和 Microsoft Edge）
#
# 1. Browser policy WebUsbAllowDevicesForUrls: the factory station page connects to HOJA controllers
#    and their bootloaders without a permission prompt for every unit.
#    浏览器策略：工厂测试站页面可直接连接 HOJA 手柄及其引导程序，无需每台都点击授权。
# 2. WinUSB driver for the RP2040 bootloader ("RP2 Boot"), so blank RP2040 boards are flashed straight
#    over USB. Windows has no driver for it by itself. (RP2350 boards and controllers that already run
#    HOJA need no driver.)
#    为 RP2040 引导程序（“RP2 Boot”）安装 WinUSB 驱动，空白的 RP2040 主板即可直接通过 USB 烧录。
#    Windows 自身不带这个驱动。（RP2350 主板和已运行 HOJA 的手柄不需要驱动。）
#
#   Install / 安装:        run setup-windows.bat (double-click) / 双击运行 setup-windows.bat
#   Remove  / 移除:        setup-windows.bat -Remove
#   Policy only / 仅策略:  setup-windows.bat -NoDriver
param([switch]$Remove, [switch]$NoDriver)

$ErrorActionPreference = 'Stop'

# Needs administrator rights (machine-wide policy, driver). Relaunch elevated if needed.
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    $argList = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
    if ($Remove) { $argList += '-Remove' }
    if ($NoDriver) { $argList += '-NoDriver' }
    Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
    exit
}

# ---- 1. Browser policy / 浏览器策略 ------------------------------------------------------------

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
        Write-Host "Browser policy removed for $browser / 已为 $browser 移除浏览器策略"
    } else {
        if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }
        New-ItemProperty -Path $key -Name $name -Value $policy -PropertyType String -Force | Out-Null
        Write-Host "Browser policy set for $browser / 已为 $browser 设置浏览器策略"
    }
}

# ---- 2. WinUSB driver for the RP2040 bootloader / RP2040 引导程序的 WinUSB 驱动 ----------------
#
# The driver is Windows' own winusb.sys; this only adds a small INF that tells Windows to use it for
# the bootloader's PICOBOOT interface (USB\VID_2E8A&PID_0003&MI_01). Windows installs an INF only when
# it is signed by a trusted publisher, so a certificate made on this PC signs it. The certificate's
# private key is deleted right after signing: nothing else can ever be signed with it.

$infName = 'hhl-rp2-boot.inf'
$certSubject = 'CN=HHL Factory Station RP2 Boot WinUSB'
$workDir = Join-Path $env:ProgramData 'HHL\factory-driver'

$inf = @'
; WinUSB for the RP2040 bootloader's PICOBOOT interface (HHL factory station).
[Version]
Signature   = "$Windows NT$"
Class       = USBDevice
ClassGUID   = {88BAE032-5A81-49f0-BC3D-A4FF138216D6}
Provider    = %Provider%
CatalogFile = hhl-rp2-boot.cat
DriverVer   = 01/01/2026,1.0.0.0
PnpLockdown = 1

[Manufacturer]
%Provider% = Devices,NTamd64,NTarm64

[Devices.NTamd64]
%DeviceName% = USB_Install, USB\VID_2E8A&PID_0003&MI_01

[Devices.NTarm64]
%DeviceName% = USB_Install, USB\VID_2E8A&PID_0003&MI_01

[USB_Install]
Include = winusb.inf
Needs   = WINUSB.NT

[USB_Install.Services]
Include = winusb.inf
Needs   = WINUSB.NT.Services

[USB_Install.HW]
AddReg = Dev_AddReg

[Dev_AddReg]
HKR,,DeviceInterfaceGUIDs,0x10000,"{6E45736A-2B1B-4078-B772-B3AF2B6FDE1C}"

[Strings]
Provider   = "Hand Held Legend"
DeviceName = "RP2 Boot (WinUSB, HHL factory station)"
'@

function Remove-BootDriver {
    # Driver packages in the store that came from our INF. pnputil's labels are translated on
    # non-English Windows, so match by position: the oemNN.inf line just before our INF's name.
    $published = $null
    foreach ($line in (& pnputil.exe /enum-drivers 2>$null)) {
        if ($line -match '(oem\d+\.inf)') { $published = $Matches[1] }
        elseif ($published -and $line -like "*$infName*") {
            & pnputil.exe /delete-driver $published /uninstall /force | Out-Null
            $published = $null
        }
    }
    foreach ($storeName in 'Root', 'TrustedPublisher') {
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, 'LocalMachine')
        $store.Open('ReadWrite')
        foreach ($c in @($store.Certificates | Where-Object { $_.Subject -eq $certSubject })) { $store.Remove($c) }
        $store.Close()
    }
    Get-ChildItem Cert:\LocalMachine\My | Where-Object { $_.Subject -eq $certSubject } | ForEach-Object {
        Remove-Item -Path $_.PSPath -DeleteKey -ErrorAction SilentlyContinue
    }
    if (Test-Path $workDir) { Remove-Item -Path $workDir -Recurse -Force -ErrorAction SilentlyContinue }
}

function Install-BootDriver {
    Remove-BootDriver # start clean: running the setup again replaces the earlier install
    New-Item -Path $workDir -ItemType Directory -Force | Out-Null
    $infPath = Join-Path $workDir $infName
    $catPath = Join-Path $workDir 'hhl-rp2-boot.cat'
    Set-Content -Path $infPath -Value $inf -Encoding ASCII

    $cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject $certSubject `
        -CertStoreLocation Cert:\LocalMachine\My -NotAfter (Get-Date).AddYears(20)
    try {
        # Trust the certificate (its public part only) as a publisher on this PC.
        $public = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(, $cert.RawData)
        foreach ($storeName in 'Root', 'TrustedPublisher') {
            $store = New-Object System.Security.Cryptography.X509Certificates.X509Store($storeName, 'LocalMachine')
            $store.Open('ReadWrite')
            $store.Add($public)
            $store.Close()
        }
        New-FileCatalog -Path $infPath -CatalogFilePath $catPath -CatalogVersion 2.0 | Out-Null
        $signed = Set-AuthenticodeSignature -FilePath $catPath -Certificate $cert -HashAlgorithm SHA256
        if ($signed.Status -ne 'Valid') { throw "Signing failed: $($signed.StatusMessage)" }
    } finally {
        # The private key is no longer needed, and must not stay on the PC.
        Remove-Item -Path "Cert:\LocalMachine\My\$($cert.Thumbprint)" -DeleteKey -ErrorAction SilentlyContinue
    }

    & pnputil.exe /add-driver $infPath /install | Out-Null
    # 0 = installed, 259 = added (no RP2 Boot board plugged in right now), 3010 = installed, restart needed
    if (@(0, 259, 3010) -notcontains $LASTEXITCODE) { throw "pnputil failed (code $LASTEXITCODE)" }
}

if ($Remove) {
    try {
        Remove-BootDriver
        Write-Host 'RP2040 bootloader driver removed / 已移除 RP2040 引导程序驱动'
    } catch {
        Write-Host "Could not remove the RP2040 bootloader driver: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "未能移除 RP2040 引导程序驱动：$($_.Exception.Message)" -ForegroundColor Yellow
    }
} elseif (-not $NoDriver) {
    try {
        Install-BootDriver
        Write-Host 'RP2040 bootloader driver installed (WinUSB for "RP2 Boot") / 已安装 RP2040 引导程序驱动（“RP2 Boot”使用 WinUSB）'
    } catch {
        # The station still works without it: blank RP2040 boards are then flashed through their drive.
        Write-Host ''
        Write-Host "The RP2040 bootloader driver was NOT installed: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host 'The station still works: for a blank RP2040 board it asks you to select the board''s drive (RPI-RP2).' -ForegroundColor Yellow
        Write-Host "未能安装 RP2040 引导程序驱动：$($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host '测试站仍可使用：遇到空白的 RP2040 主板时，它会让你选择主板的驱动器（RPI-RP2）。' -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host 'Done. Close every Chrome / Edge window and open the browser again.'
Write-Host '完成。请关闭所有 Chrome / Edge 窗口后重新打开浏览器。'
Write-Host 'Check: open chrome://policy or edge://policy and look for WebUsbAllowDevicesForUrls.'
Write-Host '检查：打开 chrome://policy 或 edge://policy，确认 WebUsbAllowDevicesForUrls 已生效。'
Write-Host ''
Read-Host 'Press Enter to close / 按回车键关闭'
