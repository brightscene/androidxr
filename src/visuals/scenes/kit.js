import * as THREE from 'three';
import { NOISE, POINT_SIZE, SOFT_DOT } from '../common.js';

// Shared building blocks for the environment scenes: a procedural sky (with
// sun, clouds, stars and a galaxy band), heightfield terrain, water with sun
// glint and ripples, GPU particles and rain. Everything is unlit/custom-lit
// shaders so it stays light enough for a standalone headset.

const VERT_DIR = /* glsl */ `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const col = (c) => new THREE.Color(c);

// ------------------------------------------------------------------ sky
export function sky(uni, o = {}) {
  const u = {
    ...uni,
    uTop: { value: col(o.top || '#2d5fa8') }, uHor: { value: col(o.horizon || '#cfe3f5') }, uGround: { value: col(o.ground || '#3a4a3a') },
    uSunDir: { value: new THREE.Vector3(...(o.sunDir || [0.3, 0.35, -1])).normalize() }, uSunCol: { value: col(o.sunCol || '#fff2d0') },
    uSunSize: { value: o.sunSize ?? 1 }, uCloud: { value: o.clouds ?? 0 }, uCloudCol: { value: col(o.cloudCol || '#ffffff') },
    uCloudSpeed: { value: o.cloudSpeed ?? 0.004 }, uStars: { value: o.stars ?? 0 }, uBand: { value: o.band ?? 0 },
    uBandCol: { value: col(o.bandCol || '#c9b8ff') }, uMoon: { value: o.moon ?? 0 },
    uMoonDir: { value: new THREE.Vector3(...(o.moonDir || [-0.5, 0.45, -1])).normalize() },
  };
  const m = new THREE.Mesh(new THREE.SphereGeometry(o.radius || 180, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: u, vertexShader: VERT_DIR,
    fragmentShader: /* glsl */ `
      uniform vec3 uTop, uHor, uGround, uSunDir, uSunCol, uCloudCol, uBandCol, uMoonDir;
      uniform float uSunSize, uCloud, uCloudSpeed, uStars, uBand, uMoon, uFade, uTime, uBreath, uEnergy;
      varying vec3 vDir;
      ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = mix(uHor, uTop, pow(clamp(h, 0.0, 1.0), 0.55));
        c = mix(uGround, c, smoothstep(-0.12, 0.01, h));
        float sd = max(dot(d, uSunDir), 0.0);
        c += uSunCol * (pow(sd, 900.0 / uSunSize) * 3.0 + pow(sd, 16.0) * 0.3 + pow(sd, 3.0) * 0.12);
        if (uStars > 0.0) {
          vec3 q = floor(d * 260.0);
          float r = hash3(q);
          float tw = 0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 60.0);
          c += vec3(step(0.9965, r) * uStars * tw * smoothstep(-0.02, 0.25, h));
        }
        if (uBand > 0.0) { // milky-way band across the sky
          vec3 bn = normalize(vec3(0.35, 0.9, 0.25));
          float b = exp(-pow(dot(d, bn) * 4.0, 2.0));
          float n = fbm(d * 5.0) * fbm(d * 11.0 + 3.0);
          c += uBandCol * b * n * uBand * 1.6 * smoothstep(-0.05, 0.2, h);
          c += vec3(step(0.985, hash3(floor(d * 420.0))) * b * uBand * 0.9);
        }
        if (uMoon > 0.0) {
          float md = dot(d, uMoonDir);
          float disc = smoothstep(0.99955, 0.9997, md);
          float crater = fbm(d * 160.0);
          c = mix(c, vec3(0.92, 0.94, 1.0) * (0.75 + 0.3 * crater), disc * uMoon);
          c += vec3(0.6, 0.7, 0.9) * pow(max(md, 0.0), 300.0) * 0.4 * uMoon;
        }
        if (uCloud > 0.0 && h > 0.0) {
          vec2 uv = d.xz / (h + 0.18) * 1.1 + vec2(uTime * uCloudSpeed, uTime * uCloudSpeed * 0.35);
          float n = fbm(vec3(uv, uTime * 0.008));
          float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.32, n);
          float sh = fbm(vec3(uv * 1.3 + 0.2, uTime * 0.008 + 4.0));
          vec3 cc = mix(uCloudCol, uCloudCol * 0.72, smoothstep(0.4, 0.8, sh));
          cc += uSunCol * pow(sd, 12.0) * 0.3;
          c = mix(c, cc, cov * smoothstep(0.0, 0.12, h));
        }
        gl_FragColor = vec4(c * (0.92 + uBreath * 0.08), uFade);
      }`,
  }));
  m.renderOrder = -5;
  m.frustumCulled = false;
  m.userData.u = u;
  return m;
}

// ------------------------------------------------------------------ terrain
// height(x, z) -> y ; color(x, z, y, slope) -> [r, g, b]
export function terrain(uni, o) {
  const size = o.size || 200, seg = o.seg || 160;
  const g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, o.height(p.getX(i), p.getZ(i)));
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const c = o.color(p.getX(i), p.getZ(i), p.getY(i), 1 - n.getY(i));
    colors.set(c, i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const u = {
    ...uni, uSun: { value: new THREE.Vector3(...(o.sunDir || [0.3, 0.6, -0.6])).normalize() },
    uFog: { value: col(o.fog || '#a0b4c8') }, uFogNear: { value: o.fogNear ?? 20 }, uFogFar: { value: o.fogFar ?? 110 },
    uAmb: { value: o.ambient ?? 0.4 }, uTint: { value: col(o.tint || '#ffffff') },
  };
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, uniforms: u,
    vertexShader: /* glsl */ `attribute vec3 color; varying vec3 vC; varying vec3 vN; varying float vD; varying vec3 vW;
      void main(){ vC = color; vN = normal; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uSun, uFog, uTint; uniform float uFogNear, uFogFar, uAmb, uFade, uBreath;
      varying vec3 vC; varying vec3 vN; varying float vD; varying vec3 vW;
      void main(){
        float l = uAmb + (1.0 - uAmb) * max(dot(normalize(vN), uSun), 0.0);
        vec3 c = vC * l * uTint;
        c = mix(c, uFog, smoothstep(uFogNear, uFogFar, vD));
        gl_FragColor = vec4(c, uFade);
      }`,
  }));
  m.renderOrder = -4;
  m.frustumCulled = false;
  m.userData.u = u;
  return m;
}

// ------------------------------------------------------------------ water
export function water(uni, o = {}) {
  const u = {
    ...uni,
    uDeep: { value: col(o.deep || '#0a3550') }, uTop: { value: col(o.top || '#6aa0d8') }, uHor: { value: col(o.horizon || '#cfe3f5') },
    uSunDir: { value: new THREE.Vector3(...(o.sunDir || [0, 0.1, -1])).normalize() }, uSunCol: { value: col(o.sunCol || '#ffd9a0') },
    uWave: { value: o.wave ?? 1 }, uGlint: { value: o.glint ?? 1 }, uRain: { value: o.rain ?? 0 },
    uShore: { value: o.shore ?? -999 }, uRip: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -99, 0)) },
    uFogFar: { value: o.fogFar ?? 140 },
  };
  const g = new THREE.CircleGeometry(o.radius || 170, 96);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, uniforms: u,
    vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uDeep, uTop, uHor, uSunDir, uSunCol; uniform float uWave, uGlint, uRain, uShore, uFade, uTime, uFogFar, uBreath;
      uniform vec4 uRip[6];
      varying vec3 vW;
      ${NOISE}
      vec2 waves(vec2 p){
        vec2 g = vec2(0.0); float t = uTime;
        vec2 k1 = vec2(0.31, 0.12), k2 = vec2(-0.18, 0.27), k3 = vec2(0.53, -0.41), k4 = vec2(-0.9, 0.7);
        g += k1 * cos(dot(k1, p) * 3.0 + t * 0.9) * 0.6;
        g += k2 * cos(dot(k2, p) * 3.0 + t * 1.1) * 0.5;
        g += k3 * cos(dot(k3, p) * 3.0 + t * 1.6) * 0.25;
        g += k4 * cos(dot(k4, p) * 3.0 + t * 2.3) * 0.12;
        return g * uWave * (0.8 + uBreath * 0.4);
      }
      void main(){
        vec2 p = vW.xz;
        vec2 gr = waves(p);
        // rain: many small expanding rings
        if (uRain > 0.0) {
          vec2 cell = floor(p * 1.6); vec2 f = fract(p * 1.6) - 0.5;
          float rh = hash3(vec3(cell, 1.0));
          float ph = fract(uTime * (0.6 + rh) + rh * 9.0);
          vec2 o = (vec2(hash3(vec3(cell, 2.0)), hash3(vec3(cell, 3.0))) - 0.5) * 0.6;
          float d = length(f - o);
          float ring = sin((d - ph * 0.5) * 60.0) * exp(-abs(d - ph * 0.5) * 25.0) * (1.0 - ph);
          gr += normalize(f - o + 1e-4) * ring * 0.8 * uRain;
        }
        for (int i = 0; i < 6; i++) {
          vec4 r = uRip[i]; float age = uTime - r.z;
          if (age > 0.0 && age < 8.0) {
            vec2 dv = p - r.xy; float d = length(dv); float fr = age * 1.8;
            gr += normalize(dv + 1e-4) * cos((d - fr) * 5.0) * exp(-abs(d - fr) * 1.5) * exp(-age * 0.45) * r.w * 0.8;
          }
        }
        vec3 n = normalize(vec3(-gr.x * 0.25, 1.0, -gr.y * 0.25));
        vec3 v = normalize(vW - cameraPosition);
        vec3 r = reflect(v, n);
        float fres = pow(1.0 - max(dot(-v, n), 0.0), 4.0) * 0.85 + 0.08;
        vec3 skyc = mix(uHor, uTop, pow(clamp(r.y, 0.0, 1.0), 0.55));
        vec3 c = mix(uDeep, skyc, fres);
        float sd = max(dot(r, uSunDir), 0.0);
        c += uSunCol * (pow(sd, 400.0) * 6.0 + pow(sd, 40.0) * 0.6) * uGlint;
        float dist = length(vW.xz - cameraPosition.xz);
        if (uShore > -998.0) {
          float sh = vW.z - uShore - sin(uTime * 0.5 + vW.x * 0.15) * 0.8;
          float foam = smoothstep(1.2, 0.0, abs(sh - 0.6 - sin(uTime * 0.5) * 0.6)) * (0.6 + 0.4 * fbm(vec3(p * 2.0, uTime * 0.3)));
          c = mix(c, vec3(0.95), foam * 0.7);
        }
        c = mix(c, uHor, smoothstep(uFogFar * 0.4, uFogFar, dist));
        gl_FragColor = vec4(c, uFade);
      }`,
  }));
  m.renderOrder = -3;
  m.frustumCulled = false;
  m.userData.u = u;
  m.userData.ri = 0;
  m.userData.ripple = (x, z, s) => { u.uRip.value[m.userData.ri].set(x, z, uni.uTime.value, s); m.userData.ri = (m.userData.ri + 1) % 6; };
  return m;
}

