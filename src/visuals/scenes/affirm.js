import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
import { particles } from './kit.js';

// Affirmations, grouped by the arc of a session:
//   Arrive: calm and safety · Settle: self-worth · Open: possibility
//   Deep: love and wholeness · Return: hope and tomorrow
export const AFFIRMATIONS = [
  ['You are safe here', 'Peace begins with this breath', 'Let it be easy', 'Calm is your home', 'You are allowed to rest', 'It\'s okay to slow down', 'All is well'],
  ['You are enough', 'You are worthy of good things', 'Be gentle with yourself', 'You deserve kindness', 'Your light matters', 'You belong here', 'You are growing'],
  ['Everything is possible', 'Your dreams are valid', 'Good things are coming', 'Trust the timing of your life', 'You can begin again', 'There is so much ahead of you', 'Small steps are still steps'],
  ['You are loved', 'You are whole', 'Love surrounds you', 'You are not alone', 'Your heart knows the way', 'You are made of stardust', 'You shine'],
  ['Tomorrow will be a better day', 'Every day is a fresh start', 'Hope is always here', 'Joy is finding you', 'You are stronger than you know', 'You are exactly where you need to be', 'Today, I choose peace'],
];
const ALL = AFFIRMATIONS.flat();

// One wave function for both the blanket and the words lying on it.
const WAVE = /* glsl */ `
float blanketH(vec2 w){
  return sin(w.x * 0.11 + uTime * 0.35) * 0.55 + sin(w.y * 0.085 + uTime * 0.28 + w.x * 0.03) * 0.75
       + (vnoise(vec3(w * 0.06, uTime * 0.02)) - 0.5) * 2.2;
}`;

// The aura blanket: a vast, softly rolling sheet of iridescent light with
// starry sparkles, used by the Affirmation field and Image cycling scenes.
export function makeBlanket(U) {
  if (!U.uWarp) U.uWarp = { value: 0 };
  if (!U.uRip) U.uRip = { value: 0 };
    const g = new THREE.PlaneGeometry(260, 280, 170, 200);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, -115);
  const blanket = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, uniforms: U,
    vertexShader: /* glsl */ `uniform float uTime, uTravel, uWarp; varying vec2 vW; varying float vH; varying float vD;
      ${NOISE} ${WAVE}
      void main(){ vec3 p = position; vW = vec2(p.x, p.z - uTravel - uWarp); vH = blanketH(vW); p.y = -3.4 + vH;
        vec4 mv = modelViewMatrix * vec4(p, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform vec3 uC1, uC2; uniform float uTime, uFade, uBreath, uEnergy, uRip; varying vec2 vW; varying float vH; varying float vD;
      ${NOISE} ${GRADE}
      vec3 hsv(float h, float s, float v){ vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); return v * mix(vec3(1.0), k, s); }
      void main(){
        float n = fbm(vec3(vW * 0.035, uTime * 0.03));
        float hue = fract(0.62 + vW.y * 0.0025 + vW.x * 0.002 + n * 0.35 + uTime * 0.004);
        vec3 aura = mix(hsv(hue, 0.55, 1.0), mix(uC1, uC2, n) * 1.6, 0.25);
        float crest = smoothstep(0.4, 1.4, vH);
        float silk = 0.5 + 0.5 * sin(vW.x * 0.6 + n * 9.0 + vW.y * 0.15);
        vec3 c = aura * (0.22 + n * 0.55 + crest * 0.8) * (0.7 + silk * 0.45);
        vec2 cell = floor(vW * 1.4);
        float r = hash3(vec3(cell, 4.0));
        float tw = 0.5 + 0.5 * sin(uTime * (1.0 + r * 3.0) + r * 50.0);
        vec2 f = fract(vW * 1.4) - 0.5;
        c += mix(aura, vec3(1.0), 0.6) * step(0.93, r) * smoothstep(0.12, 0.0, length(f)) * tw * 1.2;
        float ring = exp(-pow(fract(vD * 0.05 - uTime * 0.25) - 0.5, 2.0) * 120.0) * uRip;
        c += aura * ring * 0.6;
        float fade = smoothstep(150.0, 60.0, vD) * smoothstep(0.0, 4.0, vD);
        gl_FragColor = vec4(grade(c * (0.9 + uEnergy * 0.4 + uBreath * 0.15)), fade * uFade);
      }`,
  }));
  blanket.frustumCulled = false;
  blanket.renderOrder = -3;
  return blanket;

}

