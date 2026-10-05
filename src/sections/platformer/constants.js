/**
 * constants.js: Every tunable number of the 3D Platformer.
 *
 * Units and rate
 *   Distances are "course units": the hero is 160 units tall (≈ 1.6 m; the renderer draws 100 units per
 *   metre). Speeds are units per simulation frame, accelerations units per frame². The simulation runs at a
 *   fixed 30 Hz (the rate classic N64-era 3D platformers ran their physics at), so the frame windows below
 *   (landing chains, wall-kick timing, ground-pound spin) are counted in the same 30 Hz frames as the
 *   behaviour they're modelled on. Rendering interpolates between frames at the display rate.
 *
 * Behaviour reference (no code, comments or tables copied; values were read, then re-expressed here):
 *   - n64decomp/sm64 https://github.com/n64decomp/sm64: src/game/mario.c (jump velocities per action,
 *     landing chains, stick → intended magnitude), mario_step.c (gravity, quarter steps, ledge probe),
 *     mario_actions_moving.c (walking acceleration, turning, skid, crouch slide, dive), and
 *     mario_actions_airborne.c (air drag/steering, ground pound, wall contact and kick window).
 *   - Community physics write-ups (e.g. the SM64 wiki's movement pages and pannenkoek2012's analyses) for
 *     cross-checking slope classes and timings.
 *   The structure (data-driven action table, AABB/wedge collision, camera) is our own and much simpler.
 */

/** Simulation rate (Hz) and step length (ms). */
export const SIM_HZ = 30;
export const STEP_MS = 1000 / SIM_HZ;
/** At most this many simulation steps per animation frame (after a stall we drop time instead). */
export const MAX_STEPS_PER_RAF = 6;

/** Hero body. */
export const BODY = {
  HEIGHT: 160,
  RADIUS: 50,          // wall-push radius
  STEP_UP: 30,         // solids whose top is at most this far above the feet don't block (you step onto them)
  FLOOR_REACH: 78,     // a floor this far above the feet is still "under" you (for stepping up / landing)
  SNAP_DOWN: 100,      // walking off a drop shorter than this keeps you on the ground (slopes, small steps)
};

/** Stick processing. */
export const STICK = {
  DEADZONE: 0.15,      // radial, then rescaled to 0..1
  /** Target ground speed = (stick magnitude²) × this (a gentle push walks, a full push runs). */
  TARGET_SPEED: 32,
};

export const GROUND = {
  MAX_WALK: 32,
  SPEED_CAP: 48,
  ACCEL: 1.1,          // + 1.1 per frame from a standstill …
  ACCEL_FALLOFF: 43,   // … minus speed/43, so acceleration tapers near top speed
  OVERSPEED_DECEL: 1,  // above the target speed (e.g. after a long-jump landing)
  RELEASE_DECEL: 1,    // stick released
  TURN_RATE: Math.PI / 16,             // 11.25° per frame toward the stick direction
  TURN_AROUND: (100 / 180) * Math.PI,  // stick held more than ~100° away from facing = "held back"
  SKID_MIN_SPEED: 16,  // …at this speed or more you skid (and can side flip)
  SKID_DECEL: 2,
  TURN_END_FRAMES: 4,  // after the skid you briefly face the new way (side flip still possible)
  WALL_PUSH_SPEED: 6,  // speed cap while pushing against a wall
  SLOPE_ACCEL: 1,      // walking: × sin(slope) along the uphill direction (slower uphill, faster downhill)
  RUN_ANIM_SPEED: 18,  // readout says "Run" at or above this speed
  PUNCH_FRAMES: 10,
  PUNCH_DECEL: 1.5,
};

export const AIR = {
  GRAVITY: 4,
  TERMINAL: -75,
  LONG_JUMP_GRAVITY: 2,
  /** Letting go of jump while still rising faster than this divides vertical speed by 4 (short hops). */
  RELEASE_CUT_ABOVE: 20,
  RELEASE_CUT: 0.25,
  DRAG: 0.35,          // forward speed eases toward 0 by this much per frame …
  STEER_ACCEL: 1.5,    // … and the stick adds up to this along the facing direction
  STEER_TURN: (512 / 65536) * 2 * Math.PI, // ≈ 2.8° per frame of turning for actions that can turn
  STEER_SIDE: 10,      // sideways speed for actions that can't turn (flips, long jump)
  DRAG_ABOVE: 32,      // above this forward speed, lose 1 more per frame
  DRAG_ABOVE_LONG: 48, // long jump keeps its speed
  BACK_CAP: -16,       // backward speed recovers by 2 per frame below this
};

