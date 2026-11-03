import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, damp } from '../common.js';
import { particles } from './kit.js';

const dome = (U, frag, radius = 60) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 48), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: frag,
  }));
  m.renderOrder = -5;
  return m;
};

const HSV = /* glsl */ `vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }`;

const NEBULA = /* glsl */ `
vec3 nebula(float t){
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.008, 0.012, 0.05), c1 = vec3(0.07, 0.07, 0.3), c2 = vec3(0.32, 0.16, 0.6), c3 = vec3(0.78, 0.36, 0.7), c4 = vec3(0.5, 0.86, 0.95);
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}
${STARS}
float stars(vec3 d){ vec2 s = starDot(d, 300.0, 0.995); return s.x * (0.55 + 0.45 * sin(uTime * (1.0 + s.y * 3.0) + s.y * 60.0)); }`;

// ===================================================================== Time portal
// Travelling down a softly snaking pipe of flowing aura light toward a bright
// exit. Every so often the exit opens into a portal: you surge through in a
// flash of white and emerge into a new dimension with a new set of colours.
// Uses no angles, so the tube never shows a seam.
export class TimePortalScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uPortal: { value: 0 }, uHue: { value: Math.random() }, uFlash: { value: 0 }, uWarp: { value: 0 }, uPulse: { value: 0 } });
    this.group.add(dome(U, /* glsl */ `
      uniform float uTime, uTravel, uFade, uPulse, uBreath, uEnergy, uPortal, uHue, uFlash, uWarp;
      varying vec3 vDir; ${NOISE} ${GRADE} ${HSV} ${NEBULA}
      void main(){
        vec3 d = normalize(vDir);
        float r = max(length(d.xy), 1e-3);
        float fwd = -d.z;
        float R = 1.0 + uBreath * 0.12;
        float z = fwd / r * R;                       // how far ahead this ray meets the tube wall
        vec2 hit = d.xy / r;                         // direction around the tube
        float Z = z + uTravel * 0.5 + uWarp;
        vec2 bend = vec2(sin(Z * 0.11 + uTime * 0.07), cos(Z * 0.09)) * 0.6 * smoothstep(0.0, 6.0, z);
        vec3 P = vec3(hit * 1.6 + bend, Z * 0.35);
        float n = fbm(P + vec3(0.0, 0.0, -uTime * 0.15));
        float w = fbm(P * 1.9 + vec3(n * 2.2, n * 1.7, uTime * 0.1));
        vec2 sp = vec2(cos(Z * 0.9 + uTime * 0.4), sin(Z * 0.9 + uTime * 0.4));
        float spiral = 0.5 + 0.5 * sin(dot(hit, sp) * 3.0 + Z * 0.6);
        // dark nebula colours only: deep navy, indigo, violet, a little magenta and teal
        float tn = 0.18 + 0.62 * fract(uHue * 0.7 + Z * 0.008 + w * 0.3 + spiral * 0.06);
        vec3 neb = nebula(tn);
        vec3 c = neb * (0.12 + w * 0.8) * (0.55 + spiral * 0.45);
        float fil = smoothstep(0.03, 0.0, abs(w - 0.5));
        c += mix(neb, vec3(0.8, 0.78, 1.0), 0.35) * fil * 0.4;
        // stars drifting past on the walls
        vec2 st = starDot(normalize(vec3(hit, Z * 0.06)), 220.0, 0.988);
        c += mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.75), st.y) * st.x * 0.9 * smoothstep(40.0, 4.0, z);
        float ring = pow(0.5 + 0.5 * sin(Z * 1.2 - uTime * 2.0), 24.0);
        c += vec3(0.55, 0.5, 0.95) * ring * (0.05 + uPulse * 0.35) * smoothstep(30.0, 2.0, z);
        // the far end fades into deep space; only a small point of light marks the exit
        vec3 exitCol = vec3(0.92, 0.9, 1.0);
        vec3 deep = nebula(0.12 + 0.08 * fract(uHue));
        c = mix(c, deep, smoothstep(12.0, 60.0, z));
        float open = exp(-r * r * (2600.0 - uPortal * 2400.0)) * step(0.0, fwd);
        c += exitCol * open * (0.5 + uPortal * 1.6);
        c *= mix(0.22, 1.0, smoothstep(-0.6, 0.2, fwd));
        c = mix(c, nebula(0.55) * 0.9, uFlash);   // a soft violet wash, not a white-out   // a soft wash of the next dimension's colour, not a white-out
        gl_FragColor = vec4(grade(c * (0.75 + uEnergy * 0.35)), uFade);
      }`));
    this.motes = particles(U, { count: 700, min: [-1.4, 0.3, -70], max: [1.4, 2.9, 4], vel: [0, 0, 9], sway: 0.25, size: [0.012, 0.03], colors: ['#ffffff', '#ffe8ff', '#d8f6ff'], alpha: 0.8 });
    this.group.add(this.motes);
    this.next = 40;
    this.phase = null;
    // cruising speed changes every so often: drifting, gliding or rushing
    this.speed = 2; this.speedTarget = 2; this.speedNext = 10;
  }
  // open a portal: the exit widens, you speed through, flash, new dimension
  _portal() { if (!this.phase) this.phase = { t: 0 }; }
  onEvent(e) {
    if (e.type === 'section' && e.index > 0) this._portal();
    if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.6 : 0.2));
  }
  onCue(name) { if (name === 'portal') this._portal(); }
  update(dt, t, s) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.5);
    this.next -= dt;
    if (this.next <= 0) { this._portal(); this.next = 55 + Math.random() * 25; }
    this.speedNext -= dt;
    if (this.speedNext <= 0) {
      const speeds = [0.8, 2.5, 6, 12];
      let n; do { n = speeds[Math.floor(Math.random() * speeds.length)]; } while (n === this.speedTarget);
      this.speedTarget = n; this.speedNext = 12 + Math.random() * 10;
    }
    this.speed = damp(this.speed, this.speedTarget + (s?.energy || 0) * 2 + U.uPulse.value * 1.5, 0.6, dt);
    U.uWarp.value += dt * this.speed;
    const p = this.phase;
    if (p) {
      p.t += dt;
      const open = Math.min(1, p.t / 7);
      U.uPortal.value = open * open;
      U.uWarp.value += dt * (2 + 30 * open * open);              // surge forward as it opens
      if (p.t > 7 && p.t < 8.2) U.uFlash.value = Math.min(1, (p.t - 7) / 0.6) * 0.5;
      if (p.t >= 7.6 && !p.swapped) { p.swapped = true; U.uHue.value = (U.uHue.value + 0.28 + Math.random() * 0.3) % 1; }
      if (p.t >= 8.2) {
        U.uFlash.value = Math.max(0, U.uFlash.value - dt * 0.7);
        U.uPortal.value = damp(U.uPortal.value, 0, 1.5, dt);
        if (U.uFlash.value <= 0 && U.uPortal.value < 0.02) this.phase = null;
      }
    }
    this.motes.userData.u.uBoost.value = U.uPortal.value * 1.5 + Math.max(0, this.speed - 2) * 0.12;
  }
}

