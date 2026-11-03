import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, POINT_SIZE, SOFT_DOT, damp } from '../common.js';
import { sky, terrain, water, particles, rain, solidMat, noise2, rng, mix3, hex, clamp01 } from './kit.js';
import { mergeGeos } from './nature.js';

const hills = (U, seed, o) => {
  const n = noise2(seed);
  return terrain(U, {
    size: 420, seg: 160,
    height: (x, z) => { const r = Math.hypot(x, z); return r < o.inner ? -3 : (n.fbm(x * 0.012, z * 0.012) + 0.6) * o.h * THREE.MathUtils.smoothstep(r, o.inner, o.inner + 50) - 3; },
    sunDir: o.sun, fog: o.fog, fogNear: o.fogNear ?? 60, fogFar: o.fogFar ?? 230, ambient: o.ambient ?? 0.4, tint: o.tint,
    color: () => hex(o.color),
  });
};

// ===================================================================== Lantern lake
// Paper lanterns drift up from a still night lake, their light mirrored in
// the water. Notes ripple the surface where they sound.
export class LanternLakeScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const moon = [0.3, 0.25, -1];
    this.group.add(sky(U, { top: '#030614', horizon: '#1a2450', ground: '#050814', sunDir: [0, -1, 0], sunCol: '#000000', stars: 0.9, band: 0.6, moon: 1, moonDir: moon }));
    this.group.add(hills(U, 41, { inner: 70, h: 22, sun: moon, fog: '#141c3c', color: '#0a0f1c', ambient: 0.3 }));
    this.water = water(U, { deep: '#02060f', top: '#0e1a3a', horizon: '#1a2450', sunDir: moon, sunCol: '#cfd8ff', wave: 0.35, glint: 0.8, fogFar: 160 });
    this.water.position.y = -0.4;
    this.group.add(this.water);
    const dock = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 7), solidMat(U, { color: '#3a2c22', color2: '#4a3a2c', ambient: 0.5, sunDir: moon }));
    dock.position.set(0, -0.08, -1.5);
    this.group.add(dock);
    this.lanterns = paperLanterns(U, 380, 1);
    this.group.add(this.lanterns);
    const refl = paperLanterns(U, 380, 0.3, this.lanterns.geometry);
    refl.scale.y = -1;
    refl.position.y = -0.8;
    this.group.add(refl);
  }
  onEvent(e) {
    if (e.type === 'note') this.water.userData.ripple(e.pos[0], e.pos[2] - 3, 0.6 + e.vel);
    if (e.type === 'chord') this.lanterns.userData.u.uBoost.value = 0.6;
  }
  update(dt) { this.lanterns.userData.u.uBoost.value *= Math.exp(-dt); }
}

