# Attributions

Third-party work used by HHL Gamepad Config. This list is mirrored in the app (*Help & about*) from
`src/sections/about/attributions.js`. Update both when adding a dependency or asset.

| Work | Author | License | Used for |
|---|---|---|---|
| [Input Prompts](https://kenney.nl/assets/input-prompts) | Kenney | CC0 1.0 | Button glyphs on the Input page (`assets/glyphs/`) |
| ["Nintendo Gamepad" 3D model](https://skfb.ly/PyDP) | Nidal Ghonaim | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/) | Controller model on the Motion page (`assets/3d/supergamepad.stl`) |
| [three.js](https://threejs.org) r128 + STLLoader | three.js authors | MIT (`vendor/three/LICENSE`) | 3D rendering on the Motion and 3D Platformer pages (`vendor/three/`) |
| [esptool-js](https://github.com/espressif/esptool-js) 0.4.3 | Espressif Systems | Apache-2.0 (`vendor/esptool-js/LICENSE`) | ESP32 wireless module updates (`vendor/esptool-js/`) |
| [pako](https://github.com/nodeca/pako) 2.1.0 (bundled in esptool-js) | Andrei Tuputcyn, Vitaly Puzrin | MIT AND Zlib (`vendor/esptool-js/LICENSE-pako`, `NOTICE.txt`) | Compression while writing ESP32 firmware |
| CH340 WebUSB serial driver | ported from `hoja_esptool/src/plugin/niceSerial.js` (Hand Held Legend) | n/a | Android ESP32 updates without Web Serial (`src/sections/wireless/ch34x-webusb.js`) |
| [meleelight](https://github.com/schmooblidon/meleelight) | Will Blackett and contributors | MIT (below) | The Arena's engine, ported to `src/sections/arena/engine/`: physics step, ECB and environmental collision, the action-state machine (shared and per-character moves), hit detection, knockback / hitlag / hitstun, projectiles, target collision, and the character data (attributes, hitboxes, frame counts, ECB) of its five characters. Stage geometry from its Battlefield layout. Sounds, visuals, menus, netplay and model animations were not ported |
| [pico-universal-flash-nuke](https://github.com/Gadgetoid/pico-universal-flash-nuke) | Phil Howard | BSD 3-Clause (below) | Recovery image (`firmware/universal_flash_nuke.uf2`) |
| [PICOBOOT protocol](https://github.com/raspberrypi/pico-bootrom-rp2040) | Raspberry Pi Ltd | BSD 3-Clause | Reference for the USB bootloader commands (`src/firmware/picoboot.js`) |
| [HOJA-LIB-RP2040](https://github.com/HandHeldLegend/HOJA-LIB-RP2040) | Hand Held Legend | see repository | Memory layouts generated from its headers (`src/device/generated/fw-layout.js`) |

The Super Famicom-inspired palette is a tribute; this project is not affiliated with or endorsed by Nintendo.
The Gameplay Arena's engine is a port of meleelight, an open-source fan recreation of a classic platform fighter
(MIT, see above and `docs/ARENA-ENGINE.md`). Its fighters, stage art, coach and the rest of the Arena are original
work; it contains no game files or assets, and its fighters are original characters (no names or likenesses).
The doldecomp/melee decompilation was used as a behavior reference only (input processing notes); no code from it
is used.
The 3D Platformer is original work: its hero, course, art and code were written for this app. Its movement
(speeds, jump heights, frame windows) was tuned using the [n64decomp/sm64](https://github.com/n64decomp/sm64)
decompilation and public movement write-ups as a **behavior reference only**; no code, comments, data tables or
assets were copied (see `src/sections/platformer/constants.js`).

## References

Behavior and data we learned from. No code, comments, data tables or assets were copied from these.

| Reference | By | Used for |
|---|---|---|
| [doldecomp/melee](https://github.com/doldecomp/melee) | Melee decompilation contributors | Behavior reference for the Arena (input processing, techniques, and how Sir Retro picks his numbers and food arcs and fills his bucket). No code, comments or data tables copied. |
| [n64decomp/sm64](https://github.com/n64decomp/sm64) | SM64 decompilation contributors | Behavior reference for the 3D Platformer's movement. No code, comments or data tables copied. |
| [SM64 movement write-ups (pannenkoek2012, Ukikipedia)](https://ukikipedia.net) | pannenkoek2012 and Ukikipedia contributors | Cross-checking the 3D Platformer's movement numbers. |
| [Melee Frame Data](https://meleeframedata.com) | meleeframedata.com | Frame data for the Arena fighters (IASA frames, dodges, rolls) and every Sir Retro move (startup, active frames, landing lag, autocancel). |
| [SmashWiki](https://www.ssbwiki.com) | SmashWiki contributors | Arena movement numbers (initial dash, shield, weights), move behavior, and Sir Retro's hitbox tables, frame timing and special moves. |
| [IKneeData](https://ikneedata.com) | Schmoo (Will Blackett) | Sir Retro's hitbox values (damage, angle, knockback growth, base and set knockback, element) and attributes. |
| [Definitive shield sizes (Smashboards)](https://smashboards.com/threads/definitive-shield-sizes.444049/) | Smashboards community | Sir Retro's shield size. |

## meleelight (MIT License)

Copyright (c) 2016 Will Blackett

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## pico-universal-flash-nuke (BSD 3-Clause License)

Copyright 2024 Phil Howard

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the
following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following
   disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following
   disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products
   derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES,
INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
