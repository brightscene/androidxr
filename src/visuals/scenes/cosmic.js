import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SFX, additive, damp } from '../common.js';
import { textPlane } from './imagecycle.js';
import { sky, terrain, particles, solidMat, noise2, rng, mix3, hex, clamp01 } from './kit.js';
import { mergeGeos } from './nature.js';
import { galaxyGeometry } from './galaxy.js';

const domeMat = (U, frag) => new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
  vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: frag,
});

// ===================================================================== Moon view
// Sitting on the grey lunar surface, looking out at a ringed gas giant, a
// blue world turning slowly, a red moon and a spiral galaxy over the horizon.
export class MoonViewScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = new THREE.Vector3(0.9, 0.35, 0.2).normalize();
    this.group.add(sky(U, { top: '#000000', horizon: '#04040a', ground: '#000000', sunDir: [0, -1, 0], sunCol: '#000000', stars: 1.2, band: 1.1, bandCol: '#e2d6ff', radius: 320 }));
    const n = noise2(61), r = rng(61);
    const craters = Array.from({ length: 70 }, () => { const a = r() * 6.28, d = 6 + Math.pow(r(), 0.6) * 150; return [Math.cos(a) * d, Math.sin(a) * d, 2 + Math.pow(r(), 2.5) * 18]; });
    const H = (x, z) => {
      let h = n.fbm(x * 0.03, z * 0.03) * 3 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 3, 40) + n(x * 0.5, z * 0.5) * 0.05;
      for (const [cx, cz, cr] of craters) {
        const d = Math.hypot(x - cx, z - cz) / cr;
        if (d < 1.4) h += d < 1 ? -(1 - d * d) * cr * 0.18 : Math.sin((d - 1) / 0.4 * Math.PI) * cr * 0.06;
      }
      return h;
    };
    this.group.add(terrain(U, {
      size: 380, seg: 220, height: H, sunDir: sun.toArray(), fog: '#000000', fogNear: 150, fogFar: 260, ambient: 0.06,
      color: (x, z) => mix3(hex('#77777a'), hex('#a8a6a2'), clamp01(0.5 + n(x * 0.15, z * 0.15))),
    }));
    // planets
    const planet = (radius, frag, extra = {}) => new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), new THREE.ShaderMaterial({
      transparent: true, uniforms: { ...U, uSunW: { value: sun }, ...extra },
      vertexShader: 'varying vec3 vN; varying vec3 vP; varying vec3 vW; void main(){ vP = position; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: frag,
    }));
    const LIT = /* glsl */ `float lit(vec3 n){ return smoothstep(-0.15, 0.35, dot(n, uSunW)); }
      float rim(vec3 n, vec3 w){ return pow(1.0 - max(dot(n, normalize(cameraPosition - w)), 0.0), 3.0); }`;
    this.giant = planet(34, /* glsl */ `uniform vec3 uSunW; uniform float uTime, uFade; varying vec3 vN; varying vec3 vP; varying vec3 vW; ${NOISE} ${GRADE} ${LIT}
      void main(){ vec3 p = normalize(vP); float lat = p.y;
        float bands = sin(lat * 22.0 + fbm(p * 4.0 + vec3(uTime * 0.01, 0.0, 0.0)) * 3.0);
        vec3 c = mix(vec3(0.85, 0.66, 0.45), vec3(0.98, 0.9, 0.75), 0.5 + 0.5 * bands);
        c = mix(c, vec3(0.7, 0.42, 0.3), smoothstep(0.6, 0.9, fbm(p * 9.0)) * 0.35);
        float l = lit(normalize(vN));
        c = c * l + vec3(1.0, 0.85, 0.6) * rim(normalize(vN), vW) * l * 0.4;
        gl_FragColor = vec4(grade(c), uFade); }`);
    this.giant.position.set(-95, 55, -170);
    this.giant.rotation.z = 0.35;
    this.group.add(this.giant);
    const ring = new THREE.Mesh(new THREE.RingGeometry(44, 70, 160, 1), new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade; varying vec2 vP; ${NOISE} ${GRADE}
        void main(){ float r = length(vP); float b = 0.5 + 0.5 * sin(r * 1.7) * sin(r * 0.43 + 1.0); float gap = smoothstep(57.5, 58.5, r) * smoothstep(60.5, 59.5, r);
          vec3 c = mix(vec3(0.75, 0.62, 0.5), vec3(0.95, 0.88, 0.76), b);
          gl_FragColor = vec4(grade(c), (0.35 + b * 0.5) * (1.0 - gap * 0.9) * uFade); }`,
    }));
    ring.position.copy(this.giant.position);
    ring.rotation.set(-1.25, 0.2, 0.35);
    this.group.add(ring);
    this.earth = planet(16, /* glsl */ `uniform vec3 uSunW; uniform float uTime, uFade; varying vec3 vN; varying vec3 vP; varying vec3 vW; ${NOISE} ${GRADE} ${LIT}
      void main(){ vec3 p = normalize(vP);
        float land = smoothstep(0.52, 0.56, fbm(p * 2.4 + 3.0));
        vec3 c = mix(vec3(0.03, 0.15, 0.42), mix(vec3(0.2, 0.45, 0.18), vec3(0.6, 0.55, 0.35), fbm(p * 6.0)), land);
        c = mix(c, vec3(1.0), smoothstep(0.85, 0.95, abs(p.y)));
        float cloud = smoothstep(0.55, 0.7, fbm(p * 3.5 + vec3(uTime * 0.006, 0.0, 0.0)));
        c = mix(c, vec3(1.0), cloud * 0.85);
        vec3 n = normalize(vN); float l = lit(n);
        c = c * l + vec3(0.35, 0.6, 1.0) * rim(n, vW) * (0.3 + l);
        gl_FragColor = vec4(grade(c), uFade); }`);
    this.earth.position.set(70, 30, -120);
    this.group.add(this.earth);
    const mars = planet(5, /* glsl */ `uniform vec3 uSunW; uniform float uFade; varying vec3 vN; varying vec3 vP; varying vec3 vW; ${NOISE} ${LIT}
      void main(){ vec3 p = normalize(vP); vec3 c = mix(vec3(0.6, 0.25, 0.12), vec3(0.85, 0.5, 0.3), fbm(p * 5.0)); gl_FragColor = vec4(c * lit(normalize(vN)), uFade); }`);
    mars.position.set(25, 48, -150);
    this.group.add(mars);
    const gal = new THREE.Points(galaxyGeometry(26000, 2, 7.5), additive({
      uniforms: { ...U },
      vertexShader: /* glsl */ `attribute float aR, aSeed; uniform float uViewH; varying float vR; ${POINT_SIZE}
        void main(){ vR = aR; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = max(1.0, pointPx(0.6 + aSeed * 0.8, mv)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vR; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0;
        vec3 c = mix(vec3(1.0, 0.9, 0.75), vec3(0.6, 0.7, 1.0), smoothstep(0.05, 0.5, vR)); gl_FragColor = vec4(c * smoothstep(1.0, 0.0, d) * 0.55 * uFade, 1.0); }`,
    }));
    gal.position.set(10, 70, -230);
    gal.scale.setScalar(80);
    gal.rotation.set(1.1, 0, 0.5);
    this.group.add(gal);
    this.gal = gal;
  }
  update(dt) { this.earth.rotation.y += dt * 0.02; this.giant.rotation.y += dt * 0.008; this.gal.rotateY(dt * 0.004); }
}

// ===================================================================== Fractal tunnel
// A kaleidoscopic tunnel of light that you glide through. The symmetry shifts
// on each chord, beats pulse the rings, your breath widens the tunnel.
export class FractalTunnelScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    // symmetry changes crossfade between two whole-number patterns, so the
    // kaleidoscope never shows a seam where it wraps around
    Object.assign(U, { uSymA: { value: 6 }, uSymB: { value: 6 }, uMix: { value: 1 }, uPulse: { value: 0 } });
    const m = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 48), domeMat(U, /* glsl */ `
      uniform vec3 uC0, uC1, uC2; uniform float uTime, uTravel, uFade, uSymA, uSymB, uMix, uPulse, uBreath, uEnergy;
      varying vec3 vDir; ${NOISE} ${GRADE}
      vec3 tunnel(vec3 d, float r, float v, float sym){
        float seg = 6.28318 / sym;
        float a = atan(d.y, d.x) + uTime * 0.05;
        a = abs(mod(a + seg * 64.0, seg) - seg * 0.5);
        vec2 q = vec2(a * 3.0, v);
        float f = fbm(vec3(q * 1.3, uTime * 0.05)) + fbm(vec3(q * 3.1 + 7.0, uTime * 0.08)) * 0.5;
        float rings = pow(0.5 + 0.5 * sin(v * 6.0 - uTime * 0.8), 8.0) * (0.25 + uPulse * 0.8);
        float lines = smoothstep(0.08, 0.0, abs(fract(f * 3.0) - 0.5) - 0.42);
        return mix(uC0 * 1.2, uC1 * 1.3, f) + uC2 * (lines * 0.45 + rings) * 0.8;
      }
      void main(){
        vec3 d = normalize(vDir);
        float r = length(d.xy);
        float depth = max(-d.z, 0.0) / max(r, 0.03);
        float v = depth * 0.6 + uTravel * 0.25;
        vec3 c = uMix >= 0.999 ? tunnel(d, r, v, uSymB) : mix(tunnel(d, r, v, uSymA), tunnel(d, r, v, uSymB), smoothstep(0.0, 1.0, uMix));
        c += vec3(1.0, 0.95, 0.9) * exp(-r * r * (60.0 - uBreath * 25.0)) * step(0.0, -d.z) * (0.7 + uEnergy * 0.5);
        c *= smoothstep(-0.2, 0.3, -d.z) * 0.85 + 0.15;
        gl_FragColor = vec4(grade(c * (0.75 + uEnergy * 0.4)), uFade);
      }`));
    m.renderOrder = -5;
    this.group.add(m);
  }
  onEvent(e) {
    const u = this.uniforms;
    if (e.type === 'chord') {
      const next = [5, 6, 8, 12][(e.index ?? 0) % 4];
      if (next !== u.uSymB.value && u.uMix.value >= 1) { u.uSymA.value = u.uSymB.value; u.uSymB.value = next; u.uMix.value = 0; }
    }
    if (e.type === 'beat') u.uPulse.value = Math.min(1, u.uPulse.value + (e.accent ? 0.6 : 0.2));
  }
  update(dt) {
    const u = this.uniforms;
    u.uMix.value = Math.min(1, u.uMix.value + dt / 3);
    u.uPulse.value *= Math.exp(-dt * 2.5);
  }
}

// ===================================================================== Crystal cave
// A dark cavern lined with glowing crystal clusters that brighten with the
// music; dust motes hang in the air.
export class CrystalCaveScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const cave = new THREE.Mesh(new THREE.SphereGeometry(26, 64, 48), domeMat(U, /* glsl */ `
      uniform vec3 uC1; uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
      void main(){ vec3 d = normalize(vDir); float n = fbm(d * 6.0) + fbm(d * 17.0) * 0.4;
        vec3 c = mix(vec3(0.03, 0.02, 0.05), vec3(0.12, 0.08, 0.16), n) + uC1 * 0.06 * n;
        vec2 st = starDot(d, 300.0, 0.9945); c += vec3(st.x) * 0.6 * (0.5 + 0.5 * sin(uTime * 2.0 + st.y * 40.0));
        gl_FragColor = vec4(grade(c), uFade); }`));
    cave.renderOrder = -5;
    this.group.add(cave);
    const n = noise2(71);
    this.group.add(terrain(U, {
      size: 60, seg: 90, height: (x, z) => n.fbm(x * 0.15, z * 0.15) * 1.2 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 2, 14) - 0.05,
      sunDir: [0, 1, 0], fog: '#05030a', fogNear: 8, fogFar: 30, ambient: 0.7, color: () => hex('#1a1424'),
    }));
    const r = rng(29);
    const geos = [];
    const addCrystal = (x, y, z, dir, len, rad, seed) => {
      const g = new THREE.CylinderGeometry(rad * 0.15, rad, len, 6, 1);
      g.translate(0, len / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
      g.translate(x, y, z);
      g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(seed), 1));
      geos.push(g);
    };
    // clusters grow from the floor around you and from the cave walls and ceiling
    for (let i = 0; i < 60; i++) {
      const a = r() * 6.28, seed = r();
      let base, out, big;
      if (i < 26) { const d = 3 + r() * 13; base = new THREE.Vector3(Math.cos(a) * d, -0.05, Math.sin(a) * d); out = new THREE.Vector3(0, 1, 0); big = 1; }
      else { const el = 0.1 + r() * 1.3; const dir = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el)); base = dir.clone().multiplyScalar(24.5); out = dir.clone().multiplyScalar(-1); big = 2.2; }
      for (let k = 0; k < 4 + Math.floor(r() * 5); k++) {
        const dir = out.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.8)).normalize();
        addCrystal(base.x, base.y, base.z, dir, (0.5 + r() * 2.0) * big, (0.12 + r() * 0.25) * big, seed);
      }
    }
    Object.assign(U, { uGlow: { value: 0 } });
    const crystals = new THREE.Mesh(mergeGeos(geos), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'attribute float aSeed; varying vec3 vN; varying vec3 vW; varying float vS; void main(){ vS = aSeed; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uC1, uC2; uniform float uTime, uFade, uGlow, uBreath, uEnergy; varying vec3 vN; varying vec3 vW; varying float vS;
        void main(){ vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
          float facet = 0.4 + 0.6 * abs(dot(n, normalize(vec3(0.3, 0.8, 0.5))));
          float rim = pow(1.0 - abs(dot(n, v)), 2.0);
          vec3 tint = mix(uC1, uC2, vS) * 1.3 + vec3(0.1, 0.0, 0.15);
          float pulse = 0.35 + 0.3 * sin(uTime * 0.6 + vS * 20.0) + uGlow * (0.5 + vS) + uBreath * 0.25;
          vec3 c = tint * facet * (0.25 + pulse * (0.6 + uEnergy * 0.5)) + mix(tint, vec3(1.0), 0.5) * rim * (0.4 + pulse);
          gl_FragColor = vec4(c, uFade); }`,
    }));
    this.group.add(crystals);
    this.group.add(particles(U, { count: 600, min: [-12, 0, -12], max: [12, 8, 12], vel: [0.03, 0.02, 0.02], sway: 0.5, size: [0.015, 0.035], colors: ['#e6d8ff', '#bff4ff'], alpha: 0.7 }));
  }
  onEvent(e) { if (e.type === 'note' || (e.type === 'beat' && e.accent)) this.uniforms.uGlow.value = Math.min(1.2, this.uniforms.uGlow.value + 0.5); }
  update(dt) { this.uniforms.uGlow.value *= Math.exp(-dt * 1.8); }
}