/** Take-off velocities: vy = base + forwardSpeed × fromSpeed; forward speed multiplied/set. */
export const JUMPS = {
  single: { vy: 42, fromSpeed: 0.25, fwdScale: 0.8 },
  double: { vy: 52, fromSpeed: 0.25, fwdScale: 0.8 },
  triple: { vy: 69, fromSpeed: 0, fwdScale: 0.8 },
  backflip: { vy: 62, fwd: -16 },
  sideflip: { vy: 62, fwd: 8 },
  longJump: { vy: 30, fwdScale: 1.5, fwdCap: 48 },
  wallKick: { vy: 62, fwdMin: 24 },
  rollout: { vy: 30 },
  kick: { vy: 20 },
  groundDive: { vy: 20 },
};

export const CHAIN = {
  WINDOW: 5,           // frames after landing in which jump continues the single → double → triple chain
  TRIPLE_MIN_SPEED: 20,
  JUMP_BUFFER: 2,      // convenience: a jump pressed this many frames before touchdown still counts
  LAND_FRAMES: 4,
  LONG_LAND_FRAMES: 6,
};

export const MOVES = {
  CROUCH_SLIDE_WINDOW: 30, // long jump must start within this many frames of the crouch slide
  LONG_JUMP_MIN_SPEED: 10, // and needs more forward speed than this (else it's a plain jump)
  CROUCH_SLIDE_DECEL: 1,
  DIVE_MIN_SPEED: 29,      // ground dive: running at least this fast …
  DIVE_MIN_STICK: 0.75,    // … with the stick pushed at least this far (else it's a punch)
  AIR_DIVE_MIN_SPEED: 28,  // in the air: faster than this dives, otherwise kicks
  DIVE_BOOST: 15,
  DIVE_CAP: 48,
  BELLY_FRICTION: 0.95,
  BELLY_DECEL: 0.5,
  GET_UP_FRAMES: 6,
};

export const POUND = {
  SPIN_FRAMES: 10,     // spin in place, rising a little (20, 18, 16 … units per frame)
  RISE_START: 20,
  RISE_STEP: 2,
  HOLD_FRAMES: 4,      // brief pause at the top before the drop
  DROP_VY: -50,
  STUN_FRAMES: 12,     // can't act for this long after landing
};

export const WALL = {
  BONK_MIN_SPEED: 16,  // in the air, hitting a wall head-on faster than this "sticks" you to it
  HEAD_ON: Math.cos(Math.PI / 4), // facing within 45° of straight into the wall
  CONTACT_FRAMES: 2,   // wall contact: jump during these frames kicks …
  KICK_LATE_FRAMES: 5, // … and so does a jump during the first 5 frames of falling away
  BONK_SPEED: -8,
};

export const LEDGE = {
  PROBE: 60,           // look this far into the wall for a ledge
  MIN_ABOVE: 100,      // ledge height above your feet to grab it
  MAX_ABOVE: 160,
  HANG_MIN_FRAMES: 8,  // hang this long before stick-climb works (jump climbs right away)
  CLIMB_FRAMES: 14,
  QUICK_CLIMB_FRAMES: 8,
  REGRAB_DELAY: 10,
};

export const SLOPE = {
  /** Floors steeper than 38° (normal.y < cos 38°) can't be stood on: you slide. */
  STEEP_NY: 0.7880108,
  ACCEL: 7,            // × sin(slope) per frame down the fall line
  FRICTION: 0.92,
  STEER: 1.2,
  STOP_SPEED: 3,
  SPEED_CAP: 64,
};

/** Falling below this height respawns you. */
export const KILL_Y = -1600;

/** Camera (render side). Angles in radians, rates per second. */
export const CAMERA = {
  DISTANCE: 900,
  PITCH: 0.32,
  PITCH_MIN: 0.05,
  PITCH_MAX: 1.15,
  ORBIT_RATE: 2.6,
  PITCH_RATE: 1.4,
  FOLLOW_RATE: 0.9,      // auto-follow: how fast the camera swings behind a moving hero (at full speed)
  RESET_RATE: 9,
  TARGET_HEIGHT: 110,
  Y_SMOOTH: 6,           // vertical follow smoothing (1/s)
  FOV: 50,
};

export const STORAGE_KEY = 'hhl-config:platformer';
