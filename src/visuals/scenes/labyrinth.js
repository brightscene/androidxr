import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';
import { AFFIRMATIONS, affirmationId } from '../../audio/affirmations.js';

// Space labyrinth: you glide through the corridors of a glowing starship maze.
// Every time you reach a dead end, an affirmation is projected onto the wall
// in front of you with a soft thud (and read aloud). Five seconds later you
// back away down the corridor and go on exploring at different speeds until
// every corner has been found, then a new labyrinth forms around you.
//
// The maze is a "perfect" maze (exactly one route between any two places),
// explored depth-first: forward into each branch, then reversing out of it.

const N = 7;           // cells per side
const C = 4.2;         // cell size (m)
const H = 3.3;         // corridor height
const WALL = 0.3;
const ALL = AFFIRMATIONS.flat();
const EYE = 1.6;

// turn the exploration into flowing flights: each one runs from where you are,
// along the corridors, to the next dead end, where you hover and read the words
function legsOf(events, start) {
  const legs = [];
  let pts = [centre(start)];
  for (const e of events) {
    if (e.type === 'dead') { legs.push({ pts, dead: e }); pts = [centre(e.cell)]; }
    else pts.push(centre(e.cell));
  }
  if (pts.length > 1) legs.push({ pts, dead: null });
  // hover a little short of each dead end's wall, and set off again from there
  for (let i = 0; i < legs.length; i++) {
    const L = legs[i];
    if (!L.dead || L.pts.length < 2) continue;
    const [ax, az] = L.pts[L.pts.length - 2], [bx, bz] = L.pts[L.pts.length - 1];
    const d = Math.hypot(bx - ax, bz - az) || 1;
    const hover = [bx - (bx - ax) / d * 0.6, bz - (bz - az) / d * 0.6];
    L.pts[L.pts.length - 1] = hover;
    if (legs[i + 1]) legs[i + 1].pts[0] = hover;
  }
  for (const L of legs) {
    L.curve = new THREE.CatmullRomCurve3(L.pts.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
    L.curve.arcLengthDivisions = L.pts.length * 120;   // fine enough that the glide speed never stutters
    L.len = L.curve.getLength();
  }
  return legs.filter((L) => L.len > 0.05 || L.dead);
}

function makeMaze(rnd) {
  const open = Array.from({ length: N * N }, () => new Set());   // open neighbours of each cell
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const c = stack[stack.length - 1], x = c % N, y = Math.floor(c / N);
    const nb = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N).map(([a, b]) => b * N + a).filter((n) => !seen.has(n));
    if (!nb.length) { stack.pop(); continue; }
    const n = nb[Math.floor(rnd() * nb.length)];
    open[c].add(n); open[n].add(c); seen.add(n); stack.push(n);
  }
  return open;
}

const centre = (c) => [((c % N) - (N - 1) / 2) * C, (Math.floor(c / N) - (N - 1) / 2) * C];
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// walk the maze depth-first, writing down what to do: go forward into a
// cell, pause at a dead end, or back up into the previous cell
function explore(open, start, rnd) {
  const ev = [];
  const visit = (c, parent) => {
    const kids = [...open[c]].filter((k) => k !== parent).sort(() => rnd() - 0.5);
    if (!kids.length && parent !== -1) ev.push({ type: 'dead', cell: c, from: parent });
    for (const k of kids) { ev.push({ type: 'go', cell: k }); visit(k, c); ev.push({ type: 'back', cell: c }); }
  };
  visit(start, -1);
  while (ev.length && ev[ev.length - 1].type === 'back') ev.pop();   // finish at the last dead end
  return ev;
}