// ------------------------------------------------------------------ particles
// shapes: dot, petal, bubble, lantern, flake, firefly, leaf
const SHAPES = { dot: 0, petal: 1, bubble: 2, lantern: 3, flake: 4, firefly: 5, leaf: 6 };
export function particles(uni, o) {
  const n = o.count;
  const base = new Float32Array(n * 3), seed = new Float32Array(n), cols = new Float32Array(n * 3);
  const [x0, y0, z0] = o.min, [x1, y1, z1] = o.max;
  const palette = (o.colors || ['#ffffff']).map(col);
  for (let i = 0; i < n; i++) {
    let x = x0 + Math.random() * (x1 - x0), z = z0 + Math.random() * (z1 - z0);
    if (o.clear) while (Math.hypot(x, z) < o.clear) { x = x0 + Math.random() * (x1 - x0); z = z0 + Math.random() * (z1 - z0); }
    base.set([x, y0 + Math.random() * (y1 - y0), z], i * 3);
    seed[i] = Math.random();
    const c = palette[i % palette.length];
    cols.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(base, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aCol', new THREE.BufferAttribute(cols, 3));
  const u = {
    ...uni, uMin: { value: new THREE.Vector3(...o.min) }, uMax: { value: new THREE.Vector3(...o.max) },
    uVel: { value: new THREE.Vector3(...(o.vel || [0, 0, 0])) }, uSway: { value: o.sway ?? 0 },
    uSize: { value: new THREE.Vector2(...(o.size || [0.03, 0.06])) }, uShape: { value: SHAPES[o.shape || 'dot'] },
    uAlpha: { value: o.alpha ?? 1 }, uGlow: { value: o.glow ?? 1 }, uBoost: { value: 0 },
  };
  const m = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: o.normal ? THREE.NormalBlending : THREE.AdditiveBlending, uniforms: u,
    vertexShader: /* glsl */ `attribute float aSeed; attribute vec3 aCol;
      uniform vec3 uMin, uMax, uVel; uniform float uSway, uTime, uViewH, uShape; uniform vec2 uSize;
      varying float vS; varying vec3 vC; varying float vA; varying float vRot;
      ${POINT_SIZE}
      void main(){
        vec3 range = uMax - uMin;
        vec3 p = uMin + mod(position - uMin + uVel * uTime * (0.6 + aSeed * 0.8), max(range, vec3(1e-3)));
        p.x += sin(uTime * (0.4 + aSeed) + aSeed * 30.0) * uSway;
        p.z += cos(uTime * (0.33 + aSeed * 0.7) + aSeed * 17.0) * uSway;
        vec3 q = (p - uMin) / max(range, vec3(1e-3));
        vA = smoothstep(0.0, 0.08, q.y) * smoothstep(1.0, 0.92, q.y) * smoothstep(0.0, 0.05, q.x) * smoothstep(1.0, 0.95, q.x) * smoothstep(0.0, 0.05, q.z) * smoothstep(1.0, 0.95, q.z);
        if (range.y < 1e-2) vA = 1.0;
        vS = aSeed; vC = aCol; vRot = uTime * (aSeed - 0.5) * 2.0 + aSeed * 6.28;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = max(1.0, pointPx(mix(uSize.x, uSize.y, aSeed), mv));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `uniform float uShape, uAlpha, uFade, uTime, uGlow, uBoost; varying float vS; varying vec3 vC; varying float vA; varying float vRot;
      ${SOFT_DOT}
      void main(){
        vec2 pc = gl_PointCoord - 0.5;
        float a; vec3 c = vC;
        if (uShape < 0.5 || uShape > 3.5 && uShape < 4.5) a = softDot();
        else if (uShape < 1.5 || uShape > 5.5) { // petal / leaf
          float cs = cos(vRot), sn = sin(vRot); vec2 r = vec2(cs * pc.x - sn * pc.y, sn * pc.x + cs * pc.y);
          float e = length(r * vec2(uShape > 5.5 ? 3.2 : 2.2, uShape > 5.5 ? 1.3 : 1.15));
          a = smoothstep(0.5, 0.38, e); c *= 0.85 + 0.3 * (0.5 - r.y);
        } else if (uShape < 2.5) { float d = length(pc) * 2.0; a = smoothstep(1.0, 0.85, d) * (smoothstep(0.6, 0.95, d) + 0.15); }
        else if (uShape < 3.5) { // lantern: warm rounded box + glow
          vec2 b = abs(pc) - vec2(0.17, 0.24); float box = smoothstep(0.04, 0.0, max(b.x, b.y));
          float glow = exp(-dot(pc, pc) * 14.0);
          a = max(box, glow * 0.7); c = mix(c * 1.4, vec3(1.0, 0.9, 0.6), smoothstep(0.1, 0.0, length(pc - vec2(0.0, 0.08))) * box);
        } else { // firefly: blinking dot
          a = softDot() * smoothstep(0.2, 1.0, sin(uTime * (1.5 + vS * 2.0) + vS * 40.0));
        }
        gl_FragColor = vec4(c * uGlow * (1.0 + uBoost), a * vA * uAlpha * uFade);
      }`,
  }));
  m.frustumCulled = false;
  m.userData.u = u;
  return m;
}

// ------------------------------------------------------------------ rain streaks
export function rain(uni, o = {}) {
  const n = o.count || 3000;
  const R = o.radius || 18;
  const pos = new Float32Array(n * 6), seed = new Float32Array(n * 2), end = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = 1 + Math.sqrt(Math.random()) * R;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, y = Math.random() * 14;
    pos.set([x, y, z, x, y, z], i * 6);
    seed[i * 2] = seed[i * 2 + 1] = Math.random();
    end[i * 2 + 1] = 1;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const u = { ...uni, uCol: { value: col(o.color || '#c8d8ec') }, uAmt: { value: o.alpha ?? 0.35 } };
  const m = new THREE.LineSegments(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: u,
    vertexShader: /* glsl */ `attribute float aSeed, aEnd; uniform float uTime; varying float vA;
      void main(){ vec3 p = position; float sp = 9.0 + aSeed * 4.0;
        p.y = mod(p.y - uTime * sp, 14.0) - 1.0 + aEnd * 0.45; p.x += aEnd * 0.05;
        vA = (1.0 - aEnd * 0.8) * smoothstep(-1.0, 0.5, p.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uAmt, uFade; varying float vA; void main(){ gl_FragColor = vec4(uCol * vA * uAmt * uFade, 1.0); }`,
  }));
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ simple lit solid
// Diffuse + rim lighting with distance fog; optional emissive glow pattern.
export function solidMat(uni, o = {}) {
  const u = {
    ...uni, uCol: { value: col(o.color || '#888888') }, uCol2: { value: col(o.color2 || o.color || '#888888') },
    uSun: { value: new THREE.Vector3(...(o.sunDir || [0.3, 0.7, -0.4])).normalize() }, uAmb: { value: o.ambient ?? 0.35 },
    uFog: { value: col(o.fog || '#000000') }, uFogFar: { value: o.fogFar ?? 200 }, uEmit: { value: col(o.emit || '#000000') },
    uEmitAmt: { value: o.emitAmt ?? 0 }, uPulse: { value: 0 },
  };
  return new THREE.ShaderMaterial({
    transparent: true, uniforms: u, side: o.side ?? THREE.FrontSide,
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vL;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vL = position; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `uniform vec3 uCol, uCol2, uSun, uFog, uEmit; uniform float uAmb, uFogFar, uEmitAmt, uPulse, uFade, uTime, uBeat;
      varying vec3 vN; varying vec3 vW; varying vec3 vL;
      ${NOISE}
      void main(){
        vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
        float nz = fbm(vW * 0.8);
        vec3 base = mix(uCol, uCol2, smoothstep(0.35, 0.75, nz) * 0.8 + clamp(n.y, 0.0, 1.0) * 0.2);
        float l = uAmb + (1.0 - uAmb) * max(dot(n, uSun), 0.0);
        vec3 c = base * l + base * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.25;
        float veins = smoothstep(0.035, 0.0, abs(fbm(vL * 2.2 + vec3(0.0, uTime * 0.05, 0.0)) - 0.5));
        c += uEmit * uEmitAmt * (veins * (0.6 + uPulse) + 0.08);
        c = mix(c, uFog, smoothstep(uFogFar * 0.3, uFogFar, length(vW - cameraPosition)));
        gl_FragColor = vec4(c, uFade);
      }`,
  });
}

// ------------------------------------------------------------------ misc helpers
export function rng(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// value noise in JS for terrain heights
export function noise2(seed = 1) {
  const r = rng(seed);
  const perm = new Uint8Array(512), grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) { perm[i] = i; grad[i] = r() * 2 - 1; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const v = (x, y) => grad[perm[(x & 255) + perm[y & 255]]];
  const s = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = v(xi, yi), b = v(xi + 1, yi), c = v(xi, yi + 1), d = v(xi + 1, yi + 1);
    const u = s(xf), w = s(yf);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
  n.fbm = (x, y, oct = 4) => { let t = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { t += n(x * f, y * f) * amp; f *= 2.03; amp *= 0.5; } return t; };
  return n;
}

export const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
