import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
import { sky, terrain, water, particles, solidMat, noise2, rng, mix3, hex, clamp01 } from './kit.js';

// ===================================================================== Meadow
// Wind-swept grass under drifting clouds. Chords send gusts rolling across
// the field; your breath sways it gently; notes lift pollen into the light.
export class MeadowScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [0.55, 0.32, -0.75];
    this.group.add(sky(U, { top: '#3f78c4', horizon: '#f6e2bf', ground: '#58703a', sunDir: sun, sunCol: '#fff0c8', clouds: 0.55, cloudCol: '#fffaf2', cloudSpeed: 0.007 }));
    const n = noise2(11);
    const H = (x, z) => { const r = Math.hypot(x, z); return n.fbm(x * 0.018, z * 0.018) * 7 * THREE.MathUtils.smoothstep(r, 6, 60) + n(x * 0.2, z * 0.2) * 0.08; };
    this.group.add(terrain(U, {
      size: 340, seg: 170, height: H, sunDir: sun, fog: '#dfe6dc', fogNear: 40, fogFar: 170, ambient: 0.45,
      color: (x, z, y) => mix3(hex('#3e6a24'), hex('#8aa84a'), clamp01(0.5 + n(x * 0.05, z * 0.05))),
    }));
    // grass: one tapered triangle per blade
    const N = 30000, r = rng(7);
    const pos = new Float32Array(N * 9), corner = new Float32Array(N * 3), info = new Float32Array(N * 9);
    for (let i = 0; i < N; i++) {
      const a = r() * Math.PI * 2, rr = 0.6 + Math.pow(r(), 0.6) * 24;
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = H(x, z);
      const h = 0.35 + r() * 0.55, rot = r() * Math.PI, sd = r();
      for (let k = 0; k < 3; k++) { pos.set([x, y, z], (i * 3 + k) * 3); corner[i * 3 + k] = k; info.set([h, rot, sd], (i * 3 + k) * 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aCorner', new THREE.BufferAttribute(corner, 1));
    g.setAttribute('aInfo', new THREE.BufferAttribute(info, 3));
    Object.assign(U, { uGust: { value: 0 }, uGustT: { value: -99 } });
    const grass = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, uniforms: U,
      vertexShader: /* glsl */ `attribute float aCorner; attribute vec3 aInfo; uniform float uTime, uBreath, uGust, uGustT;
        varying float vT; varying float vS; varying float vD; varying vec2 vXZ; varying float vBend;
        void main(){
          float h = aInfo.x, rot = aInfo.y; vS = aInfo.z; vXZ = position.xz;
          vec3 p = position;
          vec2 side = vec2(cos(rot), sin(rot)) * 0.028;
          float tip = step(1.5, aCorner);
          vT = tip;
          vec2 wd = normalize(vec2(1.0, 0.35));
          float wave = sin(dot(p.xz, wd) * 0.35 - uTime * 1.4) * 0.5 + sin(dot(p.xz, wd.yx) * 0.9 - uTime * 2.3) * 0.2;
          float front = dot(p.xz, wd) + 30.0 - (uTime - uGustT) * 9.0;
          float gust = exp(-front * front * 0.02) * uGust;
          float bend = (0.25 + wave * 0.35 + gust * 1.2 + uBreath * 0.12) * tip;
          vBend = bend;
          if (aCorner < 0.5) p.xz -= side; else if (aCorner < 1.5) p.xz += side;
          else { p.y += h * (1.0 - bend * 0.35); p.xz += wd * bend * h * 0.8; }
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vT; varying float vS; varying float vD; varying vec2 vXZ; varying float vBend;
        ${NOISE}
        ${GRADE}
        void main(){
          float clump = vnoise(vec3(vXZ * 0.18, 1.0));
          vec3 base = vec3(0.09, 0.18, 0.05);
          vec3 tipc = mix(vec3(0.5, 0.68, 0.24), vec3(0.78, 0.76, 0.4), smoothstep(0.35, 0.75, clump) * 0.8 + vS * 0.2);
          vec3 c = mix(base, tipc, pow(vT, 0.8));
          c += vec3(0.3, 0.26, 0.08) * vT * vBend * 0.35;                 // sunlit, translucent tips as they bend
          c *= 0.85 + vS * 0.3;
          c = mix(c, vec3(0.86, 0.88, 0.8), smoothstep(12.0, 26.0, vD) * 0.55);
          gl_FragColor = vec4(grade(c), uFade);
        }`,
    }));
    grass.frustumCulled = false;
    grass.renderOrder = -2;
    this.group.add(grass);
    // wildflowers and pollen
    this.group.add(particles(U, { count: 1600, min: [-22, 0.25, -22], max: [22, 0.55, 22], size: [0.04, 0.08], colors: ['#ffffff', '#ffe066', '#c9a0ff', '#ff9ec7'], normal: true, clear: 1 }));
    this.pollen = particles(U, { count: 500, min: [-14, 0.4, -14], max: [14, 3.5, 14], vel: [0.25, 0.05, 0.1], sway: 0.6, size: [0.015, 0.03], colors: ['#fff6c8'], alpha: 0.7 });
    this.group.add(this.pollen);
    // birds drifting across the sky
    this.group.add(particles(U, { count: 14, min: [-80, 18, -90], max: [80, 30, -40], vel: [2.5, 0, 0.3], sway: 1.5, size: [0.6, 0.9], shape: 'leaf', colors: ['#2a2a30'], normal: true }));
  }
  onCue(name) { if (name === 'gust') { this.uniforms.uGust.value = 1.6; this.uniforms.uGustT.value = this.uniforms.uTime.value; } }
  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'chord') { U.uGust.value = 1; U.uGustT.value = U.uTime.value; }
    if (e.type === 'note') this.pollen.userData.u.uBoost.value = 1.5;
  }
  update(dt) {
    this.uniforms.uGust.value *= Math.exp(-dt * 0.15);
    this.pollen.userData.u.uBoost.value *= Math.exp(-dt * 2);
  }
}