// ===================================================================== Kaleidosphere
// Sitting inside a living kaleidoscope: a slowly morphing fractal mirrored 48
// ways in every direction around you. It turns slowly, breathes with you,
// shifts colour on each chord and sparkles on the beat. Mirror folds are
// continuous, so there are no seams anywhere.
export class KaleidosphereScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uHue: { value: 0 }, uHueT: { value: 0 }, uPulse: { value: 0 }, uMorph: { value: 0 } });
    this.group.add(dome(U, /* glsl */ `
      uniform vec3 uC1, uC2; uniform float uTime, uFade, uBreath, uEnergy, uPulse, uMorph, uHue;
      varying vec3 vDir; ${NOISE} ${GRADE} ${NEBULA}
      // coloured glass, like the pieces in a child's kaleidoscope
      vec3 gem(float i){
        i = mod(floor(i), 8.0);
        if (i < 1.0) return vec3(0.9, 0.08, 0.16);   // ruby
        if (i < 2.0) return vec3(1.0, 0.5, 0.04);    // amber
        if (i < 3.0) return vec3(1.0, 0.84, 0.18);   // gold
        if (i < 4.0) return vec3(0.08, 0.72, 0.3);   // emerald
        if (i < 5.0) return vec3(0.04, 0.72, 0.78);  // turquoise
        if (i < 6.0) return vec3(0.1, 0.24, 0.95);   // sapphire
        if (i < 7.0) return vec3(0.56, 0.14, 0.88);  // amethyst
        return vec3(0.95, 0.16, 0.55);               // magenta
      }
      vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
      vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
      void main(){
        vec3 d0 = normalize(vDir);
        float t = uTime * 0.02;
        vec3 d = rotY(rotX(d0, t * 0.7), t);
        // octahedral mirror folds: the same image reflected 48 ways around you
        vec3 p = abs(d);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        vec3 q = p * (1.1 + uBreath * 0.1) + vec3(0.0, 0.0, sin(uTime * 0.04) * 0.07);
        vec3 k = vec3(0.52 + 0.04 * sin(uTime * 0.037), 0.41 + 0.04 * cos(uTime * 0.029), 0.62 + uMorph * 0.05);
        float acc = 0.0, prev = 0.0, trap = 1e3, trap2 = 1e3;
        for (int i = 0; i < 8; i++) {
          q = abs(q) / dot(q, q) - k;
          float l = length(q);
          acc += exp(-abs(l - prev) * 1.8);
          prev = l;
          trap = min(trap, abs(q.y - q.z));
          trap2 = min(trap2, length(q.xy - vec2(0.3, 0.1)));
        }
        acc = smoothstep(0.05, 0.95, acc / 8.0);
        // each fold region becomes a piece of coloured glass; chords turn the barrel
        float pid = trap2 * 3.0 + acc * 3.0 + (p.x - p.z) * 7.0 + uHue * 8.0;
        float f = fract(pid);
        vec3 glass = mix(gem(pid), gem(pid + 1.0), smoothstep(0.9, 1.0, f));
        float lit = 0.18 + acc * 0.95;
        vec3 col = glass * lit;
        col += vec3(1.0, 0.97, 0.9) * exp(-trap * 22.0) * (0.2 + uPulse * 0.35);     // bright edges where the glass pieces meet
        col *= 1.0 - 0.55 * smoothstep(0.82, 1.0, f) * smoothstep(1.0, 0.9, f);       // dark lead lines between pieces
        col *= 0.85;
        col += vec3(stars(d0)) * 0.9;
        col *= 0.85 + uEnergy * 0.3;
        gl_FragColor = vec4(grade(col), uFade);
      }`));
    this.group.add(particles(U, { count: 600, min: [-10, -2, -10], max: [10, 9, 10], vel: [0.05, 0.08, 0.04], sway: 0.6, size: [0.02, 0.05], colors: ['#ffffff', '#ffe6fb', '#e0f6ff'], alpha: 0.7, clear: 1.2 }));
  }
  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'chord') U.uHueT.value += 0.12 + Math.random() * 0.1;
    if (e.type === 'beat') U.uPulse.value = Math.min(1, U.uPulse.value + (e.accent ? 0.5 : 0.18));
    if (e.type === 'section') this.morphT = e.index;
  }
  update(dt) {
    const U = this.uniforms;
    U.uHue.value = damp(U.uHue.value, U.uHueT.value, 0.4, dt);
    U.uPulse.value *= Math.exp(-dt * 2.2);
    U.uMorph.value = damp(U.uMorph.value, this.morphT || 0, 0.15, dt);
  }
}