// ===================================================================== Nebula drift
// Floating inside a glowing nebula: layers of coloured gas lit from within.
export class NebulaScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const m = new THREE.Mesh(new THREE.SphereGeometry(70, 48, 32), domeMat(U, /* glsl */ `
      uniform vec3 uC0, uC1, uC2; uniform float uTime, uTravel, uFade, uBreath, uEnergy, uBeat;
      varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
      float n2(vec3 p){ return vnoise(p) * 0.65 + vnoise(p * 2.1) * 0.35; }
      void main(){
        vec3 d = normalize(vDir);
        vec3 o = vec3(0.0, 0.0, -uTravel * 0.05) + vec3(uTime * 0.01, 0.0, 0.0);
        vec3 acc = vec3(0.0); float trans = 1.0;
        for (int i = 0; i < 10; i++) {
          float t = 0.6 + float(i) * 0.55;
          vec3 p = o + d * t;
          float den = smoothstep(0.42, 0.85, n2(p * 0.9));
          vec3 col = mix(uC1 * 1.5, uC2 * 1.4, n2(p * 1.7 + 5.0)) + vec3(0.9, 0.5, 0.8) * smoothstep(0.75, 0.95, n2(p * 2.3)) * 0.6;
          acc += col * den * trans * 0.22;
          trans *= 1.0 - den * 0.18;
        }
        vec3 c = uC0 * 0.4 + acc * (0.8 + uEnergy * 0.4 + uBreath * 0.15 + uBeat * 0.1);
        c += vec3(starDot(d, 280.0, 0.9958).x) * trans;
        gl_FragColor = vec4(grade(c), uFade);
      }`));
    m.renderOrder = -5;
    this.group.add(m);
    this.group.add(particles(U, { count: 700, min: [-25, -8, -25], max: [25, 15, 25], vel: [0, 0, 0.3], sway: 0.6, size: [0.03, 0.08], colors: ['#ffe8ff', '#c8ecff'], alpha: 0.8 }));
  }
}

