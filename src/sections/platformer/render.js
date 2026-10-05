/**
 * render.js — three.js view of the course and the hero, plus the follow camera.
 *
 * three.js (r128, classic UMD build, vendored in /vendor/three) is loaded lazily with a <script> tag
 * the first time this page opens; it defines window.THREE. Nothing here runs in the simulation: the
 * renderer only reads game state, interpolating the hero between the last two 30 Hz frames.
 *
 * Course units are drawn at 1/100 scale (the 160-unit hero is 1.6 three.js units tall).
 * Colors come from the app's theme tokens (css/tokens.css) and are re-read when the theme changes.
 *
 * The hero is an original round mascot built from primitives: a lavender ball with a cream belly, big
 * eyes, yellow mitts, red boots and a little antenna with a blue bulb.
 */
import { CAMERA } from './constants.js';
import { wrapAngle } from './hero.js';

const THREE_URL = new URL('../../../vendor/three/three.min.js', import.meta.url).href;
const S = 0.01; // course units → three.js units

let threePromise = null;
/** Load three.js once per page lifetime. Resolves to window.THREE. */
export function loadThree() {
  if (window.THREE) return Promise.resolve(window.THREE);
  if (!threePromise) {
    threePromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = THREE_URL;
      s.async = true;
      s.onload = () => (window.THREE ? resolve(window.THREE) : reject(new Error('three.js did not load')));
      s.onerror = () => reject(new Error(`Failed to load ${THREE_URL}`));
      document.head.append(s);
    });
    threePromise.catch(() => { threePromise = null; });
  }
  return threePromise;
}

const lerp = (a, b, k) => a + (b - a) * k;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const ease = (v) => { const k = clamp01(v); return k * k * (3 - 2 * k); };

/** Third-person follow camera (pure math; three.js camera is positioned from it). */
export class FollowCamera {
  constructor(hero) {
    this.yaw = hero.yaw;
    this.pitch = CAMERA.PITCH;
    this.target = { x: hero.pos.x, y: hero.pos.y + CAMERA.TARGET_HEIGHT, z: hero.pos.z };
    this.resetting = false;
    this.pos = { x: 0, y: 0, z: 0 };
  }

  reset() { this.resetting = true; }

  snap(hero) {
    this.yaw = hero.yaw;
    this.target = { x: hero.pos.x, y: hero.pos.y + CAMERA.TARGET_HEIGHT, z: hero.pos.z };
    this.resetting = false;
  }

  /**
   * @param {number} dt seconds
   * @param {{x,y,z}} p interpolated hero position;  heroYaw, speed (units/frame), grounded
   * @param {{rx:number, ry:number}} stick right stick
   * @param {{autoCamera:boolean, invertX:boolean, invertY:boolean}} opt
   */
  update(dt, p, heroYaw, speed, grounded, stick, opt, course) {
    const rx = Math.abs(stick.rx) > 0.15 ? stick.rx : 0;
    const ry = Math.abs(stick.ry) > 0.15 ? stick.ry : 0;
    if (rx || ry) this.resetting = false;
    this.yaw = wrapAngle(this.yaw - rx * CAMERA.ORBIT_RATE * dt * (opt.invertX ? -1 : 1));
    this.pitch = Math.max(CAMERA.PITCH_MIN, Math.min(CAMERA.PITCH_MAX, this.pitch - ry * CAMERA.PITCH_RATE * dt * (opt.invertY ? -1 : 1)));
    const d = wrapAngle(heroYaw - this.yaw);
    if (this.resetting) {
      this.yaw = wrapAngle(this.yaw + d * Math.min(1, CAMERA.RESET_RATE * dt));
      this.pitch = lerp(this.pitch, CAMERA.PITCH, Math.min(1, CAMERA.RESET_RATE * dt));
      if (Math.abs(d) < 0.01) this.resetting = false;
    } else if (opt.autoCamera && !rx && speed > 4 && Math.abs(d) < 2.4) {
      // Swing lazily behind the hero while running (not when running toward the camera).
      this.yaw = wrapAngle(this.yaw + d * Math.min(1, CAMERA.FOLLOW_RATE * dt * Math.min(1, speed / 32)));
    }
    this.target.x = p.x; this.target.z = p.z;
    const ty = p.y + CAMERA.TARGET_HEIGHT;
    // Vertical: follow lazily in the air (jumps don't jolt the view), faster on the ground.
    const rate = grounded ? CAMERA.Y_SMOOTH : CAMERA.Y_SMOOTH * 0.35;
    this.target.y = lerp(this.target.y, ty, Math.min(1, rate * dt));
    if (Math.abs(this.target.y - ty) > 900) this.target.y = ty;
    const h = CAMERA.DISTANCE * Math.cos(this.pitch);
    this.pos.x = this.target.x - Math.sin(this.yaw) * h;
    this.pos.z = this.target.z - Math.cos(this.yaw) * h;
    this.pos.y = this.target.y + CAMERA.DISTANCE * Math.sin(this.pitch);
    // Light collision: never below the floor under the camera.
    const f = course.findFloor(this.pos.x, this.pos.z, this.pos.y + 200);
    if (f && this.pos.y < f.y + 40) this.pos.y = f.y + 40;
  }
}

