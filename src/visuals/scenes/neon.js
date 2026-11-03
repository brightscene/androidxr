import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Neon city
// You fly fast down a rain-soaked street canyon in a vast Japanese city at
// night. Towers rise on both sides, their faces covered in glowing windows
// and tall neon signs of kanji-like glyphs in magenta, cyan, amber and red,
// flickering here and there. The wet street mirrors it all below you, rain
// streaks past, and the city's glow hangs in the haze ahead.
const LEN = 480;       // length of city that loops past you
const STREET = 13;     // half-width of the street
const FLY = 11;        // flying height above the street

const BUILD_VS = /* glsl */ `attribute float aSeed; uniform float uZ, uMirror; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying float vSeed; varying vec3 vSize;
  void main(){
    vec3 c = instanceMatrix[3].xyz;
    vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    // the city streams toward you and loops back to the far end
    float z = mod(c.z + uZ - 40.0, ${LEN.toFixed(1)}) - ${LEN.toFixed(1)} + 40.0;
    vec3 w = c + position * size; w.z += z - c.z;
    vL = position * size + size * 0.5;          // local position from the building's corner
    vN = normal; vSeed = aSeed; vSize = size;
    if (uMirror > 0.5) w.y = -w.y;
    vW = w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0); }`;

const BUILD_FS = /* glsl */ `uniform float uTime, uFade, uMirror, uZ; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying float vSeed; varying vec3 vSize; ${NOISE} ${GRADE}
  float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 neonCol(float r){ return r < 0.3 ? vec3(1.0, 0.15, 0.6) : r < 0.55 ? vec3(0.1, 0.85, 1.0) : r < 0.75 ? vec3(1.0, 0.6, 0.12) : r < 0.9 ? vec3(1.0, 0.12, 0.15) : vec3(0.6, 0.3, 1.0); }
  // a kanji-like glyph: a few strokes on a 4x4 grid
  float glyph(vec2 uv, float s){
    if (uv.x < 0.1 || uv.x > 0.9 || uv.y < 0.08 || uv.y > 0.92) return 0.0;
    vec2 g = (uv - vec2(0.1, 0.08)) / vec2(0.8, 0.84) * 4.0;
    vec2 cell = floor(g), f = fract(g);
    float hz = step(0.55, h2(cell + s * 13.0)) * step(abs(f.y - 0.5), 0.09);
    float vt = step(0.6, h2(cell + s * 29.0 + 3.1)) * step(abs(f.x - 0.5), 0.09);
    return max(hz, vt);
  }
  void main(){
    vec3 n = normalize(vN);
    // which face: u runs across it, v up it
    float u = abs(n.x) > 0.5 ? vL.z : vL.x;
    float faceW = abs(n.x) > 0.5 ? vSize.z : vSize.x;
    float v = vL.y;
    bool street = abs(n.x) > 0.5 && sign(n.x) != sign(vW.x);     // facing the street
    vec3 c = vec3(0.012, 0.012, 0.02) + vec3(0.02, 0.015, 0.035) * (0.5 + 0.5 * n.y);
    // windows
    vec2 wg = vec2(u / 1.4, v / 2.4), wc = floor(wg), wf = fract(wg);
    float win = step(0.18, wf.x) * step(wf.x, 0.82) * step(0.25, wf.y) * step(wf.y, 0.8) * step(abs(n.y), 0.5);
    float lit = step(0.62, h2(wc + vSeed * 50.0));
    vec3 wcol = mix(vec3(1.0, 0.75, 0.45), vec3(0.6, 0.8, 1.0), step(0.6, h2(wc + 7.0 + vSeed)));
    c += wcol * win * lit * 0.13 * (0.5 + 0.5 * h2(wc + 3.0));
    // tall vertical neon signs on the street faces
    if (street) {
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float sw = 3.0 + h1(vSeed + fi) * 2.0, sx = 1.0 + h1(vSeed * 3.0 + fi) * max(0.0, faceW - sw - 2.0);
        float sy0 = 4.0 + h1(vSeed * 7.0 + fi) * 30.0, sh = sw * (3.0 + floor(h1(vSeed * 11.0 + fi) * 6.0));
        vec2 q = vec2((u - sx) / sw, (v - sy0) / sw);
        // the sign's glow spills onto the wall around it
        vec2 dq = max(vec2(0.0), max(-q, q - vec2(1.0, sh / sw))) * sw;
        if (h1(vSeed * 5.0 + fi) > 0.25) c += neonCol(h1(vSeed * 17.0 + fi)) * exp(-length(dq) * 0.9) * 0.18 * step(0.001, length(dq));
        if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < sh / sw && h1(vSeed * 5.0 + fi) > 0.25) {
          float r = h1(vSeed * 17.0 + fi);
          vec3 nc = neonCol(r);
          float k = floor(q.y);
          float g = glyph(vec2(q.x, fract(q.y)), vSeed * 9.0 + fi * 4.0 + k);
          float edge = 1.0 - step(0.05, q.x) * step(q.x, 0.95) * step(0.03, q.y) * step(q.y, sh / sw - 0.03);
          float flick = 1.0 - step(0.985, h2(vec2(floor(uTime * 8.0), vSeed + fi))) * 0.8;
          c = mix(c, nc * 0.12, 0.8);
          c += nc * (g * 2.2 + edge * 1.4) * flick;
        }
      }
      // a wide glowing board low down
      float by = 3.5 + h1(vSeed * 23.0) * 4.0;
      if (h1(vSeed * 31.0) > 0.4 && v > by && v < by + 2.6) {
        vec3 nc = neonCol(h1(vSeed * 37.0));
        vec2 q = vec2(u / 2.6, (v - by) / 2.6);
        c = nc * 0.15 + nc * glyph(fract(q), floor(q.x) + vSeed * 41.0) * 1.3;
      }
    }
    // rooftop warning lights
    c += vec3(1.0, 0.1, 0.1) * step(vSize.y - 0.6, v) * step(0.5, n.y + 0.6) * (0.5 + 0.5 * sin(uTime * 3.0 + vSeed * 20.0)) * 0.8;
    // haze: the city's glow in the distance
    float dist = length(vW);
    vec3 fogc = vec3(0.12, 0.05, 0.16) + vec3(0.1, 0.03, 0.05) * smoothstep(60.0, 0.0, abs(vW.y));
    c = mix(c, fogc, 1.0 - exp(-dist * 0.0075));
    if (uMirror > 0.5) c *= 0.7;
    gl_FragColor = vec4(grade(c), uFade); }`;

