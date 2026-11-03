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
function cloudAtlas() {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S * 2;
  const c = cv.getContext('2d');
  const r = rng(99);
  const g = () => (r() + r() + r() - 1.5) / 1.5;
  for (let cell = 0; cell < 4; cell++) {
    const ox = (cell % 2) * S, oy = Math.floor(cell / 2) * S;
    c.save();
    c.beginPath(); c.rect(ox, oy, S, S); c.clip();
    const wisp = cell === 3;
    const n = wisp ? 90 : 140;
    for (let i = 0; i < n; i++) {
      let x, y, rad;
      if (wisp) { x = 0.5 + g() * 0.32; y = 0.5 + g() * 0.06; rad = 0.05 + r() * 0.08; }
      else {
        const t = r();
        x = 0.5 + g() * (0.22 + t * 0.1);
        y = 0.62 - Math.abs(g()) * (0.18 + (1 - Math.abs(x - 0.5) * 2) * 0.22);  // domed top, flat base
        rad = 0.05 + r() * 0.11 * (1 - Math.abs(x - 0.5));
      }
      const px = ox + x * S, py = oy + y * S, pr = rad * S;
      const gr = c.createRadialGradient(px, py, 0, px, py, pr);
      gr.addColorStop(0, 'rgba(255,255,255,0.45)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.22)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = gr;
      if (wisp) { c.save(); c.translate(px, py); c.scale(3.2, 0.7); c.translate(-px, -py); }
      c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
      if (wisp) c.restore();
    }
    if (!wisp) { // soften the flat base
      const fade = c.createLinearGradient(0, oy + S * 0.6, 0, oy + S * 0.72);
      fade.addColorStop(0, 'rgba(0,0,0,0)');
      fade.addColorStop(1, 'rgba(0,0,0,1)');
      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = fade;
      c.fillRect(ox, oy + S * 0.6, S, S * 0.4);
    }
    c.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
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
    this.group.add(sky(U, { top: '#2f6fc4', horizon: '#dceefe', ground: '#f4f8ff', sunDir: sun, sunCol: '#fff4dc', clouds: 0.25, cloudCol: '#ffffff', cloudSpeed: 0.002, sunSize: 1.3, radius: 300 }));
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
    const cluster = (cx, cy, cz, kind) => {
      const cnt = kind === 'tower' ? 22 : kind === 'wisp' ? 6 : 12;
      for (let i = 0; i < cnt; i++) {
        let x = cx, y = cy, z = cz, s;
        if (kind === 'tower') { x += (r() - 0.5) * 30; y += r() * 70; z += (r() - 0.5) * 30; s = 22 + r() * 18; }
        else if (kind === 'wisp') { x += (r() - 0.5) * 40; y += (r() - 0.5) * 3; z += (r() - 0.5) * 12; s = 18 + r() * 12; }
        else { x += (r() - 0.5) * 16; y += r() * 7 - 1; z += (r() - 0.5) * 16; s = 7 + r() * 9; }
        puffs.push([x, y, z, s, r(), kind === 'wisp' ? 1 : 0]);
      }
    };
    for (let i = 0; i < 26; i++) {
      const lane = r() < 0.25; // some sit right on the flight path, so you fly through them
      cluster(lane ? (r() - 0.5) * 8 : (r() < 0.5 ? -1 : 1) * (12 + r() * 50), lane ? -2 + r() * 6 : -12 + r() * 30, -r() * L, 'cumulus');
    }
    for (let i = 0; i < 6; i++) cluster((r() < 0.5 ? -1 : 1) * (90 + r() * 60), -30, -r() * L, 'tower');
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
          vec2 sz = aP.w * (aS.y > 0.5 ? vec2(3.0, 0.8) : vec2(1.9, 1.5));
          vec3 w = c + right * position.x * sz.x + up * position.y * sz.y;
          vUv = position.xy + 0.5; vS = aS;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `uniform sampler2D uAtlas; uniform vec3 uSunV; uniform float uFade; varying vec2 vUv; varying vec2 vS; varying float vA;
        void main(){
          float cell = vS.y > 0.5 ? 3.0 : floor(vS.x * 2.999);
          vec2 uv = vec2((mod(cell, 2.0) + vUv.x) * 0.5, 0.5 - floor(cell / 2.0) * 0.5 + vUv.y * 0.5);
          float a = texture2D(uAtlas, uv).a;
          float up = clamp(vUv.y * 1.25 - 0.05, 0.0, 1.0);
          float side = 0.5 + 0.5 * dot(normalize(vec2(vUv.x - 0.5, 0.35)), normalize(uSunV.xy + vec2(0.0, 0.3)));
          vec3 shadow = vec3(0.72, 0.77, 0.86), lit = vec3(1.0, 0.99, 0.97);
          vec3 c = mix(shadow, lit, clamp(up * 0.75 + side * 0.25 + (1.0 - a) * 0.35, 0.0, 1.0));
          gl_FragColor = vec4(c, clamp(a * 1.6, 0.0, 1.0) * vA * uFade);
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
    for (const [x, y, z, s] of this.puffs) {
      const zz = ((z + travel) % this.L + this.L) % this.L - this.L + 25;
      const d = Math.hypot(x, y - 1.6, zz);
      if (d < s * 1.4) inside = Math.max(inside, 1 - d / (s * 1.4));
    }
    this.veilAmt = damp(this.veilAmt, inside, 3, dt);
    this.veil.material.opacity = Math.min(0.8, this.veilAmt * 1.3) * this.fade;
  }
  dispose() { this.veil.removeFromParent(); this.veil.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); }); super.dispose(); }
}