// ===================================================================== Nebula flight
// Gliding forward through deep-blue nebula: billowing clouds and dark voids,
// glowing turquoise filaments along the cloud edges, warm amber pockets, stars.
export class NebulaFlightScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uGlow: { value: 0 } });
    this.group.add(dome(U, /* glsl */ `
      uniform vec3 uC1; uniform float uTime, uTravel, uFade, uBreath, uEnergy, uGlow;
      varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
      void main(){
        vec3 d = normalize(vDir);
        vec3 ro = vec3(sin(uTime * 0.02) * 0.6, 0.0, -uTravel * 0.07);
        vec3 acc = vec3(0.0); float T = 1.0;
        // even steps (no per-pixel jitter: that left a fixed grain over your view)
        for (int i = 0; i < 16; i++) {
          float t = 0.5 + float(i) * 0.36;
          vec3 p = ro + d * t;
          float n = fbm(p * 0.38);
          float den = smoothstep(0.5, 0.8, n);
          float ridge = 1.0 - abs(fbm(p * 1.4 + 3.0) * 2.0 - 1.0);
          float fil = pow(ridge, 14.0) * smoothstep(0.5, 0.56, n) * smoothstep(0.72, 0.6, n);
          vec3 base = mix(vec3(0.03, 0.03, 0.15), vec3(0.2, 0.32, 0.78), smoothstep(0.5, 0.85, n)) * mix(vec3(1.0), uC1 * 2.0 + 0.3, 0.15);
          float amber = smoothstep(0.66, 0.86, vnoise(p * 0.22 + 9.0));
          vec3 col = base * den * 0.9 + vec3(0.3, 0.9, 0.95) * fil * (1.1 + uGlow) + vec3(1.0, 0.55, 0.22) * amber * den * 0.8;
          acc += col * T * 0.195;
          T *= 1.0 - den * 0.15;
        }
        vec3 c = vec3(0.008, 0.008, 0.035) + acc * (0.95 + uEnergy * 0.3 + uBreath * 0.1);
        vec2 st = starDot(d, 320.0, 0.996);
        c += mix(vec3(0.7, 0.9, 1.0), vec3(1.0, 0.75, 0.45), st.y) * st.x * (0.4 + 0.6 * T);
        gl_FragColor = vec4(grade(c), uFade);
      }`));
    this.group.add(particles(U, { count: 500, min: [-12, -4, -60], max: [12, 8, 4], vel: [0, 0, 3], sway: 0.3, size: [0.02, 0.05], colors: ['#bff4ff', '#ffd2a0'], alpha: 0.7 }));
  }
  onEvent(e) { if (e.type === 'note' || (e.type === 'beat' && e.accent)) this.uniforms.uGlow.value = Math.min(1.2, this.uniforms.uGlow.value + 0.4); }
  update(dt) { this.uniforms.uGlow.value *= Math.exp(-dt * 1.5); }
}

