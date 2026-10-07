# Arena engine

The Arena's simulation is a port of [meleelight](https://github.com/schmooblidon/meleelight) (MIT,
Copyright (c) 2016 Will Blackett), an open-source browser recreation of a classic platform fighter. Movement,
physics, collision, action states and hits behave as in meleelight; the Arena keeps its own input pipeline, coach,
modes, fighters' look and stage art.

## What was ported, from where

| Arena file (`src/sections/arena/engine/`) | meleelight source | Notes |
|---|---|---|
| `physics.js` | `src/physics/physics.js` | per-frame player update: hitlag + SDI, action state, knockback decay, ECB, collision, ledges, blast zones, hurtbox, interpolated hitboxes |
| `collision.js` | `src/physics/environmentalCollision.js`, `interpolatedCollision.js` | ECB vs stage surfaces and corners, squashing, swept circles |
| `hit.js` | `src/physics/hitDetection.js` | hitbox vs hurtbox / shield / hitbox (clank), phantom hits, knockback, DI, launch speed and decay, hitstun, grabs |
| `shortcuts.js` | `src/physics/actionStateShortcuts.js` | interrupt checks (jump, tilts, smashes, specials, aerials, dash), air drift, fast fall, traction, shield size / depletion |
| `article.js` | `src/physics/article.js` | projectiles (lasers, side-special afterimage hitbox); drawing removed |
| `shared.js` | `src/characters/shared/moves/*` (79 states) | every shared action state: wait / walk / dash / run / turn, jumps, landing, L-cancel landing, airdodge, shield, rolls, ledge, hitstun / tumble / tech, grabs, death and respawn |
| `fox.js`, `falco.js`, `falcon.js`, `marth.js`, `puff.js` | `src/characters/<c>/` (attributes, ECB, index, moves, helpers) | attributes, hitbox tables and offsets, frame counts, intangibility, ECB per frame, each character's own moves |
| `sirretro.js` | the structure of `src/characters/<c>/` (no data) | Sir Retro, our own character: new data from public Mr. Game & Watch sources (see below) in meleelight's format |
| `player.js` | `src/main/player.js` | the player object |
| `util.js` | `src/main/util/*`, `src/main/linAlg.js`, `src/stages/util/*`, `src/stages/stage.js` | vectors, boxes, ECB transforms, hitbox constructors |
| `ml.js` | parts of `src/main/main.js`, `main/characters.js`, `settings.js`, `main/vfx/blendColours.js` | the globals the engine reads, plus HOJA glue (world swap, stubs, ECB decoder, float) |
| `world.js` | the match branch of `gameTick()` (`src/main/main.js`), `targetHitDetection()` (`src/target/targetplay.js`) | step order, 8-frame input history, target collision |
| `../stage.js` | `src/stages/vs-stages/battlefield.js` | geometry and blast zones (our own drawing) |

Not ported: menus, multiplayer / netcode, replays, AI, audio, visual effects, 3D / model animations (the 31 MB
`src/animations` folder; meleelight's hurtbox is a box per character, so no animation data is needed for
collision), stage builder, other stages, the Smash 64 / turbo / auto L-cancel options.

### How it was converted

A one-off script (not shipped; `acorn` + `flow-remove-types` + `astring`) stripped the Flow types, removed sound,
visual-effect, screen-shake and debug-output statements, rewrote the imports, bundled the ~400 move modules into one
file per character (moves become `S.NAME` / `M.NAME` entries), aliased `player[p]` as `pl` and
`actionStates[characterSelections[p]]` as `acts` inside functions, folded numeric literals and run-length encoded the
ECB data. From here on the files are maintained by hand; every behavioural change is marked `// HOJA:`:

- `checkForIASA` dispatches aerials through the per-character table (meleelight only did it for 3 characters).
- each Game owns its world (`useArticles`, `useEcbSquashData`, `setWorldGlobals`), so tests can run several.
- template characters: ECB frames past the template's data hold the last frame; `templateOf` keeps
  character-specific branches; `noLcancel` (L-cancel ignored for listed aerials); `floatFrames` (float).
- Sir Retro: `article.js` absorbs `absorbable` projectiles (the laser) that reach his bucket's circle
  (`ABSORB`) while his state has `onAbsorb` and `phys.absorbing`; `hit.js` adds a hitbox's `sd` (extra
  shield damage) and a freezing element (type 9, drawn only); `roster.js` gives every fighter his
  `THROWNRETRO*` states (meleelight keeps "thrown by X" states per character, ours are generic).