function textAtlas(lines, cellW, cellH, cols) {
  const rows = Math.ceil(lines.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cellW * cols; cv.height = cellH * rows;
  const c = cv.getContext('2d');
  c.textAlign = 'center'; c.textBaseline = 'middle';
  lines.forEach((t, i) => {
    const x = (i % cols) * cellW + cellW / 2, y = Math.floor(i / cols) * cellH + cellH / 2;
    let size = cellH * 0.56;
    c.font = `300 ${size}px "Inter", "Roboto", "Segoe UI", system-ui, sans-serif`;
    while (c.measureText(t).width > cellW * 0.9) { size -= 2; c.font = `300 ${size}px "Inter", "Roboto", "Segoe UI", system-ui, sans-serif`; }
    c.shadowColor = 'rgba(255,255,255,0.9)'; c.shadowBlur = cellH * 0.12;
    c.fillStyle = '#ffffff';
    c.fillText(t, x, y);
    c.shadowBlur = 0; c.fillText(t, x, y);
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { tex, rows, cols };
}

// ===================================================================== Affirmation field
// Flying slowly over a vast, softly rolling blanket of aura light beneath the
// stars. Glowing affirmations lie across it; on every chord a new one rises
// in front of you, breathes with you, and drifts away. The words follow the
// arc of the session: calm, self-worth, possibility, love, then hope.
export class AffirmationScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uRip: { value: 0 }, uHot: { value: Array.from({ length: 4 }, () => new THREE.Vector3(0, 0, -99)) } });

    this.group.add(makeBlanket(U));

    // --- words lying across the blanket
    const atlas = textAtlas(ALL, 1024, 128, 2);
    const N = 90, L = 140, r = Math.random;
    const inst = new Float32Array(N * 4), meta = new Float32Array(N * 2);
    this.words = [];
    const lanes = [-27, -14, 0, 14, 27];
    for (let i = 0; i < N; i++) {
      const lane = lanes[i % lanes.length], row = Math.floor(i / lanes.length);
      const x = lane + (r() - 0.5) * 4, z = -(row + (i % 2) * 0.5 + r() * 0.3) * (L / (N / lanes.length)), w = 7 + r() * 5;
      inst.set([x, z, w, Math.floor(r() * ALL.length)], i * 4);
      meta.set([r(), 0], i * 2);
    }
    const wg = new THREE.InstancedBufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    wg.setIndex([0, 1, 2, 0, 2, 3]);
    wg.setAttribute('aI', new THREE.InstancedBufferAttribute(inst, 4));
    wg.setAttribute('aM', new THREE.InstancedBufferAttribute(meta, 2));
    wg.instanceCount = N;
    Object.assign(U, { uAtlas: { value: atlas.tex }, uRows: { value: atlas.rows }, uL: { value: L } });
    const words = new THREE.Mesh(wg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute vec4 aI; attribute vec2 aM; uniform float uTime, uTravel, uL, uRows; uniform vec3 uHot[4];
        varying vec2 vUv; varying float vA; varying float vS; varying float vGlow;
        ${NOISE} ${WAVE}
        void main(){
          float z = mod(aI.y + uTravel, uL) - uL + 12.0;
          vec2 w = vec2(aI.x, z - uTravel);
          vec3 base = vec3(aI.x, -3.4 + blanketH(w) + 0.35, z);
          float tilt = 0.75;
          vec3 right = vec3(1.0, 0.0, 0.0), up = normalize(vec3(0.0, sin(tilt), -cos(tilt)));
          vec3 p = base + right * position.x * aI.z + up * position.y * aI.z * 0.125;
          float idx = aI.w;
          vec2 cell = vec2(mod(idx, 2.0), floor(idx / 2.0));
          vUv = vec2((cell.x + position.x + 0.5) * 0.5, 1.0 - (cell.y + 0.5 - position.y) / uRows);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          vA = smoothstep(95.0, 40.0, dist) * smoothstep(1.5, 6.0, dist);
          vS = aM.x;
          float hot = 0.0;
          for (int i = 0; i < 4; i++) { float age = uTime - uHot[i].z; hot += exp(-abs(aI.x - uHot[i].x) * 0.15) * exp(-age * 0.8) * step(0.0, age); }
          vGlow = hot;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform sampler2D uAtlas; uniform vec3 uC1, uC2; uniform float uTime, uFade, uEnergy, uBeat; varying vec2 vUv; varying float vA; varying float vS; varying float vGlow;
        void main(){
          float a = texture2D(uAtlas, vUv).a;
          float tw = 0.55 + 0.45 * sin(uTime * (0.4 + vS * 0.6) + vS * 40.0);
          vec3 tint = mix(mix(uC2, vec3(1.0), 0.55), mix(uC1, vec3(1.0), 0.3), vS);
          gl_FragColor = vec4(tint * a * vA * (0.8 + tw * 0.6 + vGlow * 1.4 + uBeat * 0.2) * uFade, 1.0);
        }`,
    }));
    words.frustumCulled = false;
    this.group.add(words);

    // --- the hero affirmation that rises in front of you
    this.heroCanvas = document.createElement('canvas');
    this.heroCanvas.width = 2048; this.heroCanvas.height = 320;
    this.heroTex = new THREE.CanvasTexture(this.heroCanvas);
    this.heroTex.colorSpace = THREE.SRGBColorSpace;
    this.heroTex.anisotropy = 8;
    this.hero = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 0.85), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { ...U, uTex: { value: this.heroTex }, uA: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform vec3 uC1, uC2; uniform float uA, uFade, uBreath, uTime; varying vec2 vUv;
        void main(){ vec4 t = texture2D(uTex, vUv);
          vec3 tint = mix(mix(uC2, vec3(1.0), 0.5), mix(uC1, vec3(1.0), 0.35), 0.5 + 0.5 * sin(vUv.x * 3.0 + uTime * 0.3));
          gl_FragColor = vec4(tint * t.a * uA * (1.5 + uBreath * 0.4) * uFade, 1.0); }`,
    }));
    this.hero.renderOrder = 20;
    this.group.add(this.hero);
    this.theme = 0;
    this.used = new Set();
    this.h = { state: 'in', t: 0 };

    this.group.add(particles(U, { count: 500, min: [-30, -2, -80], max: [30, 10, 6], vel: [0, 0.05, 2], sway: 0.6, size: [0.02, 0.05], colors: ['#ffffff', '#ffe4ff', '#d8f4ff'], alpha: 0.7, clear: 1 }));
    this.hotI = 0;
    this._drawHero(this._pick());
  }

  _drawHero(text) {
    const c = this.heroCanvas.getContext('2d'), W = this.heroCanvas.width, H = this.heroCanvas.height;
    c.clearRect(0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = H * 0.5;
    const font = (s) => `300 ${s}px "Inter", "Roboto", "Segoe UI", system-ui, sans-serif`;
    c.font = font(size);
    while (c.measureText(text).width > W * 0.92) { size -= 4; c.font = font(size); }
    for (const [blur, alpha] of [[H * 0.22, 0.55], [H * 0.08, 0.8], [0, 1]]) {
      c.shadowColor = `rgba(255,255,255,${alpha})`; c.shadowBlur = blur;
      c.fillStyle = `rgba(255,255,255,${alpha})`;
      c.fillText(text, W / 2, H / 2);
    }
    this.heroTex.needsUpdate = true;
  }

  // pick the next affirmation from the current theme, avoiding recent repeats
  _pick() {
    const pool = AFFIRMATIONS[this.theme % AFFIRMATIONS.length];
    let choice = pool.find((t) => !this.used.has(t));
    if (!choice) { for (const t of pool) this.used.delete(t); choice = pool[Math.floor(Math.random() * pool.length)]; }
    this.used.add(choice);
    return choice;
  }

  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'section') this.theme = e.index ?? 0;
    if (e.type === 'chord') this.swap = true;
    if (e.type === 'beat' && e.accent) U.uRip.value = 1;
    if (e.type === 'note' && e.pos) { U.uHot.value[this.hotI].set(e.pos[0] * 6, 0, U.uTime.value); this.hotI = (this.hotI + 1) % 4; }
  }

  // The hero affirmation: rises and fades in, holds (at least 7 s, then
  // leaves on the next chord change, or after 16 s), drifts up and fades,
  // then the next one rises.
  update(dt, t, s) {
    const U = this.uniforms;
    U.uRip.value *= Math.exp(-dt * 1.2);
    const h = this.h;
    h.t += dt;
    let a = 0, y = 1.75;
    if (h.state === 'in') {
      const k = Math.min(1, h.t / 2.5); a = k * k * (3 - 2 * k); y = 0.7 + a * 1.05;
      if (k >= 1) { h.state = 'hold'; h.t = 0; this.swap = false; }
    } else if (h.state === 'hold') {
      a = 1;
      if ((this.swap && h.t > 7) || h.t > 16) { h.state = 'out'; h.t = 0; }
    } else {
      const k = Math.min(1, h.t / 2.2); a = 1 - k; y = 1.75 + k * 1.1;
      if (k >= 1) { this._drawHero(this._pick()); h.state = 'in'; h.t = 0; }
    }
    this.hero.position.set(0, y + Math.sin(t * 0.5) * 0.04, -4.8);
    this.hero.scale.setScalar(1 + s.breath * 0.04);
    this.hero.material.uniforms.uA.value = a;
  }
}