function corridorGeometry(open) {
  const boxes = [];
  const wall = (x, z, w, d) => { const g = new THREE.BoxGeometry(w, H, d); g.translate(x, H / 2, z); boxes.push(g); };
  for (let c = 0; c < N * N; c++) {
    const x = c % N, y = Math.floor(c / N), [cx, cz] = centre(c);
    if (x === N - 1 || !open[c].has(c + 1)) wall(cx + C / 2, cz, WALL, C + WALL);
    if (y === N - 1 || !open[c].has(c + N)) wall(cx, cz + C / 2, C + WALL, WALL);
    if (x === 0) wall(cx - C / 2, cz, WALL, C + WALL);
    if (y === 0) wall(cx, cz - C / 2, C + WALL, WALL);
  }
  const floor = new THREE.PlaneGeometry(N * C + 1, N * C + 1).rotateX(-Math.PI / 2);
  const ceil = new THREE.PlaneGeometry(N * C + 1, N * C + 1).rotateX(Math.PI / 2); ceil.translate(0, H, 0);
  const parts = [...boxes, floor, ceil].map((g) => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal']) {
    const total = parts.reduce((s, g) => s + g.attributes[name].array.length, 0);
    const arr = new Float32Array(total); let off = 0;
    for (const g of parts) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

export class LabyrinthScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uPulse: { value: 0 }, uHue: { value: Math.random() }, uSpot: { value: new THREE.Vector4(0, 0, 0, 0) }, uDim: { value: 1 } });
    this.maze = new THREE.Group();
    // the drone: a rig at eye height that banks into turns and hovers gently
    this.rig = new THREE.Group();
    this.rig.position.y = EYE;
    this.rig.add(this.maze);
    this.group.add(this.rig);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying float vD;
        void main(){ vP = position; vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uDim, uTime, uFade, uPulse, uBreath, uEnergy, uHue; uniform vec4 uSpot; varying vec3 vP; varying vec3 vN; varying float vD;
        ${NOISE} ${GRADE}
        vec3 aura(float t){ t = fract(t);
          vec3 a = vec3(0.42, 0.22, 0.95), b = vec3(0.1, 0.75, 0.85), c = vec3(0.85, 0.25, 0.7);
          return t < 0.333 ? mix(a, b, t * 3.0) : (t < 0.667 ? mix(b, c, t * 3.0 - 1.0) : mix(c, a, t * 3.0 - 2.0)); }
        void main(){
          vec3 n = normalize(vN);
          vec3 c = vec3(0.012, 0.012, 0.035);
          float alpha = 1.0;
          float flow = uTime * 0.05 + uHue;
          if (abs(n.y) < 0.5) {                           // walls: panels, seams and light strips
            float u = dot(vP.xz, vec2(-n.z, n.x));
            float seamU = smoothstep(0.035, 0.0, abs(fract(u / 1.4) - 0.5) - 0.465);
            float seamV = smoothstep(0.03, 0.0, abs(vP.y - 0.55) - 0.0) + smoothstep(0.03, 0.0, abs(vP.y - 2.75));
            vec3 col = aura(u * 0.03 + vP.y * 0.04 + flow);
            float panel = fbm(vec3(floor(u / 1.4) * 1.7, floor(vP.y / 1.1), 0.0));
            c += col * 0.05 * (0.6 + panel);
            c += col * (seamU * 0.35 + seamV * 0.5) * (0.7 + uPulse * 0.6);
            float strip = exp(-pow((vP.y - 0.12) * 18.0, 2.0)) + exp(-pow((vP.y - H_TOP) * 18.0, 2.0));
            float travel = 0.6 + 0.4 * sin(u * 1.2 - uTime * 2.0);
            c += col * strip * travel * (1.1 + uPulse * 0.8 + uBreath * 0.2);
            // the projector glow on the wall where an affirmation appears
            float sp = length(vec3(vP.x - uSpot.x, (vP.y - 1.65) * 1.6, vP.z - uSpot.z));
            c += vec3(0.75, 0.7, 1.0) * exp(-sp * sp * 0.6) * uSpot.w * 0.6;
          } else if (n.y > 0.5) {                         // floor: dark and glossy with faint guide lines
            vec2 g = abs(fract(vP.xz / ${C.toFixed(2)} + 0.5) - 0.5) * ${C.toFixed(2)};
            float guide = smoothstep(0.05, 0.0, abs(min(g.x, g.y) - 0.0)) ;
            c += aura(vP.x * 0.02 + vP.z * 0.02 + flow) * smoothstep(0.06, 0.0, abs(min(g.x, g.y))) * 0.35;
            c += aura(flow + 0.3) * 0.025 * fbm(vec3(vP.xz * 0.7, 0.0));
          } else {                                        // ceiling with round skylights onto the stars
            vec2 g = (fract(vP.xz / ${C.toFixed(2)} + 0.5) - 0.5) * ${C.toFixed(2)};
            float r = length(g);
            alpha = smoothstep(0.85, 0.95, r);
            c += aura(flow + 0.6) * exp(-pow((r - 0.95) * 14.0, 2.0)) * (0.6 + uPulse * 0.5);
          }
          c = mix(c, vec3(0.005, 0.005, 0.02), smoothstep(6.0, 26.0, vD));
          if (alpha < 0.01) discard;
          gl_FragColor = vec4(grade(c * (0.9 + uEnergy * 0.2)) * uDim, alpha * uFade);
        }`.replace('H_TOP', (H - 0.12).toFixed(2)),
    });
    this.text = textPlane(U, 2.8, 0.42);
    this.text.material.depthTest = true;
    this.maze.add(this.text);
    this.maze.add(particles(U, { count: 700, min: [-N * C / 2, 0.2, -N * C / 2], max: [N * C / 2, H - 0.2, N * C / 2], vel: [0, 0.03, 0], sway: 0.3, size: [0.01, 0.025], colors: ['#d8ccff', '#a8f3ff', '#ffd0f0'], alpha: 0.6 }));
    this.used = new Set();
    this._newMaze();
  }

  _newMaze() {
    const rnd = Math.random;
    this.open = makeMaze(rnd);
    if (this.mesh) { this.maze.remove(this.mesh); this.mesh.geometry.dispose(); }
    this.mesh = new THREE.Mesh(corridorGeometry(this.open), this.mat);
    this.mesh.frustumCulled = false;
    this.maze.add(this.mesh);
    const start = Math.floor(rnd() * N * N);
    this.legs = legsOf(explore(this.open, start, rnd), start);
    const [x, z] = centre(start);
    this.pose = { x, z, yaw: 0 };
    this.leg = null; this.state = 'next'; this.s = 0; this.v = 0; this.w = 0; this.roll = 0;
    if (this.legs[0]) { const t = this.legs[0].curve.getTangentAt(0); this.pose.yaw = yawTo(t.x, t.z); }
    this.uniforms.uHue.value = Math.random();
  }

  onEvent(e) {
    if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.5 : 0.15));
  }

  _sfx(kind, opts) { if (this.fade > 0.5) SFX.play(kind, opts); }

  _pick() {
    let pool = ALL.filter((t) => !this.used.has(t));
    if (!pool.length) { this.used.clear(); pool = ALL; }
    const t = pool[Math.floor(Math.random() * pool.length)];
    this.used.add(t);
    return t;
  }

  _aim(L, s) {
    // where to look: a little way ahead along the flight path
    const p = L.curve.getPointAt(Math.min(1, (s + 1.4) / L.len));
    const P = this.pose;
    const dx = p.x - P.x, dz = p.z - P.z;
    return Math.hypot(dx, dz) > 0.05 ? yawTo(dx, dz) : P.yaw;
  }

  update(dt, t) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.2);
    U.uDim.value = damp(U.uDim.value, this.state === 'swap' ? 0 : 1, 2.2, dt);
    const P = this.pose;
    let yawTarget = null;

    if (this.state === 'next') {
      this.leg = this.legs.shift();
      if (!this.leg) { this.state = 'swap'; }
      else { if (this.leg.pts.length && this.prevDead) this.v = 0; this.state = 'fly'; this.s = 0; this.cruise = [1.1, 1.5, 1.9, 2.3][Math.floor(Math.random() * 4)]; }
    }

    if (this.state === 'swap') {
      // finished this maze: dim softly, then fade up inside a new one
      if (U.uDim.value < 0.02) this._newMaze();
    } else if (this.state === 'fly') {
      const L = this.leg;
      const rem = L.len - this.s;
      // ease off into bends, and glide to a gentle stop before each dead end
      const t0 = L.curve.getTangentAt(Math.min(1, this.s / L.len)), t1 = L.curve.getTangentAt(Math.min(1, (this.s + 2.5) / L.len));
      const bend = Math.acos(Math.max(-1, Math.min(1, t0.dot(t1))));
      let target = this.cruise * (1 - 0.55 * Math.min(1, bend / (Math.PI / 2)));
      this.v = damp(this.v, target, 0.9, dt);
      if (L.dead) this.v = Math.min(this.v, Math.sqrt(2 * 0.28 * Math.max(0, rem)) + 0.004);
      this.s = Math.min(L.len, this.s + this.v * dt);
      const p = L.curve.getPointAt(this.s / L.len);
      P.x = p.x; P.z = p.z;
      yawTarget = this._aim(L, this.s);
      if (L.len - this.s < 0.002) {
        this.prevDead = !!L.dead;
        if (L.dead) this._arrive(L.dead); else this.state = 'next';
      }
    } else if (this.state === 'hover') {
      this.h += dt;
      const a = Math.min(1, this.h / 0.8) * (1 - Math.max(0, this.h - 5.6) / 0.8);
      this.text.material.uniforms.uA.value = Math.max(0, a);
      U.uSpot.value.set(this.wall[0], 0, this.wall[1], Math.max(0, a));
      yawTarget = this.face;
      if (this.h >= 6.2) {
        this.text.material.uniforms.uA.value = 0; U.uSpot.value.w = 0;
        // a slow, graceful about-turn
        this.state = 'turn'; this.h = 0; this.y0 = P.yaw; this.dir = Math.random() < 0.5 ? 1 : -1;
      }
    } else if (this.state === 'turn') {
      this.h += dt;
      const k = Math.min(1, this.h / 4.5), e = k * k * k * (k * (k * 6 - 15) + 10);
      const prev = P.yaw;
      P.yaw = this.y0 + this.dir * Math.PI * e;
      this.w = (P.yaw - prev) / Math.max(dt, 1e-3);
      if (k >= 1) { this.w = 0; this.state = 'next'; }
    }

    if (yawTarget !== null) {
      // turn like a drone: smoothly, never faster than a gentle maximum
      const dy = wrap(yawTarget - P.yaw);
      const wT = Math.max(-0.75, Math.min(0.75, dy * 1.4));
      this.w = damp(this.w, wT, 2.0, dt);
      P.yaw += this.w * dt;
    }
    // bank softly into turns, and hover with a slight float
    this.roll = damp(this.roll, Math.max(-0.07, Math.min(0.07, -this.w * 0.09)), 2.5, dt);
    this.rig.rotation.z = this.roll;
    this.rig.position.y = EYE + Math.sin(t * 0.7) * 0.025;
    // place the maze so that the drone's viewpoint sits at your eyes, facing ahead
    this.maze.rotation.y = -P.yaw;
    this.maze.position.set(-P.x, -EYE, -P.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -P.yaw);
    this.maze.position.y = -EYE;
  }

  _arrive(e) {
    // hover in front of the dead end; the words appear on its wall
    const [cx, cz] = centre(e.cell), [fx, fz] = centre(e.from);
    const dx = Math.sign(cx - fx), dz = Math.sign(cz - fz);
    const wx = cx + dx * (C / 2 - WALL / 2 - 0.03), wz = cz + dz * (C / 2 - WALL / 2 - 0.03);
    const words = this._pick();
    this.text.userData.set(words);
    this.text.position.set(wx, 1.65, wz);
    this.text.rotation.set(0, Math.atan2(-dx, -dz), 0);
    this.wall = [wx, wz];
    this.face = yawTo(dx, dz);
    this.state = 'hover'; this.h = 0;
    this._sfx('thud', { pan: 0, decay: 0.55, gain: 1.0 });
    const id = affirmationId(words);
    if (id && this.fade > 0.5) setTimeout(() => SFX.say(id, 0, words), 600);
  }
}