## Character mapping

The UI never uses the original characters' names or likenesses: every fighter is drawn as our round character.

| Arena fighter | Engine | Status |
|---|---|---|
| Vix | meleelight Fox | ported data |
| Quill | meleelight Falco | ported data |
| Sable | meleelight Marth | ported data |
| Rally | meleelight Captain Falcon | ported data |
| Mochi | meleelight Jigglypuff | ported data |
| Sir Retro | `sirretro.js`: our own character from public Mr. Game & Watch (Melee NTSC 1.02) data | full character |
| Dot | Fox template + own attributes | **approximation** (all-rounder) |
| Rosette | Marth template + own attributes + float | **approximation** |
| Rime | Falco template + own attributes (one climber) | **approximation** |

Approximations (`engine/roster.js approxAttributes`) take the template's attribute set and override what the public
Melee attribute tables give (`constants.js FIGHTERS`): gravity, terminal and fast-fall speed, jumpsquat, full / short hop
initial speed (from the published heights: `v = sqrt(2gh + g²/4) - g/2`), initial dash and run speed, walk speed, air
speed, air acceleration (split into meleelight's A / B in the template's ratio), dash acceleration (same), traction,
weight and initial dash frames. Double jump multiplier is 0.9; jump horizontal speeds, air friction, walk acceleration
(scaled by walk speed), hitboxes, frame data, ECB, ledge boxes and specials are the template's.

## Sir Retro

A full character on the engine (`engine/sirretro.js`, engine id 5), modelled on Mr. Game & Watch in Melee
(NTSC 1.02). The code follows meleelight's character files; every number is new and comes from public data.
Drawn as our own flat dark round LCD figure with simple original props (render.js `#retroProp`); no names,
likenesses or assets of the original.

Sources, by area:

