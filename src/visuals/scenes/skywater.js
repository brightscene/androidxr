import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
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
    const L = { count: 420, min: [-45, 0, -60], max: [45, 32, -5], vel: [0.06, 0.3, -0.05], sway: 0.6, size: [0.55, 1.0], shape: 'lantern', colors: ['#ff9a3c', '#ffb85a', '#ff7f3a'], clear: 6 };
    this.lanterns = particles(U, L);
    this.group.add(this.lanterns);
    const refl = particles(U, { ...L, alpha: 0.28 });
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
    this.group.add(layer(45, 0.008, 0.45, 0.55));
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
    for (let i = 0; i < 8; i++) cluster((r() - 0.5) * 120, 22 + r() * 15, -r() * L, 'wisp');
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
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float dist = length(mv.xyz);
          vA = smoothstep(uL - 25.0, uL - 140.0, dist) * smoothstep(aP.w * 0.25, aP.w * 0.9, dist);
          vec2 sz = aP.w * (aS.y > 0.5 ? vec2(3.0, 0.8) : vec2(1.9, 1.5));
          mv.xy += position.xy * sz;
          vUv = position.xy + 0.5; vS = aS;
          gl_Position = projectionMatrix * mv;
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
    this.veil = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ color: 0xf6f9ff, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.veil.position.z = -0.3;
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
      if (d < s * 0.6) inside = Math.max(inside, 1 - d / (s * 0.6));
    }
    this.veilAmt = damp(this.veilAmt, inside, 3, dt);
    this.veil.material.opacity = Math.min(0.85, this.veilAmt * 1.4) * this.fade;
  }
  dispose() { this.veil.removeFromParent(); super.dispose(); }
}

// ===================================================================== Lotus pond
// Lotus flowers glowing on a moonlit pond. They open as you breathe in, and
// more of them bloom as the session deepens.
export class LotusPondScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const moon = [-0.3, 0.4, -1];
    this.group.add(sky(U, { top: '#050a1c', horizon: '#26305e', ground: '#060a14', sunDir: [0, -1, 0], sunCol: '#000000', stars: 0.8, moon: 1, moonDir: moon, clouds: 0.2, cloudCol: '#3a4470' }));
    this.group.add(hills(U, 19, { inner: 60, h: 14, sun: moon, fog: '#1d2550', color: '#0b1410', ambient: 0.35 }));
    this.water = water(U, { deep: '#020810', top: '#16224a', horizon: '#26305e', sunDir: moon, sunCol: '#dfe6ff', wave: 0.2, glint: 0.7, fogFar: 130 });
    this.water.position.y = -0.3;
    this.group.add(this.water);
    // lily pads
    const r = rng(33);
    const pads = [];
    this.flowers = [];
    const petal = new THREE.Shape();
    petal.moveTo(0, 0); petal.bezierCurveTo(0.12, 0.12, 0.1, 0.36, 0, 0.5); petal.bezierCurveTo(-0.1, 0.36, -0.12, 0.12, 0, 0);
    const petalGeo = new THREE.ShapeGeometry(petal, 10);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = i < 22 ? 2.2 + Math.pow(r(), 0.9) * 9 : 3 + Math.pow(r(), 0.8) * 18;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const pg = new THREE.CircleGeometry(0.35 + r() * 0.35, 18, 0.3, Math.PI * 2 - 0.3).rotateX(-Math.PI / 2);
      pg.rotateY(r() * 6.28);
      pg.translate(x, -0.27, z);
      pads.push(pg);
      if (i < 22) {
        const f = new THREE.Group();
        f.position.set(x + 0.1, -0.22, z + 0.1);
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.92 + r() * 0.08, 0.75, 0.75), transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
        const petals = [];
        for (let ring = 0; ring < 2; ring++) for (let k = 0; k < 8; k++) {
          const m = new THREE.Mesh(petalGeo, mat);
          m.userData = { a: (k / 8) * Math.PI * 2 + ring * 0.4, ring };
          petals.push(m);
          f.add(m);
        }
        const core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe28a, transparent: true, opacity: 0 }));
        f.add(core);
        f.userData = { petals, mat, core, order: i, open: 0, seed: r() };
        f.scale.setScalar(1.7 + r() * 0.9);
        this.group.add(f);
        this.flowers.push(f);
      }
    }
    const padMesh = new THREE.Mesh(mergeGeos(pads), solidMat(U, { color: '#2c6a3c', color2: '#3f8a4a', sunDir: moon, ambient: 0.6, fog: '#1d2550', fogFar: 130, side: THREE.DoubleSide }));
    this.group.add(padMesh);
    this.group.add(particles(U, { count: 160, min: [-15, 0.1, -15], max: [15, 3, 15], vel: [0.08, 0.04, 0.05], sway: 0.8, size: [0.03, 0.05], shape: 'firefly', colors: ['#e6ff8a'], glow: 1.5 }));
    this.bloom = 6;
  }
  onCue(name) { if (name === 'bloom') this.bloom = 22; }
  onEvent(e) {
    if (e.type === 'section') this.bloom = Math.max(this.bloom, [6, 10, 15, 22, 22][e.index] ?? 22);
    if (e.type === 'note') this.water.userData.ripple(e.pos[0], e.pos[2], 0.5 + e.vel);
  }
  update(dt, t, s) {
    for (const f of this.flowers) {
      const u = f.userData;
      const want = u.order < this.bloom ? 0.35 + s.breath * 0.65 : 0;
      u.open = damp(u.open, want, 1.5, dt);
      for (const p of u.petals) {
        const { a, ring } = p.userData;
        p.rotation.set(0, 0, 0);
        p.rotation.y = a;
        p.rotateX(-(0.15 + u.open * 1.05 + ring * 0.3));
      }
      const vis = Math.min(1, u.open * 2.5) * this.fade;
      u.mat.opacity = vis;
      u.core.material.opacity = vis;
    }
  }
}