// ===================================================================== Warp gate
// Rushing through a hyperspace wormhole: violet and gold streaks pour past,
// organic shapes swirl near the throat, and a black core with a bright rim waits ahead.
export class WarpGateScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uShift: { value: 0 }, uShiftT: { value: 0 }, uPulse: { value: 0 } });
    this.group.add(dome(U, /* glsl */ `
      uniform float uTime, uTravel, uFade, uBreath, uEnergy, uShift, uPulse;
      varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
      void main(){
        vec3 d = normalize(vDir);
        float r = max(length(d.xy), 1e-3);
        float fwd = -d.z;
        vec2 hit = d.xy / r;
        float z = max(fwd, -0.3) / r;
        float Z = z * 0.12 + uTravel * 0.05;
        vec2 sw = vec2(cos(Z * 0.7 + uTime * 0.15), sin(Z * 0.7 + uTime * 0.15));
        vec2 h2 = vec2(dot(hit, sw), dot(hit, vec2(-sw.y, sw.x)));      // gently twisting
        vec3 P = vec3(h2 * 2.0, Z);
        float n = fbm(P + vec3(0.0, 0.0, -uTime * 0.25));
        float m = fbm(P * vec3(1.7, 1.7, 0.8) + n * 1.4);
        // dark space colours: deep violet and midnight blue, lit softly
        vec3 violet = vec3(0.26, 0.1, 0.5), blue = vec3(0.04, 0.09, 0.3);
        float k = smoothstep(0.46, 0.56, n + sin(uShift * 6.28318) * 0.05);
        vec3 c = mix(violet, blue, k) * (0.3 + m * 0.6);
        c = mix(c, vec3(0.5, 0.45, 0.85), 0.06 * m);                     // faint glow like light through gauze
        c += vec3(0.55, 0.5, 0.95) * pow(1.0 - abs(m * 2.0 - 1.0), 14.0) * (0.12 + uPulse * 0.25);
        vec2 st = starDot(normalize(vec3(h2, Z * 0.5)), 200.0, 0.988);
        c += vec3(0.8, 0.85, 1.0) * st.x * 0.8 * smoothstep(40.0, 3.0, z);
        float cells = smoothstep(0.56, 0.44, fbm(vec3(h2 * 5.0, z * 0.6 - uTime * 1.2)));
        float throat = smoothstep(3.0, 9.0, z) * smoothstep(60.0, 12.0, z);
        c = mix(c, c * vec3(0.55, 0.45, 0.85) * 0.55, cells * throat * 0.7);
        float core = smoothstep(0.032, 0.022, r) * step(0.0, fwd);
        float rim = exp(-pow((r - 0.034) * 70.0, 2.0)) * step(0.0, fwd);
        c = c * (1.0 - core) + vec3(0.75, 0.72, 1.0) * rim * (0.7 + uBreath * 0.3);
        c *= mix(0.25, 1.0, smoothstep(-0.6, 0.25, fwd));
        gl_FragColor = vec4(grade(c * (0.9 + uEnergy * 0.2)), uFade);
      }`));
  }
  onEvent(e) {
    if (e.type === 'chord') this.uniforms.uShiftT.value += 0.25;
    if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.6 : 0.2));
  }
  update(dt) {
    const U = this.uniforms;
    U.uShift.value = damp(U.uShift.value, U.uShiftT.value, 0.5, dt);
    U.uPulse.value *= Math.exp(-dt * 2.5);
  }
}