/** Resolve a theme color string (hex / rgb()) into a THREE.Color, with a fallback. */
function color(THREE, css, fallback) {
  const c = new THREE.Color(fallback);
  try { if (css) c.setStyle(css); } catch { /* keep fallback */ }
  return c;
}

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {typeof window.THREE} THREE
   * @param {import('./game.js').Game} game
   */
  constructor(canvas, THREE, game, theme) {
    this.THREE = THREE;
    this.canvas = canvas;
    this.game = game;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAMERA.FOV, 16 / 9, 0.1, 200);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.75);
    this.sun = new THREE.DirectionalLight(0xffffff, 0.75);
    this.sun.position.set(6, 12, 4);
    this.scene.add(this.hemi, this.sun);
    this.disposables = [];
    this.runPhase = 0;
    this.buildCourse();
    this.buildHero();
    this.setTheme(theme);
  }

  track(x) { this.disposables.push(x); return x; }

  mat(colorHex) {
    return this.track(new this.THREE.MeshLambertMaterial({ color: colorHex }));
  }

  // ---- Course --------------------------------------------------------------------------------------

  buildCourse() {
    const THREE = this.THREE;
    const course = this.game.course;
    this.courseMats = {};
    this.edgeMat = this.track(new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
    const group = new THREE.Group();
    for (const s of course.solids) {
      const key = s.color || 'accent';
      const m = this.courseMats[key] || (this.courseMats[key] = this.mat(0x888888));
      const geom = this.track(solidGeometry(THREE, course, s));
      const mesh = new THREE.Mesh(geom, m);
      group.add(mesh);
      if (key !== 'ground') {
        const edges = this.track(new THREE.EdgesGeometry(geom, 25));
        group.add(new THREE.LineSegments(edges, this.edgeMat));
      }
    }
    // A grid on the ground for a sense of speed and distance (2 m = 200 units per cell).
    const ground = course.solids.find((s) => s.color === 'ground');
    if (ground) {
      const size = (ground.max[0] - ground.min[0]) * S;
      this.grid = new THREE.GridHelper(size, Math.round(size / 2), 0x000000, 0x000000);
      this.grid.position.set((ground.min[0] + ground.max[0]) * S / 2, ground.max[1] * S + 0.005, (ground.min[2] + ground.max[2]) * S / 2);
      this.grid.material.transparent = true;
      this.grid.material.opacity = 0.12;
      this.track(this.grid.geometry); this.track(this.grid.material);
      group.add(this.grid);
    }
    this.scene.add(group);
  }

  // ---- Hero ----------------------------------------------------------------------------------------

  buildHero() {
    const THREE = this.THREE;
    const sphere = this.track(new THREE.SphereGeometry(1, 24, 16));
    const ball = (m, r, x, y, z, sx = 1, sy = 1, sz = 1) => {
      const mesh = new THREE.Mesh(sphere, m);
      mesh.position.set(x, y, z);
      mesh.scale.set(r * sx, r * sy, r * sz);
      return mesh;
    };
    this.heroMats = {
      body: this.mat(0x8e7cc3), belly: this.mat(0xfff3d6), white: this.mat(0xffffff), pupil: this.mat(0x1b1a22),
      hands: this.mat(0xf4b41a), feet: this.mat(0xe23b3b), bulb: this.mat(0x2f6bd8),
    };
    const M = this.heroMats;
    const CENTER = 0.62; // spin pivot height (body center)
    const root = new THREE.Group();        // at the feet, rotated to the facing
    const spin = new THREE.Group();        // pivot at the body center: flips and leans
    spin.position.y = CENTER;
    const torso = new THREE.Group();       // squash & stretch
    torso.add(
      ball(M.body, 0.48, 0, 0, 0, 1, 1.04, 1),
      ball(M.belly, 0.34, 0, -0.08, 0.2, 1, 1.05, 0.7),
      ball(M.white, 0.12, -0.16, 0.17, 0.39, 1, 1.25, 0.6),
      ball(M.white, 0.12, 0.16, 0.17, 0.39, 1, 1.25, 0.6),
      ball(M.pupil, 0.06, -0.16, 0.18, 0.46, 1, 1.3, 0.6),
      ball(M.pupil, 0.06, 0.16, 0.18, 0.46, 1, 1.3, 0.6),
    );
    const stalkGeom = this.track(new THREE.CylinderGeometry(0.025, 0.03, 0.26, 8));
    const stalk = new THREE.Mesh(stalkGeom, M.body);
    stalk.position.set(0, 0.6, -0.04);
    stalk.rotation.x = -0.25;
    torso.add(stalk, ball(M.bulb, 0.085, 0, 0.74, -0.08));
    const handL = ball(M.hands, 0.12, 0.5, -0.08, 0.04);
    const handR = ball(M.hands, 0.12, -0.5, -0.08, 0.04);
    const footL = ball(M.feet, 0.16, 0.2, -CENTER + 0.09, 0.05, 1, 0.6, 1.35);
    const footR = ball(M.feet, 0.16, -0.2, -CENTER + 0.09, 0.05, 1, 0.6, 1.35);
    spin.add(torso, handL, handR, footL, footR);
    root.add(spin);
    this.hero = { root, spin, torso, handL, handR, footL, footR, CENTER };
    this.scene.add(root);

    // Blob shadow: a soft dark disc on the floor under the hero (depth cue for jumps).
    const shadowGeom = this.track(new THREE.CircleGeometry(0.42, 24));
    this.shadowMat = this.track(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.shadow = new THREE.Mesh(shadowGeom, this.shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.scene.add(this.shadow);
  }

  setTheme(th = {}) {
    const THREE = this.THREE;
    const c = (css, fb) => color(THREE, css, fb);
    const bg = c(th.sunken, 0x16151c);
    this.scene.background = bg;
    this.scene.fog = new THREE.Fog(bg, 22, 75);
    const light = !!th.light;
    this.hemi.color = c(th.surface, 0xffffff).lerp(new THREE.Color(0xffffff), 0.6);
    this.hemi.groundColor = c(th.sunken, 0x333333);
    this.hemi.intensity = light ? 0.85 : 0.7;
    this.sun.intensity = light ? 0.7 : 0.8;
    const accent = c(th.accent, 0x8e7cc3);
    const tones = {
      red: c(th.red, 0xe23b3b), yellow: c(th.yellow, 0xf4b41a), blue: c(th.blue, 0x2f6bd8), green: c(th.green, 0x23a35a), accent,
      ground: c(th.surface3 || th.surface, 0x2a2833).lerp(c(th.green, 0x23a35a), light ? 0.35 : 0.28),
    };
    for (const [k, m] of Object.entries(this.courseMats)) m.color = tones[k] || accent;
    const line = light ? 0x000000 : 0xffffff;
    this.edgeMat.color = new THREE.Color(line);
    this.edgeMat.opacity = light ? 0.22 : 0.18;
    if (this.grid) { this.grid.material.color = new THREE.Color(line); this.grid.material.opacity = light ? 0.12 : 0.08; }
    // The mascot keeps its own Super Famicom colors, lifted a little on dark backgrounds.
    this.heroMats.body.color = accent;
    this.heroMats.hands.color = tones.yellow;
    this.heroMats.feet.color = tones.red;
    this.heroMats.bulb.color = tones.blue;
  }

  resize(w, h) {
    if (!w || !h) return;
    if (this.size?.w === w && this.size?.h === h) return;
    this.size = { w, h };
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Interpolated hero position/yaw for display. */
  heroView(alpha) {
    const hero = this.game.hero;
    return {
      x: lerp(hero.prev.x, hero.pos.x, alpha), y: lerp(hero.prev.y, hero.pos.y, alpha), z: lerp(hero.prev.z, hero.pos.z, alpha),
      yaw: hero.prevYaw + wrapAngle(hero.yaw - hero.prevYaw) * alpha,
    };
  }

  /** Draw one frame. alpha: 0..1 between the previous and current sim frame. */
  render(alpha, cam, dt) {
    const hero = this.game.hero;
    const v = this.heroView(alpha);
    const H = this.hero;
    H.root.position.set(v.x * S, v.y * S, v.z * S);
    H.root.rotation.y = v.yaw;
    this.pose(hero, alpha, dt);

    const f = this.game.course.findFloor(hero.pos.x, hero.pos.z, hero.pos.y + 1);
    if (f && !(hero.action === 'ledgeHang' || hero.action === 'ledgeClimb')) {
      const hgt = Math.max(0, v.y - f.y);
      this.shadow.visible = true;
      this.shadow.position.set(v.x * S, f.y * S + 0.01, v.z * S);
      const k = Math.max(0.35, 1 - hgt / 1200);
      this.shadow.scale.set(k, k, k);
      this.shadowMat.opacity = 0.28 * k;
    } else {
      this.shadow.visible = false;
    }

    this.camera.position.set(cam.pos.x * S, cam.pos.y * S, cam.pos.z * S);
    this.camera.lookAt(cam.target.x * S, cam.target.y * S, cam.target.z * S);
    this.gl.render(this.scene, this.camera);
  }

  /** Procedural animation from the action and its frame counter. */
  pose(hero, alpha, dt) {
    const H = this.hero;
    const tt = hero.t + alpha;
    let pitch = 0; let roll = 0; let lift = 0;
    let sy = 1; let sxz = 1;
    let handsUp = 0; let punch = 0; let stride = 0;
    const sp = hero.speed;
    switch (hero.action) {
      case 'walk': case 'decel': case 'land': case 'turnEnd':
        stride = Math.min(1, sp / 20);
        pitch = Math.min(0.3, sp / 110);
        if (hero.action === 'land' && hero.t < 2) { sy = 0.86; sxz = 1.08; }
        break;
      case 'skid': pitch = -0.35; stride = 0.2; break;
      case 'crouch': sy = 0.72; sxz = 1.12; break;
      case 'crouchSlide': sy = 0.72; sxz = 1.12; pitch = 0.2; break;
      case 'punch': punch = Math.sin(clamp01(tt / 10) * Math.PI); break;
      case 'jump': pitch = 0.15; handsUp = 0.4; break;
      case 'double': pitch = 0.1; handsUp = 1; break;
      case 'triple': pitch = Math.PI * 2 * ease(tt / 22); sy = 0.92; break;
      case 'backflip': pitch = -Math.PI * 2 * ease(tt / 22); break;
      case 'sideflip': roll = Math.PI * 2 * ease(tt / 20); handsUp = 0.6; break;
      case 'longJump': pitch = 1.0; handsUp = 0.8; sy = 1.08; break;
      case 'wallKick': pitch = -0.15; handsUp = 0.7; break;
      case 'freefall': handsUp = 0.5; break;
      case 'rollout': pitch = Math.PI * 2 * ease(tt / 12); sy = 0.9; break;
      case 'kick': pitch = -0.25; break;
      case 'dive': pitch = 1.25; handsUp = 1; break;
      case 'bellySlide': pitch = Math.PI / 2; lift = -0.3; handsUp = 1; break;
      case 'getUp': pitch = (Math.PI / 2) * (1 - ease(tt / 6)); lift = -0.3 * (1 - ease(tt / 6)); break;
      case 'bonk': pitch = -0.45; break;
      case 'wallHit': sxz = 1.05; sy = 0.95; pitch = -0.1; handsUp = 0.5; break;
      case 'groundPound':
        if (hero.t < 10) pitch = Math.PI * 2 * (tt / 10);
        else if (hero.t < 14) { sy = 0.9; sxz = 1.05; } else { sy = 1.12; sxz = 0.94; }
        break;
      case 'poundLand': {
        const k = ease(tt / 6);
        sy = lerp(0.6, 1, k); sxz = lerp(1.25, 1, k);
        break;
      }
      case 'slide': pitch = -0.45; lift = -0.12; handsUp = 0.3; break;
      case 'ledgeHang': handsUp = 1.4; break;
      case 'ledgeClimb': handsUp = 1.2; pitch = 0.35; break;
      default: break;
    }
    // Run cycle advances with distance covered.
    this.runPhase += (stride ? sp : 0) * dt * 30 * 0.045;
    const ph = this.runPhase;
    const swing = Math.sin(ph) * 0.2 * stride;
    H.spin.position.y = H.CENTER + lift + Math.abs(Math.sin(ph)) * 0.05 * stride;
    H.spin.rotation.set(pitch, 0, roll);
    H.torso.scale.set(sxz, sy, sxz);
    H.torso.position.y = (sy - 1) * 0.48;
    H.footL.position.z = 0.05 + swing; H.footR.position.z = 0.05 - swing;
    H.footL.position.y = -H.CENTER + 0.09 + Math.max(0, Math.cos(ph)) * 0.08 * stride + (1 - sy) * 0.3;
    H.footR.position.y = -H.CENTER + 0.09 + Math.max(0, -Math.cos(ph)) * 0.08 * stride + (1 - sy) * 0.3;
    const hy = -0.08 + handsUp * 0.45;
    H.handL.position.set(0.5 - handsUp * 0.12, hy, 0.04 - swing * 0.8);
    H.handR.position.set(-0.5 + handsUp * 0.12, hy, 0.04 + swing * 0.8 + punch * 0.45);
  }

  destroy() {
    for (const d of this.disposables) d.dispose?.();
    this.disposables = [];
    this.gl.dispose();
    this.gl.forceContextLoss?.();
  }
}

/**
 * Geometry for a box or ramp: an 8-corner hull whose top corners follow the solid's top surface,
 * as flat-shaded triangles (non-indexed, so every face gets its own normal).
 */
function solidGeometry(THREE, course, s) {
  const [x0, y0, z0] = s.min; const [x1, , z1] = s.max;
  const top = (x, z) => course.top(s, x, z);
  const P = {
    a: [x0, y0, z0], b: [x1, y0, z0], c: [x1, y0, z1], d: [x0, y0, z1],
    e: [x0, top(x0, z0), z0], f: [x1, top(x1, z0), z0], g: [x1, top(x1, z1), z1], k: [x0, top(x0, z1), z1],
  };
  // Quads wound counter-clockwise seen from outside.
  const quads = [
    ['e', 'k', 'g', 'f'], // top
    ['a', 'b', 'c', 'd'], // bottom
    ['a', 'e', 'f', 'b'], // −z side
    ['d', 'c', 'g', 'k'], // +z side
    ['a', 'd', 'k', 'e'], // −x side
    ['b', 'f', 'g', 'c'], // +x side
  ];
  const pos = [];
  for (const [p, q, r, t] of quads) {
    for (const n of [p, q, r, p, r, t]) pos.push(P[n][0] * S, P[n][1] * S, P[n][2] * S);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.computeVertexNormals();
  return geom;
}