// ===================================================================== Light ribbons
// Silky ribbons of light weaving slowly around you through the stars.
export class LightRibbonsScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const N = 14, S = 220;
    const pos = [], aS = [], aSide = [], aId = [], idx = [];
    for (let id = 0; id < N; id++) {
      const base = pos.length / 3;
      for (let i = 0; i <= S; i++) for (const side of [-1, 1]) { pos.push(0, 0, 0); aS.push(i / S); aSide.push(side); aId.push(id); }
      for (let i = 0; i < S; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 1));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(aSide, 1));
    g.setAttribute('aId', new THREE.Float32BufferAttribute(aId, 1));
    g.setIndex(idx);
    Object.assign(U, { uFlash: { value: 0 } });
    const m = new THREE.Mesh(g, additive({
      side: THREE.DoubleSide, uniforms: U,
      vertexShader: /* glsl */ `attribute float aS, aSide, aId; uniform float uTime, uBreath; varying float vS; varying float vSide; varying float vId;
        vec3 curve(float s, float id){
          float t = uTime * (0.05 + mod(id, 3.0) * 0.015);
          float a = id * 0.45 + s * 6.28318 * (1.0 + mod(id, 2.0)) + t * (mod(id, 2.0) > 0.5 ? 1.0 : -1.0);
          float r = 3.2 + 2.5 * sin(s * 6.0 + id * 1.7 + t * 2.0) + uBreath * 0.5;
          float y = 1.6 + 3.2 * sin(s * 4.0 + id * 1.3 + t * 1.5);
          return vec3(cos(a) * r, y, sin(a) * r);
        }
        void main(){ vS = aS; vSide = aSide; vId = aId;
          vec3 p = curve(aS, aId), q = curve(aS + 0.002, aId);
          vec3 tan = normalize(q - p), up = normalize(cross(tan, normalize(p - vec3(0.0, 1.6, 0.0))));
          p += up * aSide * (0.05 + 0.18 * sin(aS * 3.14159));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform vec3 uC1, uC2; uniform float uFade, uTime, uFlash, uEnergy; varying float vS; varying float vSide; varying float vId;
        void main(){ float edge = 1.0 - abs(vSide); float a = pow(edge, 1.5) * sin(vS * 3.14159);
          float flow = 0.6 + 0.4 * sin(vS * 40.0 - uTime * 1.5 + vId);
          vec3 c = mix(uC1 * 1.4, uC2 * 1.3, fract(vId * 0.37 + vS * 0.5)) * flow;
          gl_FragColor = vec4(c * a * (0.9 + uEnergy * 0.6 + uFlash) * uFade, 1.0); }`,
    }));
    m.frustumCulled = false;
    this.group.add(m);
  }
  onEvent(e) { if (e.type === 'note') this.uniforms.uFlash.value = Math.min(0.8, this.uniforms.uFlash.value + 0.3); }
  update(dt) { this.uniforms.uFlash.value *= Math.exp(-dt * 2); }
}