// ===================================================================== Mandala bloom
// A painterly kaleidoscope of deep teal, gold petals and touches of red,
// blooming endlessly outward toward you. 8-fold mirror symmetry, no seams.
export class MandalaBloomScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uPulse: { value: 0 }, uTurn: { value: 0 } });
    this.group.add(dome(U, /* glsl */ `
      uniform vec3 uC2; uniform float uTime, uTravel, uFade, uBreath, uEnergy, uPulse, uTurn;
      varying vec3 vDir; ${NOISE} ${GRADE} ${NEBULA}
      void main(){
        vec3 d = normalize(vDir);
        float fwd = -d.z;
        float th = acos(clamp(fwd, -1.0, 1.0));            // angle away from straight ahead
        float a = atan(d.y, d.x) + uTurn;
        float seg = 6.28318 / 8.0;
        float fa = abs(mod(a + seg * 64.0, seg) - seg * 0.5);
        float u = log(th + 0.03) * 1.1 - uTime * 0.08 - uTravel * 0.012 - uBreath * 0.08;
        vec2 q = vec2(fa * 3.2, u);
        vec3 Q = vec3(q * vec2(3.0, 2.0), uTime * 0.03);
        float w = fbm(Q);
        float v = fbm(Q * 1.8 + vec3(w * 2.5, w * 1.3, 0.0));
        float petals = smoothstep(0.5, 0.7, fbm(vec3(q * vec2(4.5, 2.4) + vec2(0.0, v * 1.5), 5.0)));
        float ridge = pow(1.0 - abs(v * 2.0 - 1.0), 10.0);
        vec3 c = nebula(smoothstep(0.25, 0.85, v) * 0.7);
        c = mix(c, mix(vec3(0.85, 0.42, 0.78), vec3(1.0, 0.74, 0.45), smoothstep(0.55, 0.75, w)), petals * smoothstep(0.42, 0.62, w) * 0.75);
        c += vec3(0.45, 0.86, 0.95) * ridge * 0.35;                       // turquoise filaments
        c += nebula(v * 0.75) * 0.25;                                       // soft glow
        c += vec3(stars(d)) * smoothstep(0.3, 1.2, th) * 0.8;
        c *= mix(0.18, 1.0, smoothstep(2.7, 0.7, th));
        c *= 0.85 + uEnergy * 0.25 + uPulse * 0.12;
        gl_FragColor = vec4(grade(c * 1.15), uFade);
      }`));
  }
  onEvent(e) {
    if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.5 : 0.15));
    if (e.type === 'chord') this.turnT = (this.turnT || 0) + Math.PI / 8;
  }
  update(dt) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.2);
    U.uTurn.value = damp(U.uTurn.value, this.turnT || 0, 0.6, dt);
  }
}