export class NeonCityScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uZ: { value: 0 }, uMirror: { value: 0 } });
    this.world = new THREE.Group();
    this.world.position.y = -(FLY - 1.6);
    this.group.add(this.world);

    // sky glow
    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.14, 0.05, 0.17), vec3(0.01, 0.01, 0.03), smoothstep(-0.05, 0.5, d.y));
          c += vec3(0.05, 0.02, 0.06) * fbm(vec3(d.xz / (d.y + 0.2) * 2.0, uTime * 0.02)) * smoothstep(0.0, 0.3, d.y);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.world.add(sky);

    // the towers: two rows on each side of the street
    const towers = [];
    for (const side of [-1, 1]) {
      for (const [row, x0, hMin, hMax] of [[0, STREET, 25, 110], [1, STREET + 26, 60, 170]]) {
        let z = 0;
        while (z < LEN) {
          const w = 9 + Math.random() * 12, d = 14 + Math.random() * 8;
          const h = hMin + Math.pow(Math.random(), 1.5) * (hMax - hMin);
          const set = Math.random() * (row ? 6 : 2.5);
          towers.push([side * (x0 + set + d / 2), h / 2, -z - w / 2, d, h, w]);
          z += w + (row ? 2 : 0.6 + Math.random() * 3);
        }
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const seeds = new Float32Array(towers.length).map(() => Math.random());
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const mk = (mirror) => {
      const mat = new THREE.ShaderMaterial({ uniforms: { ...U, uMirror: { value: mirror } }, vertexShader: BUILD_VS, fragmentShader: BUILD_FS, transparent: true });
      if (mirror) mat.side = THREE.BackSide;
      const m = new THREE.InstancedMesh(geo, mat, towers.length);
      const M = new THREE.Matrix4();
      towers.forEach(([x, y, z, sx, sy, sz], i) => { M.makeScale(sx, sy, sz); M.setPosition(x, y, z); m.setMatrixAt(i, M); });
      m.frustumCulled = false;
      m.renderOrder = mirror ? -8 : -4;
      return m;
    };
    this.world.add(mk(1), mk(0));

    // the wet street, mirroring the city through its sheen
    const street = new THREE.Mesh(new THREE.PlaneGeometry(400, 700).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uZ, uTime; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){ vec2 p = vec2(vW.x, vW.z - uZ);
          float puddle = smoothstep(0.45, 0.6, fbm(vec3(p * 0.08, 1.0)));
          float lane = step(abs(abs(vW.x) - 4.2), 0.08) * step(0.5, fract(p.y / 6.0)) + step(abs(vW.x), 0.1) * 0.6;
          vec3 c = vec3(0.01, 0.01, 0.015) + vec3(0.6, 0.6, 0.55) * lane * 0.15;
          float a = mix(0.6, 0.15, puddle);
          float dist = length(vW.xz);
          c = mix(c, vec3(0.12, 0.05, 0.16), 1.0 - exp(-dist * 0.0075));
          gl_FragColor = vec4(grade(c), a * uFade); }`,
    }));
    street.renderOrder = -6;
    this.world.add(street);

    // rain streaking past
    this.rain = particles(U, { count: 900, min: [-14, -10, -40], max: [14, 14, 4], vel: [0, -16, 8], sway: 0.02, size: [0.01, 0.02], colors: ['#cfd8ff', '#ffffff', '#ffc8f0'], alpha: 0.45 });
    this.group.add(this.rain);

    this.speed = 26; this.target = 26; this.next = 8; this.sway = 0;
  }
  update(dt, t) {
    const U = this.uniforms;
    this.next -= dt;
    if (this.next <= 0) { this.target = [16, 24, 32, 42][Math.floor(Math.random() * 4)]; this.next = 8 + Math.random() * 8; }
    this.speed = damp(this.speed, this.target, 0.35, dt);
    U.uZ.value += dt * this.speed;
    // a gentle weave down the street, rising and dipping a little
    this.world.position.x = Math.sin(t * 0.11) * 2.0;
    this.world.position.y = -(FLY - 1.6) - Math.sin(t * 0.07) * 3;
    this.rain.userData.u.uBoost.value = this.speed * 0.02;
  }
}