// ===================================================================== Black hole
// A black hole far ahead, its blazing accretion disk swirling and bent into
// a halo by its gravity, with matter spiralling in.
export class BlackHoleScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const C = new THREE.Vector3(0, 7, -58);
    // everything that belongs to the black hole moves together as you fall in
    this.sys = new THREE.Group();
    this.group.add(this.sys);
    const diskFrag = /* glsl */ `uniform float uTime, uFade, uBeat, uEnergy; uniform float uIn, uOut, uHalo; varying vec2 vP; ${NOISE}
      void main(){ float r = length(vP); float a = atan(vP.y, vP.x);
        float t = (r - uIn) / (uOut - uIn);
        float swirl = fbm(vec3(cos(a) * r * 0.4 + uTime * 0.3 / (t + 0.3), sin(a) * r * 0.4, r * 0.15 - uTime * 0.2)) ;
        float bands = 0.6 + 0.4 * sin(r * 2.2 - uTime * 2.0 / (t + 0.4) + swirl * 4.0);
        vec3 hot = vec3(1.0, 0.95, 0.85), mid = vec3(1.0, 0.62, 0.25), cool = vec3(0.7, 0.18, 0.08);
        vec3 c = mix(hot, mix(mid, cool, smoothstep(0.35, 1.0, t)), smoothstep(0.0, 0.35, t));
        float dop = uHalo > 0.5 ? 1.0 : 0.55 + 0.6 * (0.5 + 0.5 * cos(a));
        float a2 = smoothstep(0.0, 0.08, t) * smoothstep(1.0, 0.55, t) * bands * dop;
        gl_FragColor = vec4(c * a2 * (1.2 + uBeat * 0.4 + uEnergy * 0.4) * uFade, 1.0); }`;
    const disk = (inR, outR, halo) => new THREE.Mesh(new THREE.RingGeometry(inR, outR, 256, 16), additive({
      side: THREE.DoubleSide, uniforms: { ...U, uIn: { value: inR }, uOut: { value: outR }, uHalo: { value: halo } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: diskFrag,
    }));
    const d1 = disk(10, 48, 0);
    d1.position.copy(C);
    d1.rotation.set(-1.38, 0, 0.12);
    this.sys.add(d1);
    this.disk = d1;
    const halo = disk(8.2, 19, 1); // the far side of the disk, lensed up and over the hole
    halo.position.copy(C).add(new THREE.Vector3(0, 0, -2));
    this.sys.add(halo);
    this.halo = halo;
    const hole = new THREE.Mesh(new THREE.SphereGeometry(8, 48, 32), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 1 }));
    hole.position.copy(C);
    hole.renderOrder = 5;
    this.sys.add(hole);
    this.hole = hole;
    const ring = new THREE.Mesh(new THREE.RingGeometry(8.0, 8.7, 128), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(C).add(new THREE.Vector3(0, 0, 0.5));
    ring.renderOrder = 6;
    this.sys.add(ring);
    this.ring = ring;
    this.sys.add(particles(U, { count: 900, min: [-60, -10, -110], max: [60, 25, -30], vel: [0.4, 0, 0.6], sway: 2, size: [0.08, 0.2], colors: ['#ffcf8a', '#ff9a5a', '#ffffff'], alpha: 0.6 }));
    // total darkness once you cross the horizon, with a quiet "Let it go"
    this.black = new THREE.Mesh(new THREE.SphereGeometry(4, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.black.renderOrder = 100;
    this.black.frustumCulled = false;
    this.group.add(this.black);
    this.words = textPlane(U, 4.2, 0.62);
    this.words.renderOrder = 101;
    this.words.userData.set('Let it go');
    this.words.position.set(0, 1.6, -3);
    this.group.add(this.words);
    this.st = { phase: 'approach', t: 0, p: 0, rate: 0.012, target: 0.012, next: 8 };
  }
  // You drift toward the black hole at changing speeds (sometimes barely
  // moving, sometimes surging), then plunge through the horizon into total
  // darkness for 10 seconds with the words "Let it go", then emerge far away
  // and begin again.
  update(dt) {
    this.disk.rotation.z += dt * 0.05;
    this.halo.rotation.z -= dt * 0.04;
    const st = this.st;
    st.t += dt;
    let black = 0, words = 0;
    if (st.phase === 'approach') {
      st.next -= dt;
      if (st.next <= 0 && st.p < 0.6) {
        const speeds = [0.004, 0.011, 0.026];
        let n; do { n = speeds[Math.floor(Math.random() * speeds.length)]; } while (n === st.target);
        st.target = n; st.next = 7 + Math.random() * 6;
      }
      if (st.p >= 0.6) st.target = 0.09;                       // the final plunge
      if (st.p >= 0.6 && !st.whoosh) { st.whoosh = true; if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 5, gain: 0.7 }); }
      st.rate = damp(st.rate, st.target, st.p >= 0.6 ? 0.8 : 0.5, dt);
      st.p = Math.min(1, st.p + st.rate * dt);
      black = THREE.MathUtils.smoothstep(st.p, 0.74, 0.8);
      if (st.p >= 0.8) { st.phase = 'dark'; st.t = 0; }
    } else if (st.phase === 'dark') {
      black = 1;
      words = Math.min(1, st.t / 2.5) * (1 - Math.max(0, st.t - 7.5) / 2.5);
      if (st.t >= 10) { st.phase = 'emerge'; st.t = 0; st.p = 0; st.rate = 0.01; st.target = 0.01; st.next = 10; st.whoosh = false; }
    } else {
      black = 1 - Math.min(1, st.t / 4);
      st.p = Math.min(1, st.p + st.rate * dt);
      if (st.t >= 4) { st.phase = 'approach'; st.t = 0; }
    }
    const e = st.p;
    this.sys.position.set(0, -5.4 * e, 66 * e);
    this.hole.material.opacity = this.fade;
    this.ring.material.opacity = 0.8 * this.fade * (1 - black);
    this.black.material.opacity = black * this.fade;
    this.black.visible = black > 0.001;
    this.words.material.uniforms.uA.value = words;
    this.words.visible = words > 0.001;
  }
}