// ===================================================================== Silk vortex
// Violet silk ribbons spiral around a vortex ahead as you fly forward,
// rings of light pulse at its heart, warm dust drifts in the dark.
export class SilkVortexScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uRing: { value: 0 } });
    const N = 12, S = 260;
    const pos = [], aS = [], aSide = [], aId = [], idx = [];
    for (let id = 0; id < N; id++) {
      const base = pos.length / 3;
      for (let i = 0; i <= S; i++) for (const side of [-1, 1]) { pos.push(0, 0, 0); aS.push(i / S); aSide.push(side); aId.push(id); }
      for (let i = 0; i < S; i++) { const b = base + i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
    g.setIndex(idx);
    const ribbons = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute float aS, aSide, aId; uniform float uTime, uTravel, uBreath;
        varying float vSide; varying float vA; varying float vSheen; varying float vId;
        void main(){
          float L = 100.0;
          float z = mod(-90.0 + aS * L + uTravel * 0.9 + aId * 8.3, L) - 90.0;
          float dir = mod(aId, 2.0) > 0.5 ? 1.0 : -1.0;
          float R = mix(1.1, 5.5 + sin(aId * 1.7) * 1.5, smoothstep(-85.0, 2.0, z)) + uBreath * 0.3;
          float th = aId * 0.52 + z * 0.075 * dir + uTime * 0.12 * dir;
          vec3 c = vec3(cos(th) * R, 1.6 + sin(th) * R, z);
          vec3 rad = vec3(cos(th), sin(th), 0.0), tang = vec3(-sin(th), cos(th), 0.0);
          float tw = z * 0.11 + aId + uTime * 0.2;
          vec3 wdir = normalize(tang * cos(tw) + vec3(0.0, 0.0, 1.0) * sin(tw) * 0.6 + rad * 0.15);
          float width = mix(0.15, 0.9, smoothstep(-85.0, 0.0, z));
          vec3 p = c + wdir * aSide * width;
          vSide = aSide; vId = aId;
          vSheen = 0.5 + 0.5 * cos(tw * 2.0);
          vA = smoothstep(-90.0, -60.0, z) * smoothstep(4.0, -3.0, z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `uniform float uFade, uEnergy; varying float vSide; varying float vA; varying float vSheen; varying float vId;
        void main(){
          float across = 1.0 - abs(vSide);
          vec3 violet = mix(vec3(0.35, 0.12, 0.65), vec3(0.62, 0.3, 0.95), fract(vId * 0.37));
          vec3 peach = vec3(1.0, 0.78, 0.62);
          vec3 c = violet * (0.35 + across * 0.65) + peach * pow(vSheen, 6.0) * across * 0.7;
          float a = smoothstep(0.0, 0.35, across) * vA * (0.55 + uEnergy * 0.3);
          gl_FragColor = vec4(c * a * uFade, 1.0);
        }`,
    }));
    ribbons.frustumCulled = false;
    this.group.add(ribbons);
    // rings of light at the heart of the vortex
    this.rings = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.06, 128), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        uniforms: { ...U, uI: { value: i } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uFade, uI, uRing, uTime; varying vec2 vP;
          void main(){ float a = 0.55 + 0.45 * sin(atan(vP.y, vP.x) * 2.0 + uTime * 0.6 + uI);
            vec3 c = mix(vec3(0.6, 0.4, 1.0), vec3(1.0, 0.82, 0.68), mod(uI, 2.0));
            gl_FragColor = vec4(c * a * (0.5 + uRing) * uFade, 1.0); }`,
      }));
      m.position.set(0, 1.6, -30 - i * 5);
      m.userData = { r: 1.5 + i * 0.45, ph: i * 1.1 };
      this.group.add(m);
      this.rings.push(m);
    }
    this.group.add(particles(U, { count: 700, min: [-15, -5, -70], max: [15, 9, 5], vel: [0, 0, 2.5], sway: 0.4, size: [0.015, 0.04], colors: ['#ffb27a', '#d9a0ff'], alpha: 0.6 }));
  }
  onEvent(e) { if (e.type === 'beat' && e.accent) this.uniforms.uRing.value = 1; }
  update(dt, t, s) {
    this.uniforms.uRing.value *= Math.exp(-dt * 2);
    for (const m of this.rings) {
      const u = m.userData;
      m.scale.setScalar(u.r * (1 + 0.08 * Math.sin(t * 0.8 + u.ph)) * (1 + s.breath * 0.1));
      m.rotation.set(Math.sin(t * 0.2 + u.ph) * 0.35, Math.cos(t * 0.17 + u.ph) * 0.35, t * 0.1 * (u.ph % 2 ? 1 : -1));
    }
  }
}