// ===================================================================== Beach
// A bright white-sand beach. Swells roll in, steepen, break into foam and wash
// up the sand before sliding back, under fair-weather cumulus clouds.
export class BeachScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [-0.45, 0.62, -0.55];
    this.group.add(sky(U, { top: '#2f7fd6', horizon: '#d8eefa', ground: '#e9dcc0', sunDir: sun, sunCol: '#fffaf0', clouds: 0.5, cloudCol: '#ffffff', cloudSpeed: 0.005, sunSize: 1.4 }));
    const n = noise2(4);
    const sandY = (x, z) => (z > -1 ? 0.04 : 0.04 + (z + 1) * 0.07) + n(x * 0.3, z * 0.3) * 0.03 + (z > 6 ? (z - 6) * 0.08 : 0);
    this.group.add(terrain(U, {
      size: 220, seg: 200, height: (x, z) => (z < -40 ? sandY(x, -40) : sandY(x, z)), sunDir: sun, fog: '#d8eefa', fogNear: 60, fogFar: 200, ambient: 0.6,
      color: (x, z, y) => {
        const wet = clamp01((-z - 4.2) / 1.5);
        return mix3(mix3(hex('#f7f0df'), hex('#efe2c4'), clamp01(0.5 + n(x * 0.8, z * 0.8) * 0.8)), hex('#c9b48c'), wet * 0.8);
      },
    }));
    // the sea: dense near the shore for breaking waves, sparse far out
    const W = 260, cols = 180, rows = 150;
    const g = new THREE.PlaneGeometry(1, 1, cols, rows);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5;
      p.setXYZ(i, (u - 0.5) * W, 0, -5.2 - Math.pow(1 - v, 2.2) * 200);
    }
    Object.assign(U, { uSunDir: { value: new THREE.Vector3(...sun).normalize() }, uSwell: { value: 0 }, uCalm: { value: 0 } });
    const sea = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, uniforms: U,
      vertexShader: /* glsl */ `uniform float uTime, uBreath, uSwell, uCalm; varying vec3 vW; varying float vH; varying float vD; varying float vBreak;
        const float K = 6.2832 / 15.0; const float OM = K * 2.1;
        void main(){
          vec3 p = position;
          float d = -5.2 - p.z;                         // distance out from the shore line
          float lat = sin(p.x * 0.045) * 0.9 + sin(p.x * 0.11 + 1.3) * 0.35;
          float ph = K * d + OM * uTime + lat;
          float shoal = smoothstep(60.0, 9.0, d) * smoothstep(-0.5, 4.0, d);
          float crest = pow(0.5 + 0.5 * sin(ph), 2.0 + shoal * 6.0);
          float amp = (0.18 + shoal * 0.95 * (0.85 + uBreath * 0.25)) * (1.0 + uSwell * 0.7) * (1.0 - uCalm * 0.45);
          float h = crest * amp + sin(p.x * 0.2 + uTime * 0.7 + p.z * 0.1) * 0.05;
          vBreak = shoal * smoothstep(0.75, 1.0, crest);
          p.y = -0.32 + h - (1.0 - smoothstep(0.0, 3.0, d)) * 0.1;
          vH = h; vD = d; vW = (modelMatrix * vec4(p, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0);
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uSunDir; uniform float uTime, uFade; varying vec3 vW; varying float vH; varying float vD; varying float vBreak;
        ${NOISE} ${GRADE}
        void main(){
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.0) n = -n;
          vec3 v = normalize(vW - cameraPosition);
          vec3 r = reflect(v, n);
          float fres = pow(1.0 - max(dot(-v, n), 0.0), 4.0) * 0.8 + 0.06;
          vec3 shallow = vec3(0.25, 0.85, 0.82), deep = vec3(0.03, 0.32, 0.55);
          vec3 base = mix(shallow, deep, smoothstep(2.0, 45.0, vD));
          base += vec3(0.25, 0.4, 0.35) * smoothstep(0.2, 0.9, vH) * smoothstep(30.0, 6.0, vD) * 0.6; // light through the wave
          vec3 skyc = mix(vec3(0.85, 0.93, 0.98), vec3(0.22, 0.5, 0.85), pow(clamp(r.y, 0.0, 1.0), 0.5));
          vec3 c = mix(base, skyc, fres);
          c += vec3(1.0, 0.97, 0.9) * pow(max(dot(r, uSunDir), 0.0), 250.0) * 4.0;
          float tex = fbm(vec3(vW.xz * vec2(0.9, 1.6), uTime * 0.4));
          float foam = vBreak * smoothstep(0.35, 0.65, tex + vBreak * 0.4);
          foam += smoothstep(9.0, 0.0, vD) * smoothstep(0.45, 0.75, fbm(vec3(vW.xz * 1.3, uTime * 0.5))) * 0.9;
          c = mix(c, vec3(0.97, 0.98, 1.0), clamp(foam, 0.0, 1.0));
          c = mix(c, vec3(0.85, 0.93, 0.98), smoothstep(80.0, 200.0, vD));
          float edge = smoothstep(0.0, 0.8, vD);
          gl_FragColor = vec4(grade(c), uFade * edge);
        }`,
    }));
    sea.frustumCulled = false;
    sea.renderOrder = -3;
    this.group.add(sea);
    // swash: the thin sheet of foam that races up the sand and slides back after each break
    const sg = new THREE.PlaneGeometry(W, 6, 120, 12);
    sg.rotateX(-Math.PI / 2);
    sg.translate(0, 0, -3.4);
    const swash = new THREE.Mesh(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec3 p = position; p.y = (p.z > -1.0 ? 0.04 : 0.04 + (p.z + 1.0) * 0.07) + 0.012; vW = (modelMatrix * vec4(p,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vW;
        ${NOISE} ${GRADE}
        const float K = 6.2832 / 15.0; const float OM = K * 2.1;
        void main(){
          float lat = sin(vW.x * 0.045) * 0.9 + sin(vW.x * 0.11 + 1.3) * 0.35;
          float ph = fract((OM * uTime + lat - 1.5708) / 6.2832);
          float reach = sin(3.14159 * clamp(ph / 0.75, 0.0, 1.0));
          float front = -5.6 + reach * (2.6 + 0.4 * sin(vW.x * 0.3));
          float behind = smoothstep(front + 0.05, front - 0.3, vW.z);
          float line = exp(-pow((vW.z - front) * 7.0, 2.0)) * (0.6 + 0.4 * fbm(vec3(vW.x * 2.0, vW.z * 4.0, uTime)));
          float lace = smoothstep(0.5, 0.7, fbm(vec3(vW.xz * 3.0, uTime * 0.6))) * behind * 0.6;
          vec3 c = mix(vec3(0.55, 0.85, 0.85), vec3(1.0), clamp(line + lace, 0.0, 1.0));
          float a = clamp(behind * 0.45 + line + lace, 0.0, 1.0) * smoothstep(-5.9, -5.4, vW.z) + smoothstep(-5.3, -6.0, vW.z) * 0.0;
          gl_FragColor = vec4(grade(c), a * uFade);
        }`,
    }));
    swash.frustumCulled = false;
    swash.renderOrder = -2;
    this.group.add(swash);
    // spray drifting off the breakers, gulls overhead
    this.spray = particles(U, { count: 900, min: [-40, -0.2, -14], max: [40, 1.6, -6], vel: [0.2, 0.25, 0.3], sway: 0.4, size: [0.03, 0.08], colors: ['#ffffff'], alpha: 0.55 });
    this.group.add(this.spray);
    this.group.add(particles(U, { count: 10, min: [-60, 9, -70], max: [60, 18, -20], vel: [1.8, 0, -0.2], sway: 2, size: [0.5, 0.8], shape: 'leaf', colors: ['#f4f4f4'], normal: true }));
  }
  // a bigger set of waves rolls in on 'wave'; the sea settles on 'calm'
  onCue(name) {
    if (name === 'wave') { this.swellT = 1; this.calmT = 0; }
    if (name === 'calm') { this.calmT = 1; this.swellT = 0; }
  }
  onEvent(e) { if (e.type === 'note') this.spray.userData.u.uBoost.value = 0.8; }
  update(dt) {
    const U = this.uniforms;
    this.swellT = (this.swellT || 0) * Math.exp(-dt * 0.08);
    this.calmT = (this.calmT || 0) * Math.exp(-dt * 0.03);
    U.uSwell.value = damp(U.uSwell.value, this.swellT, 0.6, dt);
    U.uCalm.value = damp(U.uCalm.value, this.calmT, 0.4, dt);
    this.spray.userData.u.uBoost.value = Math.max(this.spray.userData.u.uBoost.value * Math.exp(-dt * 2), U.uSwell.value * 0.5);
  }
}

// ===================================================================== Underwater
// A sunlit kelp forest: rippling light from the surface, swaying kelp, rising
// bubbles, drifting plankton and a slow school of fish.
export class UnderwaterScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uFlare: { value: 0 } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlare, uBreath; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.0, 0.09, 0.16), vec3(0.08, 0.55, 0.68), smoothstep(-0.4, 0.9, d.y));
          float win = smoothstep(0.82, 0.92, d.y);
          float rip = fbm(vec3(d.xz * 9.0 / (d.y + 0.2), uTime * 0.4));
          c += vec3(0.7, 0.95, 1.0) * win * (0.5 + rip * 0.8);
          float rays = pow(fbm(vec3(atan(d.z, d.x) * 6.0, uTime * 0.15, 0.0)), 3.0) * smoothstep(0.0, 0.8, d.y);
          c += vec3(0.4, 0.8, 0.9) * rays * (0.6 + uFlare + uBreath * 0.2);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    dome.renderOrder = -5;
    this.group.add(dome);
    const n = noise2(23);
    const floorH = (x, z) => -1.2 + n.fbm(x * 0.05, z * 0.05) * 3 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 4, 40);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200, 140, 140).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){
          vec2 p = vW.xz * 0.9;
          float c1 = abs(sin(fbm(vec3(p, uTime * 0.35)) * 12.0));
          float c2 = abs(sin(fbm(vec3(p * 1.3 + 4.0, uTime * 0.3)) * 12.0));
          float caustic = pow(1.0 - min(c1, c2), 6.0);
          vec3 sand = mix(vec3(0.55, 0.52, 0.4), vec3(0.75, 0.7, 0.55), fbm(vec3(vW.xz * 2.0, 0.0)));
          vec3 c = sand * 0.5 + vec3(0.6, 0.95, 1.0) * caustic * 0.6;
          float dist = length(vW - cameraPosition);
          c = mix(c, vec3(0.0, 0.18, 0.26), smoothstep(6.0, 45.0, dist));
          gl_FragColor = vec4(grade(c), uFade);
        }`,
    }));
    floor.geometry.attributes.position.array.forEach((_, i, a) => { if (i % 3 === 1) a[i] = floorH(a[i - 1], a[i + 1]); });
    floor.renderOrder = -4;
    this.group.add(floor);
    // kelp
    const r = rng(5);
    const kelpMat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, uniforms: U,
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uBreath; varying float vY; varying float vS; varying float vD;
        void main(){ vec3 p = position; vY = uv.y; vS = aSeed;
          float sway = pow(uv.y, 1.5) * (0.8 + uBreath * 0.3);
          p.x += sin(uTime * 0.6 + aSeed * 20.0 + uv.y * 3.0) * sway; p.z += cos(uTime * 0.45 + aSeed * 13.0 + uv.y * 2.0) * sway * 0.6;
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vY; varying float vS; varying float vD;
        void main(){ vec3 c = mix(vec3(0.12, 0.22, 0.06), vec3(0.45, 0.6, 0.2), vY) * (0.7 + vS * 0.4);
          c = mix(c, vec3(0.0, 0.18, 0.26), smoothstep(6.0, 40.0, vD));
          gl_FragColor = vec4(c, 0.92 * uFade); }`,
    });
    const kelpGeo = [];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 2.5 + Math.pow(r(), 0.7) * 35, h = 6 + r() * 10;
      const pg = new THREE.PlaneGeometry(0.35 + r() * 0.3, h, 1, 24);
      pg.translate(0, h / 2, 0);
      pg.rotateY(r() * Math.PI);
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      pg.translate(x, floorH(x, z), z);
      const s = new Float32Array(pg.attributes.position.count).fill(r());
      pg.setAttribute('aSeed', new THREE.BufferAttribute(s, 1));
      kelpGeo.push(pg);
    }
    const merged = mergeGeos(kelpGeo);
    const kelp = new THREE.Mesh(merged, kelpMat);
    kelp.frustumCulled = false;
    this.group.add(kelp);
    this.bubbles = particles(U, { count: 600, min: [-15, -1, -15], max: [15, 14, 15], vel: [0, 0.9, 0], sway: 0.15, size: [0.03, 0.09], shape: 'bubble', colors: ['#cfefff'], alpha: 0.7 });
    this.group.add(this.bubbles);
    this.group.add(particles(U, { count: 1200, min: [-20, -1, -20], max: [20, 12, 20], vel: [0.05, 0.02, 0.08], sway: 0.4, size: [0.01, 0.025], colors: ['#bff7ff', '#9ff0d0'], alpha: 0.6 }));
    this.group.add(particles(U, { count: 90, min: [-40, 2, -30], max: [40, 5, -10], vel: [1.6, 0, 0], sway: 0.5, size: [0.12, 0.2], shape: 'leaf', colors: ['#cfe8f0', '#a8c8d8'], normal: true, alpha: 0.85 }));
  }
  onEvent(e) {
    if (e.type === 'note') this.bubbles.userData.u.uBoost.value = 1;
    if (e.type === 'chord') this.uniforms.uFlare.value = 0.8;
  }
  update(dt) { this.uniforms.uFlare.value *= Math.exp(-dt * 0.7); this.bubbles.userData.u.uBoost.value *= Math.exp(-dt * 2); }
}

// ===================================================================== Zen garden
// Raked sand rippling around mossy stones, cherry trees letting go of their
// blossom, and paper lanterns glowing as dusk falls. Petals grow fuller as
// the session deepens.
export class ZenGardenScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [0.7, 0.18, -0.6];
    this.group.add(sky(U, { top: '#5f74b0', horizon: '#f3c7b5', ground: '#4f5a46', sunDir: sun, sunCol: '#ffd7b0', clouds: 0.35, cloudCol: '#ffe4ea', cloudSpeed: 0.003 }));
    const n = noise2(9);
    this.group.add(terrain(U, {
      size: 300, seg: 120, height: (x, z) => { const r = Math.hypot(x, z); return r < 13 ? -0.02 : n.fbm(x * 0.03, z * 0.03) * 9 * THREE.MathUtils.smoothstep(r, 13, 60); },
      sunDir: sun, fog: '#e8c9c0', fogNear: 30, fogFar: 160, ambient: 0.45, color: (x, z, y) => mix3(hex('#3d5a2c'), hex('#6f8a4a'), clamp01(0.5 + n(x * 0.1, z * 0.1))),
    }));
    this.stones = [[-2.6, -4.2, 0.9], [2.2, -6.5, 1.3], [0.4, -3.2, 0.5], [4.5, -3.8, 0.7]];
    Object.assign(U, { uStones: { value: this.stones.map(([x, z, s]) => new THREE.Vector3(x, z, s)) } });
    const sand = new THREE.Mesh(new THREE.CircleGeometry(13, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uStones[4]; uniform float uFade; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){
          float best = 99.0; float ring = 0.0;
          for (int i = 0; i < 4; i++) { float d = length(vW.xz - uStones[i].xy) - uStones[i].z; if (d < best) best = d; }
          float rings = sin(best * 26.0);
          float lines = sin(vW.z * 26.0 + sin(vW.x * 0.4) * 0.6);
          float t = smoothstep(1.6, 1.2, best);
          float ridge = mix(lines, rings, t);
          vec3 c = vec3(0.9, 0.87, 0.8) * (0.86 + 0.14 * ridge) * (0.95 + 0.1 * fbm(vec3(vW.xz * 4.0, 0.0)));
          c *= smoothstep(13.0, 11.5, length(vW.xz)) * 0.25 + 0.75;
          gl_FragColor = vec4(grade(c), uFade);
        }`,
    }));
    sand.position.y = 0.005;
    sand.renderOrder = -3;
    this.group.add(sand);
    const stoneMat = solidMat(U, { color: '#4a4a48', color2: '#5d7a3c', sunDir: sun, ambient: 0.35, fog: '#e8c9c0', fogFar: 160 });
    for (const [x, z, s] of this.stones) {
      const g = new THREE.IcosahedronGeometry(s, 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + n(p.getX(i) * 2 + x, p.getZ(i) * 2 + z) * 0.25; p.setXYZ(i, p.getX(i) * k, Math.max(-0.1, p.getY(i) * 0.6 * k), p.getZ(i) * k); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, stoneMat);
      m.position.set(x, 0, z);
      this.group.add(m);
    }
    // cherry trees: dark trunks with clouds of blossom
    const trunkMat = solidMat(U, { color: '#3a2a22', color2: '#4a3528', sunDir: sun, ambient: 0.4, fog: '#e8c9c0', fogFar: 160 });
    for (const [x, z] of [[-9, -10], [10, -12], [-12, 4], [11, 3]]) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 4, 8), trunkMat);
      t.position.set(x, 2, z);
      t.rotation.z = (Math.random() - 0.5) * 0.3;
      this.group.add(t);
      this.group.add(particles(U, { count: 900, min: [x - 3, 3.2, z - 3], max: [x + 3, 6.2, z + 3], size: [0.1, 0.2], colors: ['#ffc7da', '#ffd9e6', '#ffb3cc'], normal: true, alpha: 0.85 }));
    }
    this.petals = particles(U, { count: 700, min: [-16, 0, -16], max: [16, 7, 16], vel: [0.3, -0.35, 0.1], sway: 0.7, size: [0.04, 0.07], shape: 'petal', colors: ['#ffc2d6', '#ffe0ea'], normal: true, alpha: 0.5 });
    this.group.add(this.petals);
    this.group.add(particles(U, { count: 18, min: [-11, 1.0, -11], max: [11, 2.2, 11], sway: 0.15, size: [0.35, 0.45], shape: 'lantern', colors: ['#ffb060'], clear: 3.5 }));
  }
  onEvent(e) {
    if (e.type === 'section') this.petals.userData.u.uAlpha.value = 0.45 + e.index * 0.12;
    if (e.type === 'chord') this.petals.userData.u.uBoost.value = 0.4;
  }
  update(dt) { this.petals.userData.u.uBoost.value *= Math.exp(-dt); }
}