| Area | Source |
|---|---|
| Attributes (weight 60, gravity 0.095, fall 1.7 / 2.3, jumpsquat 4, jumps 29 / 11.025, double jump 2.23 and 0.9, dash 1.5 / 1.5 with 8 dash frames and 0.02 + 0.06 acceleration, walk 1.1, traction 0.06, air speed 1.0, air acceleration 0.02 + 0.03, air friction 0.016) | SmashWiki attribute pages and the G&W (SSBM) page; ikneedata.com `charAttributes.js` |
| Shield (size 10.75, scale 1.02: the smallest max shield) | Smashboards "Definitive shield sizes" (quoted via a search result; the thread itself wasn't reachable) |
| Frame data: startup, active frames, IASA, landing lag, L-cancel lag, autocancel, grabs, dodges, airdodge | meleeframedata.com (`/mr._game_&_watch`) and the SmashWiki move subpages |
| Hitboxes: damage, angle (361 = Sakurai), BKB, KBG, WDSK, radius, bone / offset, element, ground / air | SmashWiki `Mr. Game & Watch (SSBM)/<move>` hitbox tables, cross-checked with ikneedata.com `hitboxDBJSON.js` |
| Judge odds, Chef arcs, Oil Panic flow and formula (floor(absorbed × 1.5) + 5), Fire's landing lag | SmashWiki "Judge", "Chef", "Oil Panic", "Fire" and the special subpages; doldecomp/melee as a behavior reference only |

Moves (frames are 1-based; damage / angle / BKB / KBG):

| Move | Frames | Hitboxes |
|---|---|---|
| Jab | hit 4-6, IASA 16, 17 total; A again from frame 8 → rapid jab | 3% 83°/85° KBG 100 WDSK 20; rapid 3% 70° WDSK 18, hits every 12 frames (loop est.) |
| Side tilt | 13-30, IASA 42, 44 | 10% 361 BKB 10 KBG 100 (4 boxes) |
| Up tilt | 9-29, 29 | 9% 100° BKB 30 KBG 127 / 125 / 123 |
| Down tilt | 6-13, IASA 26, 29 (ends crouched) | 12% 85° BKB 65 KBG 100 (grounded foes), 9% 361 BKB 80 KBG 40 (airborne foes) |
| Dash attack | 6-29, 37; boost grab 2-4 | 9% 120° BKB 70 KBG 30 |
| Forward smash | charge 8, clean 13-16, late 17-33, IASA 42, 44 | torch 18% 55° BKB 44 KBG 100 fire, body 14% 361; late 6% fire |
| Up smash | charge 18, 24-28, IASA 40, 45 | 18% 83° BKB 40 KBG 96 |
| Down smash | charge 8, 15-19, 34 | handles 10% 20° BKB 10 KBG 50 (priority), hammers 16% 80° BKB 60 KBG 90 |
| Neutral air | 20-29, 44; autocancel 1-2; landing 15, **no L-cancel** | 16% 361 BKB 20 KBG 100, radius 11.7 |
| Forward air | clean 10-12, late 13-32, 44; AC 1-2; landing 25 (12 L-cancelled) | 16% 361 BKB 30 KBG 80; late 6% BKB 10 |
| Back air | hits 10-12, 13-15, 16-18, 19-21; 39; AC 1-9; landing 18 (hitbox on frame 1), **no L-cancel** | 5% 68° BKB 60 KBG 60 slash; landing 3% BKB 80 |
| Up air | 7-16, 21-22; 39; AC 1-6; landing 15, **no L-cancel** | 7% 94° BKB 12 KBG 100, then 9% 90° BKB 55 KBG 100 |
| Down air | clean 12, late 13-38; 49; AC 1-5; landing 20 (10 L-cancelled, hitbox frame 2 / 1) | 14% 270° (meteor) + 13% 60°, late 13% 60°, BKB 20 KBG 100; landing 6% 40° BKB 50 KBG 30 |
| Grab / dash grab | 7-8 of 30 / 11-12 of 40 | |
| Pummel | 13 of 30 | 3% 80° KBG 100 WDSK 30 |
| Throws (all 8%) | release at 0.55 × the foe's weight, end at 0.69 × weight | forward 68° / back 68° backwards / up 90° (BKB 100 KBG 40), down 88° BKB 80 KBG 40 |
| Ledge attack | 42-47 of 55, intangible 1-39 (slow: est.) | 8% / 8% / 6% 361 BKB 80 KBG 50 |
| Floor attack | est. 18-19 front, 26-27 back, 49 | 6% 361 BKB 80 KBG 50 |
| Chef (neutral B) | pan 18-21 and a sausage on 18, 49; up to 5 sausages, B again from 21 (20 apart) or held (34 apart) | pan 5% 10° BKB 60 KBG 30 fire; sausage 4% 70° BKB 20 KBG 50 r 1.95, 80 frames, five arcs never one of the last two |
| Judge (side B) | 16-29 (5: hits 16-18, 19-21, 22-24, 25-27), 49; air: ends in a normal fall | 1: 2% no KB, 12% recoil · 2: 4% 361 BKB 10 KBG 40 · 3: 6% 140° BKB 45 KBG 50, +20 shield damage · 4: 8% 40° BKB 50 KBG 40 slash · 5: 4 × 3% 75° BKB 30 KBG 80 electric · 6: 12% 20° BKB 30 KBG 80 fire · 7: 14% 361 BKB 30 KBG 50 · 8: 4% 80° WDSK 70 KBG 100 freezing · 9: 32% 361 BKB 100 KBG 80 (smaller hitbox). Number: never one of the last two (start: 2 then 1), so each allowed number is 1/7 |
| Fire (up B) | hitbox 1-37, 39 frames of rise, then helpless (FALLSPECIAL); landing 40 during the move, 6 after | 6% 80° BKB 50 KBG 80 |
| Oil Panic (down B) | absorbs from frame 5 (radius 5.5 at 4.5 forward, 6 up), loops 38 → 5 while B is held, 49; catch 25 frames intangible; 3 catches fill the bucket (kept on respawn) | spill 2-10 / 11-22 / 23-37, 49: floor(absorbed × 1.5) + 5; ground BKB 30 KBG 80, air BKB 40 KBG 100 with 1% on the 2nd / 3rd boxes (Melee bug) |
| Dodges | spot dodge 32 (intangible 2-12), rolls 35 (4-19), airdodge 49 (4-29), wavedash landing 10 | |

Estimated (no public number found; tune against footage if better data appears):
- Hitbox positions for hand / head bones (jab puff, chair, flag, hammer, helmet): bone-0 offsets are used
  as published (forward = the offset's z or x axis, up = y), the rest are placed where the LCD pose holds
  the prop.
- Hurtbox 10 × 14 (meleelight has one box per fighter) and ECB (12 tall, 7 crouched, 4 lying down).
- Animation-driven motion: Fire's rise (about 57 units over 39 frames, stick tilt up to ~20°), dash attack
  slide, roll / tech / getup distances (26 / 30 / 28), ledge climb paths, slow ledge options, floor attack
  timing, the rapid jab loop, Chef's five arcs and sausage gravity, Judge's air hop (1.0, once per airtime)
  and air slowdown (half speed), Oil Panic's slowed fall in the air.
- Jump horizontal speed (ground-to-air 0.8, 0.8 initial, 1.0 max), walk initial speed and acceleration,
  initial dash animation length (21).
- Judge 7's food and Judge 8's freeze are not simulated beyond the hit (the Arena has no items; freezing
  is drawn only).

## Input

`controller.js EngineInput` builds meleelight's input record from the app's Melee-processed values (1/80 stick steps,
per-axis deadzone, 0..140 triggers). Differences from meleelight's own input code:

- an analog trigger past the light-shield minimum counts as an L / R press (airdodge, tech), as in Melee; meleelight
  only accepted the digital click;
- both jump buttons map to X; Y is unused;
- presses latched between two 60 Hz frames (`PressLatch`) are delivered as edges;
- the optional input buffer (default 3 frames, 0 = strict) re-offers a jump / A / B / Z / shield / C-stick press that
  didn't start anything new for up to N frames. Shield presses during aerials (L-cancel) and jumps during jumpsquat
  are never carried.

## Data format

- **Attributes** (`setCharAttributes`): meleelight's names (`gravity`, `terminalV`, `fastFallV`, `jumpSquat`,
  `fHopInitV`, `sHopInitV`, `dInitV`, `dMaxV`, `dAccA/B`, `maxWalk`, `aerialHmaxV`, `airMobA/B`, `traction`, `weight`,
  `hurtboxOffset`, `ledgeSnapBoxOffset`, `ecbScale`...). HOJA adds `floatFrames` and `noLcancel`.
- **Hitboxes** (`setHitBoxes`, `setOffsets`): `createHitbox(offset[], size, dmg, angle, kbg, bkb, setKb, type, clank,
  hitsGrounded, hitsAirborne)`; offsets are per-frame `Vec2D`s relative to the player, facing right.
- **Frame counts** (`setFrames`) and **intangibility** (`setIntangibility`: `[start frame, length]`).
- **ECB**: per action state, per frame `[bottom, side x, side y, top]` offsets (integers 0..42). Stored as strings: one
  character per value (code 48 + value); a frame repeated n > 1 times is followed by one letter (code 97 + n - 2).
  `decodeEcb()` in `ml.js` expands them at load.
- Units are meleelight's (the main platform is 136.8 wide); timings are 60 Hz frames.

Size: about 1.0 MB of plain JavaScript (≈ 150 KB gzipped), lazy-loaded with the Arena. The five character files are
120 to 185 KB each, mostly move code; Sir Retro's `sirretro.js` is about 52 KB (15 KB gzipped).

## Known differences from meleelight

- Single player plus a passive dummy (the same fighter); no CPU behaviour, stocks or match timer.
- Sounds and visual effects are gone; the Arena draws its own effects (hit flashes, afterimages).
- The aerial IASA fix and the analog L / R press above.
- meleelight itself differs from Melee in places (it is a recreation); those differences are kept.

## Adding a fighter

1. Add the roster entry to `constants.js FIGHTERS` (id, name, `feel`, published attributes, `look`).
2. In `engine/roster.js`, either map it to a full character in `ENGINE_ID` (a ported one, or one of our own like
   `sirretro.js`), or add it to `APPROX` with a template (and `floatFrames` / `noLcancel` if needed).
   Approximations are registered by `buildRoster()`.
3. For a new template character, port its attributes, ECB and moves into a new `engine/<c>.js` in the same shape as
   `fox.js` (call `setupActionStates` with `{ ...S, ...M }`), add a `CHARIDS` entry in `ml.js` and import it in
   `roster.js`.
4. Its `look` (constants.js) picks the colours and accessory render.js draws (shapes only, no likenesses). Run `node src/sections/arena/tests/gameplay.test.mjs`.
