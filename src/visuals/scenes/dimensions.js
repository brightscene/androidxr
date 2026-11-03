import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
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
      varying vec3 vDir; ${NOISE} ${GRADE} ${HSV}
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
        float hue = fract(uHue + Z * 0.012 + w * 0.35 + spiral * 0.08);
        vec3 aura = hsv(hue, 0.72, 1.0);
        vec3 c = aura * (0.22 + w * 0.95) * (0.6 + spiral * 0.6);
        float fil = smoothstep(0.035, 0.0, abs(w - 0.5));
        c += mix(aura, vec3(1.0), 0.6) * fil * 0.8;
        float ring = pow(0.5 + 0.5 * sin(Z * 1.2 - uTime * 2.0), 24.0);
        c += vec3(1.0) * ring * (0.12 + uPulse * 0.9) * smoothstep(30.0, 2.0, z);
        vec3 exitCol = hsv(fract(uHue + 0.5), 0.35, 1.0);
        c = mix(c, exitCol * 1.15, smoothstep(6.0, 40.0, z));
        float open = exp(-r * r * (80.0 - uPortal * 76.0)) * step(0.0, fwd);
        c += exitCol * open * (1.1 + uPortal * 2.6);
        c *= mix(0.22, 1.0, smoothstep(-0.6, 0.2, fwd));
        c = mix(c, vec3(1.0, 0.98, 0.96), uFlash);
        gl_FragColor = vec4(grade(c * (0.75 + uEnergy * 0.35)), uFade);
      }`));
    this.motes = particles(U, { count: 700, min: [-1.4, 0.3, -70], max: [1.4, 2.9, 4], vel: [0, 0, 9], sway: 0.25, size: [0.012, 0.03], colors: ['#ffffff', '#ffe8ff', '#d8f6ff'], alpha: 0.8 });
    this.group.add(this.motes);
    this.next = 40;
    this.phase = null;
  }
  // open a portal: the exit widens, you speed through, flash, new dimension
  _portal() { if (!this.phase) this.phase = { t: 0 }; }
  onEvent(e) {
    if (e.type === 'section' && e.index > 0) this._portal();
    if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.6 : 0.2));
  }
  onCue(name) { if (name === 'portal') this._portal(); }
  update(dt, t) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.5);
    this.next -= dt;
    if (this.next <= 0) { this._portal(); this.next = 55 + Math.random() * 25; }
    const p = this.phase;
    if (p) {
      p.t += dt;
      const open = Math.min(1, p.t / 7);
      U.uPortal.value = open * open;
      U.uWarp.value += dt * (2 + 30 * open * open);              // surge forward as it opens
      if (p.t > 7 && p.t < 8.2) U.uFlash.value = Math.min(1, (p.t - 7) / 0.6) * 0.92;
      if (p.t >= 7.6 && !p.swapped) { p.swapped = true; U.uHue.value = (U.uHue.value + 0.28 + Math.random() * 0.3) % 1; }
      if (p.t >= 8.2) {
        U.uFlash.value = Math.max(0, U.uFlash.value - dt * 0.45);
        U.uPortal.value = damp(U.uPortal.value, 0, 1.5, dt);
        if (U.uFlash.value <= 0 && U.uPortal.value < 0.02) this.phase = null;
      }
    }
    this.motes.userData.u.uBoost.value = U.uPortal.value * 1.5;
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
      varying vec3 vDir; ${NOISE} ${GRADE}
      vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
      vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
      vec3 pal(float t){ return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67))); }
      void main(){
        vec3 d = normalize(vDir);
        float t = uTime * 0.025;
        d = rotY(rotX(d, t * 0.7), t);
        // octahedral mirror folds: the same image reflected 48 ways around you
        vec3 p = abs(d);
        if (p.x < p.y) p.xy = p.yx;
        if (p.x < p.z) p.xz = p.zx;
        if (p.y < p.z) p.yz = p.zy;
        vec3 q = p * (1.15 + uBreath * 0.12) + vec3(0.0, 0.0, sin(uTime * 0.05) * 0.08);
        vec3 k = vec3(0.52 + 0.05 * sin(uTime * 0.041), 0.4 + 0.05 * cos(uTime * 0.033), 0.62 + uMorph * 0.06);
        float acc = 0.0, prev = 0.0, trap = 1e3;
        for (int i = 0; i < 9; i++) {
          q = abs(q) / dot(q, q) - k;
          float l = length(q);
          acc += exp(-abs(l - prev) * 2.6);
          prev = l;
          trap = min(trap, abs(q.y - q.z));
        }
        acc /= 9.0;
        vec3 col = mix(pal(acc * 1.3 + uHue + t * 0.4), mix(uC1, uC2, acc) * 1.4, 0.15);
        col = mix(vec3(dot(col, vec3(0.333))), col, 1.35);       // richer colour
        col *= 0.12 + pow(acc, 1.3) * 1.5;
        col += mix(col, vec3(1.0), 0.5) * exp(-trap * 18.0) * (0.35 + uPulse * 0.8);
        col *= 0.8 + uEnergy * 0.35;
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