// Paper sky lanterns: a tapered paper shade, lit from inside by a candle at its
// open base. Each has its own colour of paper and its own flickering flame.
const LANTERN_COLS = ['#ff6a3a', '#ffb347', '#ff4f6d', '#ffd36b', '#ff8fb4', '#ffe2b8', '#ff7f2a', '#e86bff', '#ffa07a'];
function paperLanterns(U, n, alpha, shareGeo) {
  let g = shareGeo;
  if (!g) {
    const pos = new Float32Array(n * 3), seed = new Float32Array(n), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      let x, z;
      do { x = -45 + Math.random() * 90; z = -60 + Math.random() * 55; } while (Math.hypot(x, z) < 6);
      pos.set([x, Math.random() * 32, z], i * 3);
      seed[i] = Math.random();
      const c = new THREE.Color(LANTERN_COLS[i % LANTERN_COLS.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  }
  const u = { ...U, uBoost: { value: 0 }, uAlpha: { value: alpha } };
  const m = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: u,
    vertexShader: /* glsl */ `attribute float aSeed; attribute vec3 aCol; uniform float uTime, uViewH; varying vec3 vCol; varying float vFl; varying float vS;
      ${POINT_SIZE}
      void main(){ vec3 p = position;
        // drift up slowly on the night air, swaying, and loop back to the water
        p.y = mod(p.y + uTime * (0.22 + aSeed * 0.18), 34.0);
        p.x += sin(uTime * 0.13 + aSeed * 40.0) * 1.2 + uTime * 0.05;
        p.z += cos(uTime * 0.11 + aSeed * 23.0) * 0.8;
        p.x = mod(p.x + 45.0, 90.0) - 45.0;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = pointPx(0.9 + aSeed * 0.5, mv);
        // a candle flicker: quick little wavers and the odd dip
        float t = uTime * (7.0 + aSeed * 5.0) + aSeed * 100.0;
        vFl = 0.78 + 0.12 * sin(t) + 0.07 * sin(t * 2.3 + 1.0) - 0.18 * step(0.97, fract(sin(floor(uTime * 6.0 + aSeed * 50.0) * 91.7) * 4375.5));
        vCol = aCol; vS = aSeed;
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float uFade, uAlpha, uBoost; varying vec3 vCol; varying float vFl; varying float vS; ${SOFT_DOT}
      void main(){ vec2 q = (gl_PointCoord - 0.5) * vec2(2.0, -2.0);
        // the shade: wider at the top, tapering toward the open base
        float y = q.y;                                    // -1 bottom .. 1 top
        float halfW = mix(0.24, 0.4, smoothstep(-0.7, 0.6, y));
        float body = step(-0.7, y) * step(y, 0.65) * smoothstep(halfW, halfW - 0.05, abs(q.x));
        float rim = smoothstep(0.66, 0.62, y) * smoothstep(0.58, 0.62, y) * step(abs(q.x), 0.4);
        // light through the paper: brightest low down near the flame, ribs faintly visible
        float lit = mix(1.0, 0.45, smoothstep(-0.7, 0.65, y)) * (0.85 + 0.15 * cos(q.x * 26.0));
        vec3 paper = vCol * lit * vFl;
        vec3 c = paper * body * 1.2 + vCol * rim * 0.3;
        // the flame at the base, and a soft halo around the lantern
        float flame = exp(-dot((q - vec2(0.0, -0.62)) * vec2(9.0, 6.0), (q - vec2(0.0, -0.62)) * vec2(9.0, 6.0)));
        c += vec3(1.0, 0.85, 0.55) * flame * 1.6 * vFl;
        c += vCol * exp(-dot(q, q) * 2.2) * 0.22 * vFl;
        gl_FragColor = vec4(c * uAlpha * (1.0 + uBoost) * uFade, 1.0); }`,
  }));
  m.frustumCulled = false;
  m.userData.u = u;
  return m;
}

// ===================================================================== Rain lake
// A soft grey afternoon: rain falling on a lake from the end of a wooden
// jetty, mist on the hills, rings spreading across the water.
export class RainLakeScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [0.2, 0.6, -0.6];
    this.group.add(sky(U, { top: '#6f7f8f', horizon: '#b9c4cc', ground: '#5d6a6a', sunDir: sun, sunCol: '#2a2a2a', clouds: 0.95, cloudCol: '#c3ccd3', cloudSpeed: 0.004 }));
    this.group.add(hills(U, 8, { inner: 55, h: 30, sun, fog: '#aeb9c1', fogNear: 30, fogFar: 170, color: '#2e4436', ambient: 0.55 }));
    this.water = water(U, { deep: '#1a2a2c', top: '#8b98a2', horizon: '#b9c4cc', sunDir: sun, sunCol: '#000000', wave: 0.25, glint: 0, rain: 1, fogFar: 120 });
    this.water.position.y = -0.6;
    this.group.add(this.water);
    const wood = solidMat(U, { color: '#4b3a2c', color2: '#3a2e24', sunDir: sun, ambient: 0.55, fog: '#aeb9c1', fogFar: 170 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 9), wood);
    deck.position.set(0, -0.06, -2.5);
    this.group.add(deck);
    for (const [x, z] of [[-1.1, -6.8], [1.1, -6.8], [-1.1, -3], [1.1, -3]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 8), wood);
      post.position.set(x, -0.3, z);
      this.group.add(post);
    }
    this.group.add(rain(U, { count: 3500, radius: 22, alpha: 0.3 }));
  }
  onEvent(e) { if (e.type === 'note') this.water.userData.ripple(e.pos[0] * 1.5, e.pos[2] * 1.5 - 4, 0.5 + e.vel); }
}