// ===================================================================== Glow forest
// A night forest of tall trees with softly glowing veins, luminous mushrooms
// that pulse with the beat and fireflies drifting through teal mist.
export class GlowForestScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    this.group.add(sky(U, { top: '#01060c', horizon: '#0b2c33', ground: '#03090a', sunDir: [0, -1, 0], sunCol: '#000000', stars: 0.7, moon: 1, moonDir: [0.4, 0.5, -1] }));
    const n = noise2(31);
    this.group.add(terrain(U, {
      size: 240, seg: 120, height: (x, z) => n.fbm(x * 0.04, z * 0.04) * 2 * THREE.MathUtils.smoothstep(Math.hypot(x, z), 3, 30),
      sunDir: [0.4, 0.5, -1], fog: '#0b3a40', fogNear: 6, fogFar: 55, ambient: 0.8, color: () => hex('#1c4a3a'),
    }));
    const r = rng(17);
    this.trunkMat = solidMat(U, { color: '#0b1414', color2: '#132422', sunDir: [0.4, 0.5, -1], ambient: 0.6, fog: '#06222a', fogFar: 60, emit: '#3ff2e0', emitAmt: 1 });
    const trunks = [];
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 4 + Math.pow(r(), 0.8) * 40, h = 14 + r() * 10, rad = 0.25 + r() * 0.5;
      const g = new THREE.CylinderGeometry(rad * 0.6, rad, h, 9, 6);
      g.translate(Math.cos(a) * d, h / 2 - 0.3, Math.sin(a) * d);
      trunks.push(g);
    }
    this.group.add(new THREE.Mesh(mergeGeos(trunks), this.trunkMat));
    this.group.add(particles(U, { count: 2500, min: [-40, 10, -40], max: [40, 20, 40], size: [0.15, 0.35], colors: ['#0f6e64', '#1a4f7a', '#2a8a6a'], alpha: 0.5 }));
    this.shrooms = particles(U, { count: 260, min: [-25, 0.05, -25], max: [25, 0.35, 25], size: [0.14, 0.32], colors: ['#39f6ff', '#ff5fd2', '#8aff7a'], clear: 1.5, glow: 1.4 });
    this.group.add(this.shrooms);
    this.group.add(particles(U, { count: 260, min: [-18, 0.3, -18], max: [18, 5, 18], vel: [0.1, 0.05, 0.08], sway: 0.9, size: [0.03, 0.06], shape: 'firefly', colors: ['#d8ff6a', '#fff27a'], glow: 1.6 }));
  }
  onEvent(e) {
    if (e.type === 'beat') this.shrooms.userData.u.uBoost.value = Math.min(1.5, this.shrooms.userData.u.uBoost.value + (e.accent ? 0.8 : 0.3));
    if (e.type === 'note') this.trunkMat.uniforms.uPulse.value = 1;
  }
  update(dt) {
    this.shrooms.userData.u.uBoost.value *= Math.exp(-dt * 2.5);
    this.trunkMat.uniforms.uPulse.value *= Math.exp(-dt * 1.5);
  }
}

