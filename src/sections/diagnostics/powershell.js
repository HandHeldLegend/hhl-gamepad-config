/**
 * powershell.js: The command a Windows user pastes into PowerShell for the diagnostics report. The
 * browser can't see any of this: CPU, motherboard, BIOS, Windows build, the USB host controllers
 * (with their location, to tell which one the module's USB chip hangs off), every WCH device Windows
 * has seen (CH340 and friends: driver version, provider, location, present or not), the serial ports
 * and the USB selective suspend setting. It only reads; the output goes to the clipboard.
 */
export const POWERSHELL_COMMAND = String.raw`$r = & {
  $ErrorActionPreference = 'SilentlyContinue'
  "HHL diagnostics (PowerShell) $(Get-Date -Format s)"
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  "CPU: $($cpu.Name.Trim()) ($($cpu.Manufacturer))"
  $bb = Get-CimInstance Win32_BaseBoard
  "Board: $($bb.Manufacturer) $($bb.Product) $($bb.Version)".Trim()
  $bios = Get-CimInstance Win32_BIOS
  "BIOS: $($bios.Manufacturer) $($bios.SMBIOSBIOSVersion) ($($bios.ReleaseDate.ToString('yyyy-MM-dd')))"
  $os = Get-CimInstance Win32_OperatingSystem
  "Windows: $($os.Caption) $($os.Version) build $($os.BuildNumber)"
  $ss = powercfg /query SCHEME_CURRENT 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 | Select-String '0x0000000[0-9a-f]$' | Select-Object -Last 2
  "USB selective suspend (plugged in, battery; 1 = on): $(($ss | ForEach-Object { [int]$_.Line.Trim().Split(' ')[-1] }) -join ', ')"
  "USB host controllers:"
  Get-PnpDevice -PresentOnly | Where-Object { $_.FriendlyName -match 'Host Controller' } | ForEach-Object { "  $($_.FriendlyName) | $($_.InstanceId) | location $((Get-PnpDeviceProperty -InstanceId $_.InstanceId -KeyName DEVPKEY_Device_LocationPaths).Data -join '; ')" }
  "WCH USB serial devices (VID 1A86), present and recent:"
  $wch = Get-PnpDevice | Where-Object { $_.InstanceId -match 'VID_1A86' }
  if (-not $wch) { "  none" }
  foreach ($d in $wch) {
    $p = @{}; Get-PnpDeviceProperty -InstanceId $d.InstanceId -KeyName DEVPKEY_Device_DriverVersion, DEVPKEY_Device_DriverDate, DEVPKEY_Device_DriverProvider, DEVPKEY_Device_DriverInfPath, DEVPKEY_Device_LocationPaths, DEVPKEY_Device_IsPresent, DEVPKEY_Device_LastArrivalDate | ForEach-Object { $p[$_.KeyName] = $_.Data }
    "  $($d.FriendlyName) | $($d.InstanceId)"
    "    present $($p.DEVPKEY_Device_IsPresent), status $($d.Status), problem $($d.Problem), last connected $($p.DEVPKEY_Device_LastArrivalDate)"
    "    driver $($p.DEVPKEY_Device_DriverVersion) ($($p.DEVPKEY_Device_DriverDate)) $($p.DEVPKEY_Device_DriverProvider) $($p.DEVPKEY_Device_DriverInfPath)"
    if ($p.DEVPKEY_Device_LocationPaths) { "    location $($p.DEVPKEY_Device_LocationPaths -join '; ')" }
  }
  "Serial ports:"
  Get-PnpDevice -Class Ports | ForEach-Object { "  $($_.FriendlyName) | $($_.Status) | $($_.InstanceId)" }
} | Out-String
$r | Set-Clipboard
Write-Host 'Copied. Go back to the diagnostics page and paste it into the box.'
`;
