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

## Character mapping

The UI never uses the original characters' names or likenesses: every fighter is drawn as our round character.

| Arena fighter | Engine | Status |
|---|---|---|
| Vix | meleelight Fox | ported data |
| Quill | meleelight Falco | ported data |
| Sable | meleelight Marth | ported data |
| Rally | meleelight Captain Falcon | ported data |
| Mochi | meleelight Jigglypuff | ported data |
| Dot | Fox template + own attributes | **approximation** (all-rounder) |
| Rosette | Marth template + own attributes + float | **approximation** |
| Rime | Falco template + own attributes (one climber) | **approximation** |
| Sir Retro | Captain Falcon template + own attributes, neutral / back / up air can't be L-cancelled | **approximation** (rebuilt in phase 2) |

Approximations (`engine/roster.js approxAttributes`) take the template's attribute set and override what the public
Melee attribute tables give (`constants.js FIGHTERS`): gravity, terminal and fast-fall speed, jumpsquat, full / short hop
initial speed (from the published heights: `v = sqrt(2gh + g²/4) - g/2`), initial dash and run speed, walk speed, air
speed, air acceleration (split into meleelight's A / B in the template's ratio), dash acceleration (same), traction,
weight and initial dash frames. Double jump multiplier is 0.9; jump horizontal speeds, air friction, walk acceleration
(scaled by walk speed), hitboxes, frame data, ECB, ledge boxes and specials are the template's.

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
120 to 185 KB each, mostly move code.

## Known differences from meleelight

- Single player plus a passive dummy (the same fighter); no CPU behaviour, stocks or match timer.
- Sounds and visual effects are gone; the Arena draws its own effects (hit flashes, afterimages).
- The aerial IASA fix and the analog L / R press above.
- meleelight itself differs from Melee in places (it is a recreation); those differences are kept.

## Adding a fighter

1. Add the roster entry to `constants.js FIGHTERS` (id, name, `feel`, published attributes, `look`).
2. In `engine/roster.js`, either map it to a ported character in `ENGINE_ID`, or add it to `APPROX` with a template
   (and `floatFrames` / `noLcancel` if needed). Approximations are registered by `buildRoster()`.
3. For a new template character, port its attributes, ECB and moves into a new `engine/<c>.js` in the same shape as
   `fox.js` (call `setupActionStates` with `{ ...S, ...M }`), add a `CHARIDS` entry in `ml.js` and import it in
   `roster.js`.
4. Its `look` (constants.js) picks the colours and accessory render.js draws (shapes only, no likenesses). Run `node src/sections/arena/tests/gameplay.test.mjs`.