// ===================================================================== Chakras
// Seven chakra lotuses stacked before you from root to crown, each in its
// traditional colour. Energy rises through them, one step on every bar.
const CHAKRAS = [
  ['#ff2a2a', 4], ['#ff8a1a', 6], ['#ffe03a', 10], ['#3aff7a', 12], ['#3ab8ff', 16], ['#5a4aff', 2], ['#c25aff', 24],
];
export class ChakraScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    this.items = CHAKRAS.map(([c, petals], i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive({
        uniforms: { ...U, uCol: { value: new THREE.Color(c) }, uPetals: { value: petals }, uOn: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uPetals, uOn, uTime, uFade, uBreath; varying vec2 vUv;
          void main(){ vec2 p = (vUv - 0.5) * 2.0; float r = length(p); float a = atan(p.y, p.x) + uTime * 0.1;
            float petal = abs(cos(a * uPetals * 0.5));
            float lotus = smoothstep(0.03, 0.0, abs(r - (0.5 + 0.18 * petal)));
            float inner = smoothstep(0.03, 0.0, abs(r - 0.36));
            float core = exp(-r * r * 18.0);
            float glow = exp(-r * 2.8) * 0.45;
            float k = (lotus + inner * 0.8) * (0.5 + uOn * 0.8) + core * (0.6 + uOn) + glow * (0.4 + uOn + uBreath * 0.3);
            gl_FragColor = vec4(uCol * k * uFade, 1.0); }`,
      }));
      const y = 0.35 + i * 0.42;
      m.position.set(0, y, -2.6);
      m.scale.setScalar(0.55 + (i === 6 ? 0.15 : 0));
      this.group.add(m);
      return m;
    });
    // the energy channel
    const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 3.2), additive({
      uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uTime, uFade; varying vec2 vUv; void main(){ float f = 0.5 + 0.5 * sin(vUv.y * 30.0 - uTime * 3.0); float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * (0.3 + f * 0.4); gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a * uFade, 1.0); }',
    }));
    ch.position.set(0, 1.6, -2.62);
    this.group.add(ch);
    this.group.add(particles(U, { count: 400, min: [-0.6, 0, -3.2], max: [0.6, 3.4, -2.0], vel: [0, 0.6, 0], sway: 0.15, size: [0.015, 0.035], colors: ['#ffffff', '#ffe6ff', '#d8f0ff'], alpha: 0.8 }));
    this.active = 0;
  }
  onEvent(e) { if (e.type === 'bar') this.active = (this.active + 1) % 7; }
  update(dt, t, s) {
    this.items.forEach((m, i) => {
      const u = m.material.uniforms.uOn;
      u.value = damp(u.value, i === this.active ? 1 : i < this.active ? 0.35 : 0.1, 2, dt);
      m.lookAt(0, 1.6, 0);
    });
  }
}
