# Factory station

English | [中文](FACTORY.zh.md)

A full-screen page of the HHL Gamepad Config app for production lines. It flashes or updates each
controller, checks its hardware, calibrates it, tests every input and records PASS / FAIL per unit.

## Set up a station PC

1. Install **Google Chrome** or **Microsoft Edge**.
2. Download the setup scripts:
   [**hhl-factory-setup.zip**](https://handheldlegend.github.io/hoja3/docs/factory/hhl-factory-setup.zip),
   and extract the zip (don't run the files from inside it).
3. Run the script once, as administrator (see [Setup scripts](#setup-scripts-chrome-and-edge)).
4. Close every browser window, open the browser again, and bookmark the station address for your line
   (see [Open it](#open-it)).
5. Open the station page once while the PC is online, so the line's firmware is downloaded and cached.

## Open it

```
https://handheldlegend.github.io/hoja3/#/factory?build=gcu_2,gcu_2s
https://handheldlegend.github.io/hoja3/?lang=zh#/factory?build=gcu_2,gcu_2s      (Chinese)
```

| Parameter | Meaning |
|---|---|
| `build` | The line's models: build ids, comma separated (e.g. `gcu_2,gcu_2s`). Each unit is identified on its own, so a mixed line works: a controller running HOJA by the build it reports (it must be one of these, and is updated to the newest firmware of its own build); a blank board in bootloader mode by the operator, who picks the model when the line has more than one. Firmware for every model is downloaded once and cached. Leave it out to accept every model (a blank board then asks which model it is). |
| `skip` | Steps to leave out, comma separated: `flash`, `calibrate`, `inputs`, `operator`. |
| `triggers` | Only for controllers that can be built with mechanical triggers (GCU 1): the line's trigger build, `analog`, `mechanical`, `left` or `right` (mechanical on that side only). Without it the operator picks it on the first unit and it is kept for the next ones. |
| `lang` | `zh`, `en`, `es`, `ja` or `fr`. It goes before the `#`, as in the second address above. The language can also be changed in the station's header. |

The page is not in the app's menu. Bookmark the address on each station.

## Per unit

1. **Plug in.** A controller already running HOJA is identified by its build and updated to that build's
   newest firmware when it's older. A blank board in bootloader mode (BOOTSEL) is flashed with the model the
   operator picks (or the line's only model). A controller on old (pre-HOJA2) firmware is restarted into
   update mode and gets its model's current firmware. A unit on a build that isn't one of the line's models
   fails with the reason; it is never flashed with another model's firmware.
2. **Self-check** (automatic): settings memory, charger chip (PMIC), battery pack, fuel gauge, wireless module
   and its firmware. Parts a build doesn't have are shown as "Not fitted" and not counted. A GCU 2 without a
   working radio fails "Firmware matches the hardware": it may be another model running GCU 2 firmware.
3. **Switch colors:** sets the colors the Switch shows for the controller (shell, buttons, left and right
   grip). GC Ultimate 2 and 2S units confirm their color SKU (one tap for the same SKU as the last unit).
   Other models have custom shells: pick the four colors (starting from the unit's own), or tap one of the
   recent color sets. Checked again after saving and logged per unit.
4. **Calibrate the sticks** (the same dialog as the Joysticks page).
5. **Trigger type** (only controllers that can have mechanical triggers, GCU 1): click each trigger five
   times. The controller's own finding (mechanical or analog) must match the line's trigger build.
6. **Calibrate the analog triggers** (as on the Input page). On GameCube style triggers that also click
   at the bottom, a second check follows: each trigger must read full at the membrane before it clicks.
7. **Input test:** press every button, push every trigger fully, move each stick to its edge in every
   direction, and turn the controller so every gyro and accelerometer axis shows data.
8. **Operator checks:** the FCC ID label on the rear shell (GCU 2: the page shows the FCC ID the unit
   reports to compare), rumble and LEDs, judged with Pass / Fail.
9. **Save,** then the result: a large PASS or FAIL. Unplug for the next unit.

The header counts the shift's units and passes. **Download CSV** saves the log: unit number, time, name,
build, firmware, MAC address, whether it was updated, color SKU, colors, every check (including the FCC
label), the overall result and a note. The log stays in that browser until **Clear log**, so download it at
the end of each shift.

## Connect without clicks (recommended)

Chrome and Edge ask for permission once per physical USB device, so every new unit would need a click. On
station PCs, a browser policy pre-approves HOJA controllers and the RP2040 / RP2350 bootloaders for this
site. Then units connect and flash the moment they are plugged in.

### Setup scripts (Chrome and Edge)

Download [**hhl-factory-setup.zip**](https://handheldlegend.github.io/hoja3/docs/factory/hhl-factory-setup.zip)
(the same files are in [docs/factory](https://github.com/HandHeldLegend/hhl-gamepad-config/tree/main/docs/factory))
and extract it. Messages are in English and Chinese.

- **Windows:** double-click `setup-windows.bat` and allow administrator access. If Windows shows
  "Windows protected your PC", click **More info**, then **Run anyway**. It sets the policy for Google
  Chrome and Microsoft Edge and installs the driver for blank RP2040 boards (next section).
  To undo everything: `setup-windows.bat -Remove`. Policy only, no driver: `setup-windows.bat -NoDriver`.
- **Linux:** `sudo bash setup-linux.sh` sets the policy for Chrome, Chromium and Edge and installs the udev
  rule. To undo the policy: `sudo bash setup-linux.sh --remove`. Linux needs no driver.

Then close every browser window, open it again and check `chrome://policy` or `edge://policy`.

### Windows driver for blank RP2040 boards

A blank RP2040 board in bootloader mode shows up as "RP2 Boot". Windows has no driver for its flashing
interface by itself, so the browser can't write to it directly. `setup-windows.bat` installs one: Windows'
own WinUSB driver, assigned to that interface (`USB\VID_2E8A&PID_0003&MI_01`).

- Windows only installs drivers from a trusted publisher. The script makes a certificate on that PC, signs
  the driver's small description file with it, and deletes the certificate's private key straight away, so
  nothing else can be signed with it. `-Remove` takes the driver and the certificate out again.
- **Not needed for:** RP2350 boards ("RP2350 Boot") and controllers that already run HOJA, which Windows
  handles by itself; Linux and macOS.
- **Without the driver** the station still works: for each blank RP2040 board it asks the operator to press
  **Select the drive** and pick the board's drive (RPI-RP2). The firmware is then copied onto the drive.
- Doing it by hand instead: [Zadig](https://zadig.akeo.ie), with a blank board plugged in, select
  "RP2 Boot (Interface 1)" and install WinUSB.

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

## Builders

The station also works as a quick bench test for any HOJA controller (ProGCC, Super Gamepad+ and the rest):

```
https://handheldlegend.github.io/hoja3/#/factory
https://handheldlegend.github.io/hoja3/#/factory?build=progcc_3s
```

Without `build`, every model is accepted and each unit is updated to its own build's newest firmware; a
blank board asks which model to install. Controllers on old (pre-HOJA2) firmware are restarted into update
mode and get their model's current firmware. Without the browser policy, press Connect or Allow once per
board.

## Color SKUs

iFixit Blue, Atomic Purple, Funtastic Orange, Transparent Blue / White, Ghost Black, Indigo / Clear. Their
color values live in `src/sections/factory/skus.js` (one table); the builds that need the FCC label check
are listed there too.

## Notes

- Keep one browser tab on the station page. Close other tabs that use the controller.
- Units that are unplugged before the result are logged as FAIL ("unplugged before finishing").
- The station judges what the firmware reports. A fuel gauge read through the wireless module (GCU 1)
  only reports over Bluetooth, so it is shown as "Not fitted" here.