// ===================================================================== Snow peaks
// A ring of snowy mountains glowing pink in the last light, the moon rising,
// and snow falling softly around you.
export class SnowPeaksScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sun = [-0.8, 0.12, -0.5];
    this.sky = sky(U, { top: '#1d2c55', horizon: '#f0b9a6', ground: '#d8e0ee', sunDir: sun, sunCol: '#ffcfb0', stars: 0.35, moon: 1, moonDir: [0.5, 0.35, -1], clouds: 0.18, cloudCol: '#f4d0d8' });
    this.group.add(this.sky);
    const n = noise2(77);
    const ridge = (x, z) => { let t = 0, a = 1, f = 0.012; for (let i = 0; i < 5; i++) { t += (1 - Math.abs(n(x * f, z * f))) ** 2 * a; a *= 0.5; f *= 2.1; } return t; };
    this.group.add(terrain(U, {
      size: 420, seg: 220, height: (x, z) => { const r = Math.hypot(x, z); return ridge(x, z) * 38 * THREE.MathUtils.smoothstep(r, 22, 110) + n(x * 0.1, z * 0.1) * 0.3; },
      sunDir: sun, fog: '#d9d6e6', fogNear: 140, fogFar: 460, ambient: 0.55, tint: '#fbf6ff',
      color: (x, z, y, slope) => (slope > 0.5 && y > 6 ? mix3(hex('#6a6f82'), hex('#8c90a2'), clamp01(y / 40)) : mix3(hex('#eef2fa'), hex('#ffffff'), clamp01(y / 30))),
    }));
    this.snow = particles(U, { count: 2200, min: [-20, 0, -20], max: [20, 12, 20], vel: [0.15, -0.6, 0.05], sway: 0.5, size: [0.02, 0.05], shape: 'flake', colors: ['#ffffff'], alpha: 0.85 });
    this.group.add(this.snow);
    this.glow = 0;
  }
  onEvent(e) { if (e.type === 'chord') this.glow = 1; if (e.type === 'note') this.snow.userData.u.uBoost.value = 0.6; }
  update(dt) {
    this.glow *= Math.exp(-dt * 0.4);
    this.sky.userData.u.uHor.value.setRGB(0.94 + this.glow * 0.06, 0.72 + this.glow * 0.1, 0.65 + this.glow * 0.08);
    this.snow.userData.u.uBoost.value *= Math.exp(-dt * 2);
  }
}

