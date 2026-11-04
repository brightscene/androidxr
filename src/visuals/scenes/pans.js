import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, INPUT } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';
import { strikeVoice, bellOut } from './bells.js';

// ===================================================================== Handpan & Space steel drums
// Instruments you play with your fingertips (or point and tap).
//
// Handpan: a hand-hammered handpan floating at your waist on a mountain
// terrace at dusk, prayer flags stirring. It's tuned to the monks' chant: its
// centre "ding" and the eight tone fields round it are the 2nd to 10th
// harmonics of the low C the monks chant on (65.41 Hz), so anything you play
// rings in tune with the chant.
//
// Space steel drums: a chrome steel pan adrift among the stars. Its pads sing
// with the long, beating voice of a Tibetan singing bowl.
//
// Strike a note and its harmonics spread across the instrument as rings of
// coloured light, one colour for each partial.

const F0 = 65.41;   // the monks' chant note, C2

const KINDS = {
  handpan: {
    R: 0.26, dome: 0.085,
    // the ding, then the tone fields zigzagging round from the side nearest you
    notes: [{ h: 2, r: 0, s: 0.07 }, ...[3, 4, 5, 6, 7, 8, 9, 10].map((h, i) => ({ h, r: 0.172, s: 0.052 - i * 0.002, a: Math.PI / 2 + (i % 2 ? 1 : -1) * (0.39 + Math.floor(i / 2) * 0.785) }))],
    freq: (n) => F0 * n.h,
    // a handpan note: fundamental, its octave and compound fifth, gently beating
    partials: [[1, 1, 5, 0.5], [2, 0.42, 3.2, 0.35], [3, 0.26, 2.2, 0], [4.02, 0.06, 1.0, 0]],
    attack: 0.012, click: 3, clickGain: 0.25,
    label: (n) => (n.r === 0 ? 'ding' : `×${n.h}`),
    hint: 'Tap the pads with your fingertips · tuned to the monks’ chant',
  },
  steeldrums: {
    R: 0.3, dome: -0.055,
    notes: [
      ...[0, 1, 2, 3, 4, 5].map((i) => ({ i, r: 0.205, s: 0.068, a: Math.PI / 2 + (i - 2.5) * 1.047 })),
      ...[0, 1, 2].map((i) => ({ i: 6 + i, r: 0.085, s: 0.052, a: Math.PI / 2 + (i - 1) * 2.094 })),
    ],
    // a pentatonic scale on C, low round the outside, high in the middle
    freq: (n) => [130.81, 146.83, 164.81, 196.0, 220.0, 261.63, 293.66, 329.63, 392.0][n.i],
    // the singing-bowl voice: inharmonic partials, slow beating, a long, long ring
    partials: [[1, 1, 10, 0.9], [2.76, 0.42, 6, 1.3], [5.4, 0.16, 3.4, 2.1], [8.93, 0.06, 1.8, 3.1], [2.0, 0.08, 6, 0.5], [3.0, 0.05, 4, 0]],
    attack: 0.006, click: 7, clickGain: 0.1,
    label: (n) => ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E', 'G'][n.i],
    hint: 'Tap the pads with your fingertips, or point and tap',
  },
};
const PARTIAL_COLS = ['#ffd27a', '#ff8ad0', '#8ab4ff', '#9affd8'];

