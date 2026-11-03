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
    Object.assign(U, { uPulse: { value: 0 }, uHue: { value: Math.random() }, uSpot: { value: new THREE.Vector4(0, 0, 0, 0) } });
    this.maze = new THREE.Group();
    this.group.add(this.maze);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: /* glsl */ `varying vec3 vP; varying vec3 vN; varying float vD;
        void main(){ vP = position; vN = normal; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uPulse, uBreath, uEnergy, uHue; uniform vec4 uSpot; varying vec3 vP; varying vec3 vN; varying float vD;
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
          gl_FragColor = vec4(grade(c * (0.9 + uEnergy * 0.2)), alpha * uFade);
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
    this.events = explore(this.open, start, rnd);
    const [x, z] = centre(start);
    const first = this.events.find((e) => e.type === 'go');
    const [fx, fz] = first ? centre(first.cell) : [x, z - 1];
    this.pose = { x, z, yaw: yawTo(fx - x, fz - z) };
    this.cell = start;
    this.cur = null;
    this.speed = 0; this.runSpeed = 2;
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

  // does the step after this one need us to stop (a corner, a change between
  // forward and reverse, or a dead end)? If not, keep gliding through.
  _stopsAfter(e) {
    const next = this.events[0];
    if (!next || next.type === 'dead' || next.type !== e.type) return true;
    const [px, pz] = centre(this.cell), [ax, az] = centre(e.cell), [bx, bz] = centre(next.cell);
    return Math.sign(ax - px) !== Math.sign(bx - ax) || Math.sign(az - pz) !== Math.sign(bz - az);
  }

  update(dt, t) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.2);
    const P = this.pose;
    let spot = 0;
    if (!this.cur) {
      const e = this.events.shift();
      if (!e) { this._newMaze(); return; }
      this.cur = { ...e, t: 0, idx: 0 };
      if (e.type === 'go' || e.type === 'back') {
        const [cx, cz] = centre(e.cell), [px, pz] = centre(this.cell);
        // forward: face where you're going; reverse: keep facing the way you came from
        this.cur.yaw = e.type === 'go' ? yawTo(cx - px, cz - pz) : yawTo(px - cx, pz - cz);
        this.cur.turning = Math.abs(wrap(this.cur.yaw - P.yaw)) > 0.05;
        if (this.cur.turning || this.speed < 0.2) this.runSpeed = [1.2, 2.2, 3.4, 4.8][Math.floor(Math.random() * 4)];
        this.cur.stop = this._stopsAfter(e);
      } else {
        const [cx, cz] = centre(e.cell), [fx, fz] = centre(e.from);
        const dx = Math.sign(cx - fx), dz = Math.sign(cz - fz);
        const wx = cx + dx * (C / 2 - WALL / 2 - 0.03), wz = cz + dz * (C / 2 - WALL / 2 - 0.03);
        const words = this._pick();
        this.text.userData.set(words);
        this.text.position.set(wx, 1.65, wz);
        this.text.rotation.set(0, Math.atan2(-dx, -dz), 0);   // facing back toward you
        this.cur.wall = [wx, wz];
        this._sfx('thud', { pan: 0, decay: 0.55, gain: 1.6 });
        const id = affirmationId(words);
        if (id && this.fade > 0.5) setTimeout(() => SFX.say(id, 0, words), 350);
      }
    }
    const c = this.cur;
    c.t += dt;
    if (c.type === 'dead') {
      // hold for five seconds with the words on the wall
      const a = Math.min(1, c.t / 0.5) * (1 - Math.max(0, c.t - 5.2) / 0.6);
      this.text.material.uniforms.uA.value = a;
      spot = a;
      U.uSpot.value.set(c.wall[0], 0, c.wall[1], spot);
      this.speed = 0;
      if (c.t >= 5.8) { this.text.material.uniforms.uA.value = 0; U.uSpot.value.w = 0; this.cur = null; }
    } else {
      const dy = wrap(c.yaw - P.yaw);
      if (Math.abs(dy) > 0.02 && c.turning) {
        // turn gently on the spot
        this.speed = damp(this.speed, 0, 6, dt);
        P.yaw += Math.sign(dy) * Math.min(Math.abs(dy), dt * (0.35 + Math.min(1, Math.abs(dy)) * 0.9));
      } else {
        P.yaw = c.yaw; c.turning = false;
        const [tx, tz] = centre(c.cell);
        const dist = Math.hypot(tx - P.x, tz - P.z);
        const target = c.stop ? Math.min(this.runSpeed, 0.4 + dist * 1.1) : this.runSpeed;
        this.speed = damp(this.speed, target, 2.2, dt);
        const step = Math.min(dist, this.speed * dt);
        if (dist > 1e-4) { P.x += (tx - P.x) / dist * step; P.z += (tz - P.z) / dist * step; }
        if (dist - step < 0.01) { P.x = tx; P.z = tz; this.cell = c.cell; this.cur = null; }
      }
    }
    // place the maze so that the travelling viewpoint sits at your feet, facing ahead
    this.maze.rotation.y = -P.yaw;
    this.maze.position.set(-P.x, 0, -P.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -P.yaw);
  }
}
