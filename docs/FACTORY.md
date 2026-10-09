# Factory station

A full-screen page of the HHL Gamepad Config app for production lines. It flashes or updates each
controller, checks its hardware, calibrates it, tests every input and records PASS / FAIL per unit.

## Open it

```
https://handheldlegend.github.io/hoja3/#/factory?build=gcu_2
https://handheldlegend.github.io/hoja3/?lang=zh#/factory?build=gcu_2      (Chinese)
```

| Parameter | Meaning |
|---|---|
| `build` | Target build id (a folder in hoja-device-fw/builds, e.g. `gcu_2`, `progcc_3.2`). Its firmware is downloaded once when the page opens and reused for every unit. Without it, each unit is updated to the newest firmware of its own build. |
| `skip` | Steps to leave out, comma separated: `flash`, `calibrate`, `inputs`, `operator`. |
| `sku` | Color SKU id (see below). Usually picked on the first unit instead and kept for the next ones. |
| `lang` | `zh`, `en`, `es`, `ja` or `fr`. |

The page is not in the app's menu. Bookmark the address on each station.

## Per unit

1. **Plug in.** A board in bootloader mode (BOOTSEL) is flashed with the target build. A controller already
   running HOJA is updated when it is on another build or older firmware, then tested.
2. **Self-check** (automatic): settings memory, charger chip (PMIC), battery pack, fuel gauge, wireless module
   and its firmware. Parts a build doesn't have are shown as "Not fitted" and not counted.
3. **Color SKU:** the batch's SKU writes the Switch Pro Controller colors (body, buttons, grips), so the
   Switch shows the right shell color out of the box. The first unit asks for the SKU; it stays selected
   (header dropdown) until changed. Checked again after saving and logged per unit.
4. **Calibrate** the sticks (the same dialog as the Joysticks page) and analog triggers (as on the Input page).
5. **Input test:** press every button, push every trigger fully, move each stick to its edge in every
   direction, and turn the controller so every gyro and accelerometer axis shows data.
6. **Operator checks:** the FCC ID label on the rear shell (GCU 2: the page shows the FCC ID the unit
   reports to compare), rumble and LEDs, judged with Pass / Fail.
7. **Save,** then the result: a large PASS or FAIL. Unplug for the next unit.

The header counts the shift's units and passes. **Download CSV** saves the log (time, unit, build,
firmware, MAC address, color SKU, every check including the FCC label, overall). The log stays in that browser until **Clear log**.

## Connect without clicks (recommended)

Chrome and Edge ask for permission once per physical USB device, so every new unit would need a click. On
station PCs, a browser policy pre-approves HOJA controllers and the RP2040 / RP2350 bootloaders for this
site. Then units connect and flash the moment they are plugged in.

### Setup scripts (Chrome and Edge)

Download from [docs/factory](https://github.com/HandHeldLegend/hhl-gamepad-config/tree/main/docs/factory).
Messages are in English and Chinese.

- **Windows:** download `setup-windows.bat` and `setup-windows.ps1` into the same folder, then double-click
  `setup-windows.bat` and allow administrator access. It sets the policy for Google Chrome and Microsoft
  Edge. To undo: `setup-windows.bat -Remove`.
- **Linux:** `sudo bash setup-linux.sh` sets the policy for Chrome, Chromium and Edge and installs the udev
  rule. To undo the policy: `sudo bash setup-linux.sh --remove`.

Then close every browser window, open it again and check `chrome://policy` or `edge://policy`.

### Manual setup

The scripts set this policy; you can also set it yourself.

Policy `WebUsbAllowDevicesForUrls` (values in decimal):

```json
[
  {
    "devices": [
      { "vendor_id": 11914, "product_id": 4294 },
      { "vendor_id": 11914, "product_id": 4317 },
      { "vendor_id": 11914, "product_id": 4319 },
      { "vendor_id": 11914, "product_id": 3 },
      { "vendor_id": 11914, "product_id": 15 },
      { "vendor_id": 1406, "product_id": 8201 }
    ],
    "urls": ["https://handheldlegend.github.io"]
  }
]
```

(0x2E8A = 11914: HOJA controllers 0x10C6 / 0x10DD / 0x10DF and the bootloaders 0x0003 / 0x000F;
0x057E:0x2009 = 1406:8201, Switch mode.)

- **Windows:** registry value `WebUsbAllowDevicesForUrls` (REG_SZ, the JSON above on one line) under
  `HKEY_LOCAL_MACHINE\Software\Policies\Google\Chrome` and, for Edge, `...\Policies\Microsoft\Edge`.
- **Linux:** save `{"WebUsbAllowDevicesForUrls": [ ...the list above... ]}` as `hhl-factory.json` in
  `/etc/opt/chrome/policies/managed/` (Chromium: `/etc/chromium/...`, Edge: `/etc/opt/edge/...`). Linux also needs the udev rule from the app's
  Help & about → Linux setup.

## Color SKUs

iFixit Blue, Atomic Purple, Funtastic Orange, Transparent Blue / White, Ghost Black, Indigo / Clear. Their
color values live in `src/sections/factory/skus.js` (one table); the builds that need the FCC label check
are listed there too.

## Notes

- Keep one browser tab on the station page. Close other tabs that use the controller.
- Units that are unplugged before the result are logged as FAIL ("unplugged before finishing").
- The station judges what the firmware reports. A fuel gauge read through the wireless module (GCU 1)
  only reports over Bluetooth, so it is shown as "Not fitted" here.