class PanScene extends BaseScene {
  constructor(kind) {
    super();
    this.kind = kind;
    const K = (this.K = KINDS[kind]);
    this.wantsPointer = true;
    this.wantsHands = true;
    this.viewPitch = -0.7;
    const U = this.uniforms;
    this._backdrop(U);

    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;
    this.pan = new THREE.Group();
    this.pan.position.set(0, -0.48, -0.46);
    this.pan.rotation.x = 0.22;   // tipped towards you
    this.rig.add(this.pan);

    // pads, as uniforms for the shell's shader
    this.notes = K.notes.map((n, k) => {
      const a = n.a ?? 0;
      const c = new THREE.Vector2(Math.cos(a) * n.r, Math.sin(a) * n.r);
      return { ...n, k, c, f: K.freq(n), glow: 0 };
    });
    const padU = this.notes.map((n) => new THREE.Vector4(n.c.x, n.c.y, n.s, n.r === 0 ? 1 : 0.78));
    while (padU.length < 10) padU.push(new THREE.Vector4(9, 9, 0.001, 1));
    this.glowU = { value: new Array(10).fill(0) };
    const su = { ...U, uPads: { value: padU }, uGlow: this.glowU, uR: { value: K.R } };

    const R = K.R, H = K.dome;
    const pts = kind === 'handpan'
      ? [[0, H], [0.3, H * 0.93], [0.6, H * 0.68], [0.85, H * 0.3], [0.97, H * 0.06], [1, 0], [0.97, -0.03], [0.85, -0.05], [0.6, -0.068], [0.3, -0.078], [0.12, -0.08]]
      : [[0, H], [0.3, H * 0.92], [0.6, H * 0.65], [0.85, H * 0.28], [0.97, H * 0.05], [1, 0.006], [1.01, -0.01], [1.01, -0.22], [0.99, -0.23]];
    const shell = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0.0008, r * R), y)), 96), new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: su,
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade, uTime, uR; uniform vec4 uPads[10]; uniform float uGlow[10]; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          vec3 V = normalize(vV), L = normalize(vec3(-0.3, 0.85, 0.45));
          vec3 R = reflect(-V, n);
          float dif = 0.3 + 0.7 * max(dot(n, L), 0.0);
          float fr = pow(1.0 - abs(dot(n, V)), 3.0);
          bool top = ${kind === 'handpan' ? 'vP.y > 0.0' : 'length(vP.xz) < uR * 0.97 && vP.y > -0.07'};
          ${kind === 'handpan'
    ? `// nitrided steel: dark bronze-brown, hammer marks, a satin sheen
          vec3 base = mix(vec3(0.16, 0.09, 0.05), vec3(0.32, 0.2, 0.1), fbm(vP * 90.0));
          base *= 0.85 + 0.3 * fbm(vP * 260.0);
          float spec = pow(max(dot(R, L), 0.0), 18.0) * 0.5;
          vec3 c = base * dif + vec3(1.0, 0.8, 0.55) * (spec + fr * 0.25);`
    : `// polished chrome reflecting the stars and nebula
          float sky = fbm(R * 4.0 + vec3(0.0, uTime * 0.01, 0.0));
          vec3 env = mix(vec3(0.02, 0.02, 0.04), vec3(0.55, 0.45, 0.85), pow(sky, 2.5)) + vec3(1.0) * pow(max(dot(R, L), 0.0), 60.0) * 1.5;
          env += vec3(0.8, 0.85, 1.0) * smoothstep(0.92, 0.99, fract(R.x * 3.0 + R.z * 2.0)) * 0.15;   // brushed streaks
          vec3 c = env * 0.9 + vec3(0.5, 0.55, 0.75) * fr * 0.35;
          float rr = length(vP.xz) / uR;
          c += vec3(0.9, 0.92, 1.0) * smoothstep(0.95, 0.99, rr) * smoothstep(1.02, 0.99, rr) * 0.6;   // the bright rolled rim
          if (vP.y < -0.012) c *= 0.55;                                                                 // the skirt, darker`}
          if (top) {
            for (int i = 0; i < 10; i++) {
              vec4 P = uPads[i];
              vec2 q = vP.xz - P.xy;
              // tone fields are ovals pointing at the centre; the ding is round
              vec2 rd = length(P.xy) > 0.001 ? normalize(P.xy) : vec2(1.0, 0.0);
              vec2 e = vec2(dot(q, rd) / P.w, dot(q, vec2(-rd.y, rd.x)));
              float d = length(e) / P.z;
              float dimple = smoothstep(1.02, 0.9, d);
              float rim = smoothstep(0.08, 0.0, abs(d - 1.0));
              c *= 1.0 - dimple * ${kind === 'handpan' ? '0.22' : '0.4'};
              c += vec3(1.0, 0.9, 0.7) * rim * ${kind === 'handpan' ? '0.12' : '0.35'};
              ${kind === 'handpan' ? '' : 'c += vec3(0.35, 0.45, 0.95) * (dimple * 0.1 + rim * 0.45) * (0.85 + 0.15 * sin(uTime * 1.3 + float(i)));'}
              c += mix(vec3(1.0, 0.8, 0.45), vec3(0.6, 0.8, 1.0), ${kind === 'handpan' ? '0.0' : '1.0'}) * uGlow[i] * smoothstep(1.1, 0.2, d) * 1.6;
            }
          }
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    }));
    this.pan.add(shell);

    // pad labels, lying on the instrument
    for (const n of this.notes) {
      const l = textPlane(U, 0.07, 0.022);
      l.userData.set(K.label(n));
      l.material.uniforms.uA.value = 0.28;
      const rr = n.r === 0 ? 0 : n.r + n.s + 0.012;
      const a = n.a ?? 0;
      l.position.set(Math.cos(a) * rr, this._surf(rr) + 0.004, Math.sin(a) * rr + (n.r === 0 ? n.s + 0.014 : 0));
      l.rotation.x = -Math.PI / 2;
      this.pan.add(l);
    }

    // ripples: each strike sends out a ring of light per partial, spreading at its own pace
    this.ripples = [];
    for (let i = 0; i < 36; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.92, 1.0, 64), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
        uniforms: { uFade: U.uFade, uCol: { value: new THREE.Color() }, uA: { value: 0 } },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uFade, uA; uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol * uA * uFade, 1.0); }',
      }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 12;
      this.pan.add(m);
      this.ripples.push({ m, age: 9, life: 1, speed: 0, at: new THREE.Vector2() });
    }
    this.rip = 0;

    // a soft glow beneath
    const under = new THREE.Mesh(new THREE.CircleGeometry(R * 2.2, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uFade, uTime; varying vec2 vP; void main(){ float r = length(vP) / ${(R * 2.2).toFixed(3)}; gl_FragColor = vec4(vec3(${kind === 'handpan' ? '0.5, 0.3, 0.12' : '0.35, 0.3, 0.8'}) * exp(-r * r * 5.0) * (0.25 + 0.05 * sin(uTime)) * uFade, 1.0); }`,
    }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.12;
    this.pan.add(under);

    this.hint = textPlane(U, 0.8, 0.055);
    this.hint.position.set(0, 0.0, -0.95);
    this.hint.userData.set(K.hint);
    this.rig.add(this.hint);
    this.hintA = 1;
    this.tips = new Map();
    this.nearT = new Map();
    this.N = null;
  }

  // the height of the playing surface at a distance r from the centre (pan space)
  _surf(r) { const K = this.K; return K.dome * Math.max(0, 1 - (r / K.R) ** 2 * 0.9); }

  _place() {
    const h = INPUT.head;
    if (!h) return false;
    const f = new THREE.Vector3(h.fwd.x, 0, h.fwd.z);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    this.rig.position.copy(h.pos);
    this.rig.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    return true;
  }

  // which pad is at this point on the surface (pan space)?
  _padAt(x, z) {
    let best = null, bd = 1.25;
    for (const n of this.notes) {
      const q = new THREE.Vector2(x - n.c.x, z - n.c.y);
      const rd = n.r ? n.c.clone().normalize() : new THREE.Vector2(1, 0);
      const e = new THREE.Vector2(q.dot(rd) / (n.r ? 0.78 : 1), q.x * -rd.y + q.y * rd.x);
      const d = e.length() / n.s;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  _strike(n, strength, at) {
    const K = this.K;
    n.glow = Math.min(1.2, 0.6 + strength);
    this.hintA = Math.min(this.hintA, 0.99);
    // ripples: one per partial, the higher partials quicker and fainter
    K.partials.slice(0, 4).forEach(([ratio, w], j) => {
      const r = this.ripples[this.rip++ % this.ripples.length];
      r.age = -j * 0.06; r.life = 1.5 - j * 0.22; r.speed = 0.045 + j * 0.025; r.w = 0.5 + w * 0.5;
      r.at.copy(at || n.c);
      r.m.material.uniforms.uCol.value.set(PARTIAL_COLS[j]);
    });
    if (!this.N || this.N.dead) {
      this.N = bellOut(this, 0, this.kind === 'handpan' ? 0.55 : 0.9);
      if (this.N) { this.N.attack = K.attack; this.N.clickGain = K.clickGain; this.N.clickQ = 2; }
    }
    if (this.N) strikeVoice(this.N, n.f, K.partials, 0.1 * (0.45 + strength * 0.7), K.click);
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.pan.matrixWorld).invert();
    const pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    const over = (this.hideRays ||= new Set());
    const K = this.K;

    for (const p of pointers) {
      const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
      // near the instrument, only the small marker at your hand shows
      const nearPt = p.tip ? p.tip.clone().applyMatrix4(inv) : null;
      if ((nearPt && nearPt.length() < K.R + 0.2) || (!nearPt && Math.abs(d.y) > 1e-3 && (() => { const k = (this._surf(0) * 0.5 - o.y) / d.y; return k > 0 && Math.hypot(o.x + d.x * k, o.z + d.z * k) < K.R + 0.1; })())) this.nearT.set(p.id, t);
      if (t - (this.nearT.get(p.id) ?? -9) < 0.5) over.add(p.id); else over.delete(p.id);

      if (p.tip) {
        // a fingertip dipping onto the surface strikes the pad beneath it
        const q = nearPt, r = Math.hypot(q.x, q.z), h = q.y - this._surf(r);
        const prev = this.tips.get(p.id);
        if (prev && r < K.R && prev.h > 0.004 && h <= 0.006) {
          const v = (prev.y - q.y) / Math.max(dt, 1e-3);
          const n = this._padAt(q.x, q.z);
          if (n && v > 0.15) this._strike(n, Math.min(1, v / 1.2), new THREE.Vector2(q.x, q.z));
        }
        this.tips.set(p.id, { h, y: q.y });
        continue;
      }
      if (!(INPUT.presses.includes(p.id) || p.press)) continue;
      // pointing: where the ray meets the surface
      if (Math.abs(d.y) < 1e-3) continue;
      let k = (this._surf(0) - o.y) / d.y;
      for (let i = 0; i < 3; i++) { const x = o.x + d.x * k, z = o.z + d.z * k; k = (this._surf(Math.hypot(x, z)) - o.y) / d.y; }
      if (k <= 0) continue;
      const x = o.x + d.x * k, z = o.z + d.z * k;
      const n = Math.hypot(x, z) < K.R ? this._padAt(x, z) : null;
      if (n) this._strike(n, 0.6, new THREE.Vector2(x, z));
    }

    for (const n of this.notes) { n.glow *= Math.exp(-dt / 0.9); this.glowU.value[n.k] = n.glow; }
    for (const r of this.ripples) {
      r.age += dt;
      const on = r.age >= 0 && r.age < r.life;
      r.m.visible = on;
      if (!on) continue;
      const rad = Math.min(this.K.R * 0.55, 0.015 + r.age * r.speed * (1 + r.age * 0.4));
      r.m.scale.setScalar(rad);
      const rr = Math.hypot(r.at.x, r.at.y);
      r.m.position.set(r.at.x, this._surf(rr) + 0.006, r.at.y);
      r.m.material.uniforms.uA.value = (1 - r.age / r.life) ** 1.5 * r.w * 0.9;
    }
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.25);
    this.hint.material.uniforms.uA.value = (0.25 + 0.4 * Math.min(1, t * 0.5)) * this.hintA;
  }

  // for previews: a slow melody tapped from above
  _demoPointers(t) {
    const seq = this.kind === 'handpan' ? [0, 1, 2, 3, 4, 2, 5, 6, 0, 7, 8, 3] : [0, 2, 4, 6, 3, 7, 1, 5, 8, 4];
    const step = Math.floor(t / 0.55), n = this.notes[seq[step % seq.length] % this.notes.length];
    const press = step !== this._demoStep; this._demoStep = step;
    const at = new THREE.Vector3(n.c.x, this._surf(n.r) + 0.3, n.c.y).applyMatrix4(this.pan.matrixWorld);
    const dir = new THREE.Vector3(0, -1, 0).transformDirection(this.pan.matrixWorld);
    return [{ id: 'demo', origin: at, dir, tip: null, press }];
  }

  _backdrop(U) {
    const handpan = this.kind === 'handpan';
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir); float az = atan(d.x, -d.z);
          ${handpan
    ? `// a Himalayan terrace at dusk: layered peaks, prayer flags, a warm stone floor
          vec3 c = mix(vec3(1.0, 0.6, 0.35), vec3(0.2, 0.22, 0.45), smoothstep(-0.02, 0.45, d.y));
          c = mix(c, vec3(0.06, 0.07, 0.18), smoothstep(0.4, 0.95, d.y));
          c += vec3(1.0, 0.7, 0.4) * pow(max(dot(d, normalize(vec3(0.5, 0.05, -0.85))), 0.0), 60.0) * 1.5;
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float ridge = 0.03 + 0.14 * (1.0 - fi * 0.3) * fbm(vec3(az * (2.0 + fi * 1.5), fi * 3.0, 1.0)) - fi * 0.035;
            if (d.y < ridge) {
              vec3 rock = mix(vec3(0.32, 0.26, 0.35), vec3(0.1, 0.07, 0.1), fi / 2.0) * (0.9 + 0.2 * fbm(d * 40.0));
              rock = mix(rock, vec3(0.95, 0.8, 0.85), smoothstep(ridge - 0.02, ridge, d.y) * step(fi, 0.5) * 0.8);   // snow on the far peaks
              c = rock;
            }
          }
          if (d.y < -0.06) c = vec3(0.24, 0.18, 0.14) * (0.7 + 0.4 * fbm(d * 30.0));
          // prayer flags strung across in front of you, stirring in the breeze
          for (int s = 0; s < 2; s++) {
            float fs = float(s);
            float line = 0.32 + fs * 0.12 - 0.08 * az * az + 0.004 * sin(az * 30.0 + uTime * 2.0);
            float seg = az * (26.0 + fs * 8.0) + fs * 0.5, id = floor(seg), f = fract(seg);
            float flag = step(0.12, f) * step(f, 0.88) * step(line - 0.055, d.y) * step(d.y, line) * step(abs(az), 1.3);
            vec3 fc = mod(id, 5.0) < 1.0 ? vec3(0.15, 0.3, 0.85) : mod(id, 5.0) < 2.0 ? vec3(0.95, 0.95, 0.9) : mod(id, 5.0) < 3.0 ? vec3(0.85, 0.15, 0.12) : mod(id, 5.0) < 4.0 ? vec3(0.15, 0.6, 0.25) : vec3(0.95, 0.8, 0.15);
            c = mix(c, fc * (0.7 + 0.3 * sin(uTime * 3.0 + id)), flag * 0.85);
            c = mix(c, vec3(0.1), smoothstep(0.003, 0.0, abs(d.y - line)) * step(abs(az), 1.3));
          }`
    : `// deep space: nebula, twinkling stars, a distant ringed world
          float n = fbm(d * 2.0 + vec3(0.0, uTime * 0.005, 0.0));
          vec3 c = mix(vec3(0.01, 0.01, 0.03), vec3(0.08, 0.04, 0.14), n);
          c += vec3(0.25, 0.1, 0.4) * smoothstep(0.5, 0.8, fbm(d * 3.0 + 4.0)) * 0.6 + vec3(0.05, 0.2, 0.35) * smoothstep(0.55, 0.85, fbm(d * 2.5 + 9.0)) * 0.5;
          for (int L = 0; L < 3; L++) {
            float fl = float(L);
            vec3 p = d * (150.0 + fl * 170.0), cell = floor(p);
            float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            if (h > 0.985 - fl * 0.005) {
              vec3 o = 0.3 + 0.4 * fract(sin(cell * vec3(91.7, 47.3, 23.1)) * 4375.85);
              c += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), fract(h * 37.0)) * smoothstep(0.32, 0.0, length(fract(p) - o)) * (0.55 + 0.45 * sin(uTime * (0.8 + h * 4.0) + h * 70.0)) * (1.4 - fl * 0.35);
            }
          }
          vec3 pc = normalize(vec3(0.7, 0.25, -0.65));
          float pd = acos(clamp(dot(d, pc), -1.0, 1.0));
          if (pd < 0.12) c = mix(vec3(0.05, 0.03, 0.08), vec3(0.6, 0.45, 0.8), max(dot(normalize(d - pc), normalize(vec3(-0.6, 0.5, 0.0))), 0.0) * 0.8 + 0.1);`}
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));
    this.group.add(particles(U, handpan
      ? { count: 300, min: [-6, -1, -8], max: [6, 3, 2], vel: [0.05, 0.02, 0], sway: 0.4, size: [0.006, 0.014], colors: ['#ffd9a0', '#ffe8c8'], alpha: 0.4 }
      : { count: 500, min: [-6, -2, -8], max: [6, 4, 3], vel: [0, 0.02, 0], sway: 0.3, size: [0.006, 0.016], colors: ['#dfe6ff', '#c8b8ff', '#9affd8'], alpha: 0.5 }));
  }

  _quiet() {
    const N = this.N;
    if (!N) return;
    N.master.gain.setTargetAtTime(0, N.ctx.currentTime, 0.08);
    setTimeout(() => { try { N.master.disconnect(); N.send.disconnect(); } catch (_) {} }, 600);
    this.N = null;
  }
  silence() { this._quiet(); this.muted = true; }
  setFade(f) {
    super.setFade(f);
    if (this.N) this.N.master.gain.setTargetAtTime(f, this.N.ctx.currentTime, 0.1);
    if (f < 0.01) this._quiet();
  }
  dispose() { this._quiet(); super.dispose(); }
}

export class HandpanScene extends PanScene { constructor() { super('handpan'); } }
export class SteelDrumsScene extends PanScene { constructor() { super('steeldrums'); } }