// ===================================================================== Desert night
// Moonlit dunes under the Milky Way. Some notes send a shooting star across the sky.
export class DesertNightScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const moon = [-0.6, 0.3, -0.8];
    this.group.add(sky(U, { top: '#03061a', horizon: '#1f2552', ground: '#141018', sunDir: [0, -1, 0], sunCol: '#000000', stars: 1, band: 1, bandCol: '#d6c8ff', moon: 1, moonDir: moon }));
    const n = noise2(3);
    const dune = (x, z) => {
      const w = x * 0.06 + n(x * 0.01, z * 0.01) * 3;
      const s = Math.pow(1 - Math.abs(Math.sin(w + z * 0.02)), 1.8) * 4 + Math.pow(1 - Math.abs(Math.sin(z * 0.045 + x * 0.01 + 1)), 2) * 3;
      return s * THREE.MathUtils.smoothstep(Math.hypot(x, z), 4, 45);
    };
    this.group.add(terrain(U, {
      size: 380, seg: 200, height: dune, sunDir: moon, fog: '#232a5a', fogNear: 50, fogFar: 220, ambient: 0.38, tint: '#c4cdf5',
      color: (x, z, y) => mix3(hex('#b08a64'), hex('#d8b48a'), clamp01(y / 6)),
    }));
    this.stars = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(1, 0, 0)]);
      const m = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.frustumCulled = false;
      m.userData = { t: 99 };
      this.group.add(m);
      this.stars.push(m);
    }
    this.si = 0;
  }
  onEvent(e) {
    if (e.type === 'note' && Math.random() < 0.3) {
      const s = this.stars[this.si++ % this.stars.length];
      const a = (Math.random() - 0.5) * 2.4;
      const start = new THREE.Vector3(Math.sin(a) * 120, 40 + Math.random() * 40, -Math.cos(a) * 120);
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, -0.6, (Math.random() - 0.5)).normalize();
      s.userData = { t: 0, start, dir };
    }
  }
  update(dt) {
    for (const s of this.stars) {
      const u = s.userData;
      if (u.t > 1.4) { s.material.opacity = 0; continue; }
      u.t += dt;
      const head = u.start.clone().addScaledVector(u.dir, u.t * 90);
      const tail = head.clone().addScaledVector(u.dir, -14);
      s.geometry.setFromPoints([tail, head]);
      s.material.opacity = Math.sin(Math.min(1, u.t / 1.4) * Math.PI) * this.fade;
    }
  }
}

// ---------------------------------------------------------------- utility
export function mergeGeos(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const names = Object.keys(geos[0].attributes).filter((k) => geos.every((g) => g.attributes[k]));
  const out = new THREE.BufferGeometry();
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const total = geos.reduce((s, g) => s + g.attributes[name].count, 0);
    const arr = new Float32Array(total * size);
    let off = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, off); off += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