// ===================================================================== Bamboo grove
// Tall bamboo creaking gently in the wind, soft shafts of light through the
// canopy, leaves spiralling down.
export class BambooGroveScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [0.3, 0.8, -0.4];
    this.group.add(sky(U, { top: '#9cc7a0', horizon: '#e4eedc', ground: '#4d5a3a', sunDir: sun, sunCol: '#fff6d8', clouds: 0.2 }));
    const n = noise2(51);
    this.group.add(terrain(U, {
      size: 200, seg: 100, height: (x, z) => n.fbm(x * 0.05, z * 0.05) * 1.5 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 3, 30),
      sunDir: sun, fog: '#cfe0c4', fogNear: 10, fogFar: 70, ambient: 0.55, color: (x, z) => mix3(hex('#5a5a2c'), hex('#7a6a3a'), clamp01(0.5 + n(x * 0.3, z * 0.3))),
    }));
    const r = rng(44);
    const stalks = [];
    for (let i = 0; i < 220; i++) {
      const a = r() * Math.PI * 2, d = 2.2 + Math.pow(r(), 0.7) * 34, h = 10 + r() * 8, rad = 0.05 + r() * 0.07;
      const g = new THREE.CylinderGeometry(rad, rad * 1.1, h, 7, 24);
      g.translate(0, h / 2, 0);
      const s = new Float32Array(g.attributes.position.count).fill(r());
      g.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
      g.translate(Math.cos(a) * d, -0.2, Math.sin(a) * d);
      stalks.push(g);
    }
    Object.assign(U, { uWind: { value: 0 } });
    const mesh = new THREE.Mesh(mergeGeos(stalks), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uWind, uBreath; varying float vY; varying float vS; varying vec3 vN; varying float vD;
        void main(){ vec3 p = position; vY = p.y; vS = aSeed; vN = normal;
          float k = pow(max(p.y, 0.0) / 16.0, 2.0) * (0.6 + uWind + uBreath * 0.2);
          p.x += sin(uTime * 0.5 + aSeed * 30.0) * k; p.z += cos(uTime * 0.4 + aSeed * 21.0) * k * 0.7;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vY; varying float vS; varying vec3 vN; varying float vD;
        void main(){ float node = smoothstep(0.06, 0.0, abs(fract(vY / (1.1 + vS * 0.5)) - 0.5) - 0.44);
          vec3 c = mix(vec3(0.35, 0.55, 0.18), vec3(0.62, 0.7, 0.3), vS) * (0.75 + 0.35 * max(dot(normalize(vN), normalize(vec3(0.4, 0.3, 0.6))), 0.0));
          c = mix(c, vec3(0.3, 0.38, 0.15), node * 0.8);
          c = mix(c, vec3(0.81, 0.88, 0.77), smoothstep(8.0, 60.0, vD));
          gl_FragColor = vec4(c, uFade); }`,
    }));
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.group.add(particles(U, { count: 3500, min: [-36, 9, -36], max: [36, 17, 36], size: [0.25, 0.5], shape: 'leaf', colors: ['#5f8a2a', '#7aa03a', '#4a7020'], normal: true, alpha: 0.9 }));
    this.leaves = particles(U, { count: 260, min: [-15, 0, -15], max: [15, 9, 15], vel: [0.2, -0.4, 0.1], sway: 1, size: [0.05, 0.09], shape: 'leaf', colors: ['#9ab84a', '#c8b04a'], normal: true, alpha: 0.85 });
    this.group.add(this.leaves);
    // shafts of light
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4 + r() * 2, 26), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { ...U, uPh: { value: r() * 10 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uTime, uFade, uPh, uBreath; varying vec2 vUv; void main(){ float a = sin(vUv.x * 3.14159) * smoothstep(0.0, 0.6, vUv.y) * (0.6 + 0.4 * sin(uTime * 0.3 + uPh)); gl_FragColor = vec4(vec3(1.0, 0.97, 0.82) * a * (0.14 + uBreath * 0.04) * uFade, 1.0); }',
      }));
      const a = r() * Math.PI * 2, d = 4 + r() * 18;
      m.position.set(Math.cos(a) * d, 9, Math.sin(a) * d);
      m.rotation.set(0, r() * Math.PI, 0.35);
      this.group.add(m);
    }
  }
  onEvent(e) { if (e.type === 'chord') this.uniforms.uWind.value = 1.2; }
  update(dt) { this.uniforms.uWind.value *= Math.exp(-dt * 0.3); }
}

// ===================================================================== Floating islands
// Islands of rock and grass hang in a pastel sunset sky, each with a glowing
// tree and a thin waterfall spilling into the clouds below.
export class FloatingIslandsScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [-0.6, 0.12, -0.8];
    this.group.add(sky(U, { top: '#5b5fb0', horizon: '#ffc9a8', ground: '#f3d6e4', sunDir: sun, sunCol: '#ffd2a0', clouds: 0.4, cloudCol: '#ffe0e8', sunSize: 1.5 }));
    const below = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vW; ${NOISE}
        void main(){ float n = fbm(vec3(vW.xz * 0.02, uTime * 0.01)); float c = smoothstep(0.3, 0.7, n);
          vec3 col = mix(vec3(1.0, 0.82, 0.86), vec3(1.0, 0.95, 0.92), n);
          gl_FragColor = vec4(col, (0.6 + c * 0.4) * uFade * (1.0 - smoothstep(150.0, 300.0, length(vW.xz)))); }`,
    }));
    below.position.y = -30;
    below.renderOrder = -4;
    this.group.add(below);
    const r = rng(8);
    const n = noise2(8);
    const rock = solidMat(U, { color: '#6b5a66', color2: '#8a7468', sunDir: sun, ambient: 0.5, fog: '#ffd6c6', fogFar: 240 });
    const grass = solidMat(U, { color: '#5e8a4a', color2: '#7aa85a', sunDir: sun, ambient: 0.55, fog: '#ffd6c6', fogFar: 240 });
    const bark = solidMat(U, { color: '#3a2a2a', sunDir: sun, ambient: 0.5, fog: '#ffd6c6', fogFar: 240 });
    this.islands = [];
    const spots = [[0, -0.2, 0, 4.5], [-16, 4, -22, 5], [20, -2, -30, 6], [-34, 8, -55, 8], [38, 12, -62, 7], [5, 18, -90, 10], [-60, -4, -30, 6], [55, 2, -15, 5]];
    for (const [x, y, z, s] of spots) {
      const g = new THREE.Group();
      const cone = new THREE.ConeGeometry(s, s * 1.6, 12, 6);
      cone.rotateX(Math.PI);
      const p = cone.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + n(p.getX(i) * 0.4 + x, p.getY(i) * 0.4 + z) * 0.35; p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k); }
      cone.computeVertexNormals();
      const body = new THREE.Mesh(cone, rock);
      body.position.y = -s * 0.8;
      g.add(body);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.02, s * 1.02, 0.4, 24), grass);
      g.add(top);
      if (s > 4.6) {
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, s * 0.7, 7), bark);
        trunk.position.set(s * 0.2, s * 0.35, 0);
        g.add(trunk);
        g.add(particles(U, { count: 500, min: [s * 0.2 - s * 0.35, s * 0.6, -s * 0.35], max: [s * 0.2 + s * 0.35, s * 1.0, s * 0.35], size: [0.25, 0.45], colors: ['#ffd1e8', '#ffe9a8', '#c8f0ff'], alpha: 0.75, glow: 1.2 }));
        g.add(particles(U, { count: 220, min: [s * 0.95, -s * 3, -0.25], max: [s * 1.05, 0, 0.25], vel: [0, -3, 0], size: [0.08, 0.16], colors: ['#e8f6ff'], alpha: 0.6 }));
      }
      g.position.set(x, y, z);
      g.userData = { y, ph: r() * 6 };
      this.group.add(g);
      this.islands.push(g);
    }
    this.group.add(particles(U, { count: 400, min: [-40, -10, -60], max: [40, 25, 10], vel: [0.1, 0.05, 0.1], sway: 1, size: [0.04, 0.08], colors: ['#fff2c8'], alpha: 0.6, clear: 4 }));
  }
  update(dt, t, s) {
    // the island you stand on stays put; the others bob gently
    this.islands.forEach((g, i) => { if (i) g.position.y = g.userData.y + Math.sin(t * 0.25 + g.userData.ph) * 0.4; });
  }
}