// Soft cloud sprites painted once into a 2x2 atlas: three cumulus shapes and a wisp.
// Cloud textures grown from noise, nine kinds in a 3x3 atlas: three cumulus,
// a tall congestus, a stratocumulus bank, an altocumulus patch, fibrous cirrus,
// ragged fractus and a stretched wisp. Alpha holds the cloud's density.
function cloudAtlas() {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S * 3;
  const c = cv.getContext('2d');
  const img = c.createImageData(S * 3, S * 3);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let cell = 0; cell < 9; cell++) {
    const nz = noise2(31 + cell * 7);
    const ox = (cell % 3) * S, oy = Math.floor(cell / 3) * S;
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const x = px / S, y = py / S;                      // y runs downward
      const n = nz.fbm(x * 5, y * 5, 3) * 0.5 + 0.5, n2 = nz.fbm(x * 6 + 3, y * 6 + 7, 2) * 0.5 + 0.5;
      let m, d;
      if (cell <= 3) {
        // cumulus: a lumpy dome on a flat base; cell 3 is tall and towering
        const tall = cell === 3;
        const base = tall ? 0.86 : 0.7;
        const rx = tall ? 0.3 : 0.44 - cell * 0.03, ry = tall ? 0.78 : 0.5 + cell * 0.04;
        const dx = (x - 0.5) / rx, dy = (base - y) / ry;
        m = (1 - Math.hypot(dx, Math.max(dy, 0) * 1.0 + Math.min(dy, 0) * 4)) + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.35;
        m *= ss(base + 0.04, base - 0.04, y);
        d = ss(0.05, 0.45, m);
      } else if (cell === 4) {
        // stratocumulus: a wide lumpy bank
        m = (1 - Math.hypot((x - 0.5) / 0.5, (y - 0.55) / 0.2)) + (n - 0.5) * 1.0;
        d = ss(0.05, 0.5, m) * (0.75 + 0.25 * n2);
      } else if (cell === 5) {
        // altocumulus: a patch of small rounded cloudlets
        const cl = ss(0.5, 0.75, nz.fbm(x * 6, y * 6, 2) * 0.5 + 0.5);
        d = cl * ss(0.0, 0.5, 1 - Math.hypot((x - 0.5) / 0.48, (y - 0.5) / 0.38)) * (0.6 + 0.4 * n);
      } else if (cell === 6) {
        // cirrus: fine fibres combed out by high winds
        const u = x + y * 0.25, v = y;
        const fib = Math.pow(nz.fbm(u * 2.2, v * 11, 3) * 0.5 + 0.5, 2.0);
        d = fib * ss(0.0, 0.45, 1 - Math.hypot((x - 0.5) / 0.5, (y - 0.5) / 0.3)) * 1.4;
      } else if (cell === 7) {
        // fractus: small, ragged, torn
        m = (1 - Math.hypot((x - 0.5) / 0.36, (y - 0.5) / 0.22)) + (n - 0.5) * 1.4;
        d = ss(0.15, 0.5, m) * (0.5 + 0.5 * n2);
      } else {
        // a long stretched wisp
        m = (1 - Math.hypot((x - 0.5) / 0.5, (y - 0.5) / 0.12)) + (nz.fbm(x * 3, y * 9, 2)) * 0.6;
        d = ss(0.1, 0.6, m) * 0.7;
      }
      const i = ((oy + py) * S * 3 + ox + px) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(Math.min(1, Math.max(0, d)) * 255);
    }
  }
  c.putImageData(img, 0, 0);
  // soften: a light blur so edges feather rather than speckle
  const out = document.createElement('canvas');
  out.width = out.height = S * 3;
  const o = out.getContext('2d');
  o.filter = 'blur(2px)';
  o.drawImage(cv, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

// ===================================================================== Cloud flight
// Flying through a sky full of different white clouds: puffy cumulus, tall
// towers on the horizon, flat layers above and below, and wisps. Pass
// straight through some of them in a soft white-out.
export class CloudFlightScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [0.5, 0.45, -0.75];
    this.group.add(sky(U, { top: '#3f6ea8', horizon: '#d6e1ec', ground: '#e8eef5', sunDir: sun, sunCol: '#fff2d8', clouds: 0.1, cloudCol: '#f4f6fa', cloudSpeed: 0.002, sunSize: 1.1, radius: 300 }));
    // flat cloud layer far below, and thin stratus overhead
    const layer = (y, scale, cov, alpha) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...U, uY: { value: y } },
        vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
        fragmentShader: /* glsl */ `uniform float uTime, uTravel, uFade, uY; varying vec3 vW; ${NOISE} ${GRADE}
          void main(){ vec2 p = vW.xz * ${scale.toFixed(4)} + vec2(0.0, -uTravel * ${scale.toFixed(4)});
            float n = fbm(vec3(p, uTime * 0.01)) + fbm(vec3(p * 3.1, 1.0)) * 0.25;
            float c = smoothstep(${(1 - cov).toFixed(2)}, ${(1 - cov + 0.3).toFixed(2)}, n);
            float lit = mix(0.78, 1.0, smoothstep(0.4, 0.9, n));
            float far = 1.0 - smoothstep(120.0, 290.0, length(vW.xz - cameraPosition.xz));
            gl_FragColor = vec4(grade(vec3(lit) * (uY > 0.0 ? vec3(0.95, 0.97, 1.0) : vec3(1.0))), c * ${alpha.toFixed(2)} * far * uFade); }`,
      }));
      m.position.y = y;
      m.renderOrder = -2;
      m.frustumCulled = false;
      return m;
    };
    this.group.add(layer(-30, 0.012, 0.75, 1));
    // cloud puffs: camera-facing soft sprites, grouped into clusters of different types
    const r = rng(12);
    const puffs = [];
    const L = 420;
    this.L = L;
    // [x, y, z, size, rotation seed, cell]
    const put = (x, y, z, size, cell) => puffs.push([x, y, z, size, r(), cell]);
    const cumulus = (cx, cy, cz, big) => {
      const cnt = big ? 9 : 5;
      for (let i = 0; i < cnt; i++) put(cx + (r() - 0.5) * (big ? 26 : 14), cy + r() * (big ? 9 : 4), cz + (r() - 0.5) * (big ? 22 : 12), (big ? 13 : 8) + r() * 8, Math.floor(r() * 3));
      if (r() < 0.6) put(cx + (r() - 0.5) * 20, cy - 2, cz + (r() - 0.5) * 14, 6 + r() * 4, 7);   // ragged bits round the base
    };
    for (let i = 0; i < 22; i++) {
      const lane = r() < 0.25; // some sit right on the flight path, so you fly through them
      cumulus(lane ? (r() - 0.5) * 8 : (r() < 0.5 ? -1 : 1) * (12 + r() * 55), lane ? -2 + r() * 6 : -12 + r() * 26, -r() * L, r() < 0.4);
    }
    // big billowing cumulus far off to the sides: broad clusters, not stacked columns
    for (let i = 0; i < 6; i++) { const x = (r() < 0.5 ? -1 : 1) * (100 + r() * 60), z = -r() * L; for (let k = 0; k < 4; k++) put(x + (k - 1.5) * 26 + (r() - 0.5) * 10, -12 + r() * 10, z + (r() - 0.5) * 24, 34 + r() * 14, k === 1 || k === 2 ? 3 : Math.floor(r() * 3)); }
    for (let i = 0; i < 9; i++) put((r() - 0.5) * 260, -18 + r() * 8, -r() * L, 34 + r() * 18, 4);          // stratocumulus banks below
    for (let i = 0; i < 10; i++) put((r() - 0.5) * 240, 45 + r() * 15, -r() * L, 35 + r() * 20, 5);           // altocumulus patches above
    for (let i = 0; i < 9; i++) put((r() - 0.5) * 300, 85 + r() * 25, -r() * L, 70 + r() * 40, 6);            // high cirrus
    this.puffs = puffs;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aP', new THREE.InstancedBufferAttribute(new Float32Array(puffs.flatMap((p) => p.slice(0, 4))), 4));
    g.setAttribute('aS', new THREE.InstancedBufferAttribute(new Float32Array(puffs.flatMap((p) => [p[4], p[5]])), 2));
    g.instanceCount = puffs.length;
    Object.assign(U, { uSunV: { value: new THREE.Vector3(...sun).normalize() }, uL: { value: L }, uAtlas: { value: cloudAtlas() } });
    const mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: /* glsl */ `attribute vec4 aP; attribute vec2 aS; uniform float uTravel, uL; varying vec2 vUv; varying vec2 vS; varying float vA;
        void main(){
          vec3 c = aP.xyz; c.z = mod(c.z + uTravel, uL) - uL + 25.0;
          vec3 toCam = cameraPosition - c;
          float dist = length(toCam);
          // fade far away, and fade out well before a card gets close enough to look flat
          vA = smoothstep(uL - 25.0, uL - 140.0, dist) * smoothstep(aP.w * 1.1, aP.w * 2.6, dist);
          vec3 f = toCam / max(dist, 1e-3);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), f));
          vec3 up = cross(f, right);
          vec2 sz = aP.w * (aS.y > 5.5 && aS.y < 6.5 ? vec2(2.4, 1.3) : aS.y > 3.5 && aS.y < 5.5 ? vec2(2.0, 1.4) : aS.y > 2.5 && aS.y < 3.5 ? vec2(1.7, 1.7) : vec2(1.9, 1.5));
          vec3 w = c + right * position.x * sz.x + up * position.y * sz.y;
          vUv = position.xy + 0.5; vS = aS;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `uniform sampler2D uAtlas; uniform vec3 uSunV; uniform float uFade; varying vec2 vUv; varying vec2 vS; varying float vA;
        float dens(float cell, vec2 p){
          p = clamp(p, 0.004, 0.996);
          vec2 uv = vec2((mod(cell, 3.0) + p.x) / 3.0, 1.0 - (floor(cell / 3.0) + 1.0 - p.y) / 3.0);
          return texture2D(uAtlas, uv).a;
        }
        void main(){
          float cell = floor(vS.y + 0.5);   // round: a tiny error would pick a neighbouring cloud
          vec2 p = vUv;
          if (fract(vS.x * 7.0) > 0.5) p.x = 1.0 - p.x;               // mirror some, so no two look alike
          float d0 = dens(cell, p);
          // light from the sun's side: denser cloud toward the sun means shadow here
          vec2 toSun = normalize(vec2(uSunV.x, uSunV.y + 0.25)) * 0.05;
          float d1 = dens(cell, p + toSun), d2 = dens(cell, p + toSun * 2.0);
          float shade = exp(-(d1 * 1.1 + d2 * 0.7) * 1.4);
          float base = smoothstep(0.15, 0.55, p.y);                    // flat grey bases, brighter tops
          vec3 sunlit = vec3(1.0, 0.98, 0.93), sky = vec3(0.6, 0.67, 0.78), deep = vec3(0.46, 0.5, 0.6);
          vec3 c = mix(mix(deep, sky, base), sunlit, clamp(shade * 0.85 + (1.0 - d0) * 0.25, 0.0, 1.0));
          c += vec3(1.0, 0.95, 0.85) * smoothstep(0.35, 0.0, d0) * shade * 0.25;   // silver lining at the thin edges
          float a = smoothstep(0.1, 0.6, d0) * (cell > 5.5 && cell < 6.5 ? 0.45 : 1.0);
          gl_FragColor = vec4(c, a * vA * uFade);
        }`,
    }));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    // white-out when you pass through a cloud
    // soft white-out all around you while inside a cloud (a sphere, so it has no edges)
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2f6fc, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: THREE.BackSide }));
    this.veil.renderOrder = 930;
    this.attached = false;
    this.veilAmt = 0;
  }
  update(dt) {
    if (!this.attached) {
      const cam = this.group.parent?.children.find((c) => c.isCamera);
      if (cam) { cam.add(this.veil); this.attached = true; }
    }
    const travel = this.uniforms.uTravel.value;
    let inside = 0;
    for (const [x, y, z, s, , cell] of this.puffs) {
      if (cell > 2.5 && cell !== 7) continue;
      const zz = ((z + travel) % this.L + this.L) % this.L - this.L + 25;
      const d = Math.hypot(x, y - 1.6, zz);
      if (d < s * 1.4) inside = Math.max(inside, 1 - d / (s * 1.4));
    }
    this.veilAmt = damp(this.veilAmt, inside, 3, dt);
    this.veil.material.opacity = Math.min(0.8, this.veilAmt * 1.3) * this.fade;
  }
  dispose() { this.veil.removeFromParent(); this.veil.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); super.dispose(); }
}

