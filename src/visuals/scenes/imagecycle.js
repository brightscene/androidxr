import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
import { particles } from './kit.js';
import { makeBlanket } from './affirm.js';

// Image cycling, after the visualisation practice of cycling rapidly through
// vivid, emotionally charged images of the life you want. Here the images
// surround you instead of living only in your mind.
//
// The journey: fly over the aura blanket toward a glowing portal; it stops in
// front of you and positive images cycle inside it for 30 seconds, starting
// slowly and accelerating with the music, echoed by a ring of frames around
// you; the set condenses into a single glowing orb that settles into the
// blanket; then you fly on to the next portal and its theme.
//
// Built-in images are painted in code. Add your own photos on the flat-screen
// menu (Image cycling panel) and the cycling uses those instead.

const SETS = [
  { name: 'Wellbeing', items: ['Peace', 'Health', 'Rest', 'Nature'] },
  { name: 'Love', items: ['Love', 'Together', 'Home', 'Kindness'] },
  { name: 'Abundance', items: ['Abundance', 'Gift', 'Growth', 'Open doors'] },
  { name: 'Joy & freedom', items: ['Freedom', 'Joy', 'Achievement', 'Transformation'] },
];

// ---------------------------------------------------------------- painter
const P = {
  bg(c, S, top, bottom) { const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, top); g.addColorStop(1, bottom); c.fillStyle = g; c.fillRect(0, 0, S, S); },
  glow(c, x, y, r, col) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); },
  heart(c, x, y, s) { c.beginPath(); c.moveTo(x, y + s * 0.35); c.bezierCurveTo(x - s, y - s * 0.35, x - s * 0.45, y - s, x, y - s * 0.45); c.bezierCurveTo(x + s * 0.45, y - s, x + s, y - s * 0.35, x, y + s * 0.35); c.fill(); },
  hills(c, S, y, col, amp, ph) { c.fillStyle = col; c.beginPath(); c.moveTo(0, S); for (let x = 0; x <= S; x += 8) c.lineTo(x, y + Math.sin(x / S * 6 + ph) * amp + Math.sin(x / S * 13 + ph * 2) * amp * 0.3); c.lineTo(S, S); c.fill(); },
  stars(c, S, n, maxY) { c.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = 0; i < n; i++) { const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * S, y = (Math.sin(i * 37.3) * 0.5 + 0.5) * maxY; c.beginPath(); c.arc(x, y, 1 + (i % 3) * 0.7, 0, 7); c.fill(); } },
};
const PAINT = {
  Peace(c, S) { P.bg(c, S, '#0d1b3d', '#4a6fa5'); P.stars(c, S, 60, S * 0.5); P.glow(c, S * 0.7, S * 0.3, S * 0.18, 'rgba(255,250,230,0.9)'); c.fillStyle = '#f8f4e3'; c.beginPath(); c.arc(S * 0.7, S * 0.3, S * 0.06, 0, 7); c.fill(); c.fillStyle = '#1b2e55'; c.fillRect(0, S * 0.62, S, S); c.fillStyle = 'rgba(255,250,230,0.5)'; for (let i = 0; i < 9; i++) c.fillRect(S * 0.64 - i * 3, S * 0.64 + i * 14, S * 0.12 + i * 6, 3); },
  Health(c, S) { P.bg(c, S, '#7ec8ff', '#fff2c8'); P.glow(c, S * 0.5, S * 0.42, S * 0.4, 'rgba(255,240,170,0.95)'); c.fillStyle = '#ffe58a'; c.beginPath(); c.arc(S * 0.5, S * 0.42, S * 0.09, 0, 7); c.fill(); P.hills(c, S, S * 0.66, '#7fbf5a', 18, 1); P.hills(c, S, S * 0.76, '#4f9a3c', 14, 3); },
  Rest(c, S) { P.bg(c, S, '#0a0f2a', '#2c2a5c'); P.stars(c, S, 90, S); P.glow(c, S * 0.5, S * 0.45, S * 0.25, 'rgba(200,190,255,0.5)'); c.fillStyle = '#f3efff'; c.beginPath(); c.arc(S * 0.5, S * 0.45, S * 0.14, 0, 7); c.fill(); c.fillStyle = '#0a0f2a'; c.beginPath(); c.arc(S * 0.56, S * 0.4, S * 0.13, 0, 7); c.fill(); },
  Nature(c, S) { P.bg(c, S, '#bfe8d4', '#fdf6dc'); P.hills(c, S, S * 0.78, '#6aa45a', 8, 2); c.fillStyle = '#6b4a2e'; c.fillRect(S * 0.47, S * 0.48, S * 0.06, S * 0.32); for (const [x, y, r, col] of [[0.5, 0.36, 0.2, '#3f8f4a'], [0.38, 0.44, 0.14, '#4fa356'], [0.62, 0.44, 0.14, '#4fa356'], [0.5, 0.26, 0.13, '#5cb860']]) { c.fillStyle = col; c.beginPath(); c.arc(S * x, S * y, S * r, 0, 7); c.fill(); } },
  Love(c, S) { P.bg(c, S, '#3a0f2e', '#ff8fb1'); P.glow(c, S * 0.5, S * 0.48, S * 0.42, 'rgba(255,170,200,0.9)'); c.fillStyle = '#ff4f86'; P.heart(c, S * 0.5, S * 0.55, S * 0.3); c.fillStyle = 'rgba(255,255,255,0.35)'; P.heart(c, S * 0.44, S * 0.47, S * 0.08); },
  Together(c, S) { P.bg(c, S, '#ffd6a5', '#ff9e7a'); P.glow(c, S * 0.5, S * 0.4, S * 0.35, 'rgba(255,255,220,0.8)'); c.fillStyle = '#e8506f'; P.heart(c, S * 0.42, S * 0.55, S * 0.2); c.fillStyle = '#ff7a8e'; P.heart(c, S * 0.6, S * 0.6, S * 0.17); },
  Home(c, S) { P.bg(c, S, '#101a3a', '#3a3f7a'); P.stars(c, S, 50, S * 0.5); c.fillStyle = '#2a2140'; c.beginPath(); c.moveTo(S * 0.25, S * 0.55); c.lineTo(S * 0.5, S * 0.33); c.lineTo(S * 0.75, S * 0.55); c.fill(); c.fillRect(S * 0.3, S * 0.55, S * 0.4, S * 0.27); P.glow(c, S * 0.5, S * 0.64, S * 0.2, 'rgba(255,200,110,0.8)'); c.fillStyle = '#ffd27a'; c.fillRect(S * 0.36, S * 0.6, S * 0.09, S * 0.08); c.fillRect(S * 0.55, S * 0.6, S * 0.09, S * 0.08); c.fillStyle = '#ffb24a'; c.fillRect(S * 0.46, S * 0.66, S * 0.08, S * 0.16); },
  Kindness(c, S) { P.bg(c, S, '#c9f0ff', '#ffe3f1'); P.glow(c, S * 0.5, S * 0.5, S * 0.4, 'rgba(255,255,255,0.9)'); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.fillStyle = i % 2 ? '#ffb3cf' : '#ffd1e3'; c.beginPath(); c.ellipse(S * 0.5 + Math.cos(a) * S * 0.14, S * 0.5 + Math.sin(a) * S * 0.14, S * 0.12, S * 0.06, a, 0, 7); c.fill(); } c.fillStyle = '#ffd86b'; c.beginPath(); c.arc(S * 0.5, S * 0.5, S * 0.07, 0, 7); c.fill(); },
  Abundance(c, S) { P.bg(c, S, '#3a1e05', '#ffcf5a'); for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; c.strokeStyle = 'rgba(255,240,180,0.35)'; c.lineWidth = S * 0.02; c.beginPath(); c.moveTo(S * 0.5, S * 0.5); c.lineTo(S * 0.5 + Math.cos(a) * S, S * 0.5 + Math.sin(a) * S); c.stroke(); } P.glow(c, S * 0.5, S * 0.5, S * 0.32, 'rgba(255,245,200,1)'); c.fillStyle = '#fff3c4'; c.beginPath(); c.arc(S * 0.5, S * 0.5, S * 0.12, 0, 7); c.fill(); },
  Gift(c, S) { P.bg(c, S, '#2a0f4a', '#a05ad8'); P.glow(c, S * 0.5, S * 0.5, S * 0.4, 'rgba(255,220,255,0.6)'); c.fillStyle = '#f4c542'; c.fillRect(S * 0.3, S * 0.45, S * 0.4, S * 0.3); c.fillStyle = '#e8a628'; c.fillRect(S * 0.27, S * 0.38, S * 0.46, S * 0.09); c.fillStyle = '#e8456b'; c.fillRect(S * 0.47, S * 0.38, S * 0.06, S * 0.37); c.beginPath(); c.ellipse(S * 0.43, S * 0.35, S * 0.07, S * 0.04, -0.4, 0, 7); c.ellipse(S * 0.57, S * 0.35, S * 0.07, S * 0.04, 0.4, 0, 7); c.fill(); },
  Growth(c, S) { P.bg(c, S, '#dff7d8', '#9ad08a'); P.glow(c, S * 0.5, S * 0.35, S * 0.3, 'rgba(255,255,220,0.9)'); c.fillStyle = '#7a5230'; c.beginPath(); c.ellipse(S * 0.5, S * 0.78, S * 0.22, S * 0.06, 0, 0, 7); c.fill(); c.strokeStyle = '#3f8a34'; c.lineWidth = S * 0.02; c.beginPath(); c.moveTo(S * 0.5, S * 0.76); c.quadraticCurveTo(S * 0.48, S * 0.55, S * 0.5, S * 0.42); c.stroke(); c.fillStyle = '#5cb85c'; c.beginPath(); c.ellipse(S * 0.42, S * 0.5, S * 0.09, S * 0.045, -0.6, 0, 7); c.ellipse(S * 0.58, S * 0.45, S * 0.1, S * 0.05, 0.6, 0, 7); c.fill(); },
  'Open doors'(c, S) { P.bg(c, S, '#1d1a3a', '#4a3f7a'); c.fillStyle = '#2c2550'; c.fillRect(S * 0.32, S * 0.2, S * 0.36, S * 0.65); P.glow(c, S * 0.5, S * 0.55, S * 0.35, 'rgba(255,240,200,0.75)'); c.fillStyle = '#fff4d6'; c.fillRect(S * 0.36, S * 0.24, S * 0.28, S * 0.61); c.fillStyle = '#6b5aa8'; c.beginPath(); c.moveTo(S * 0.36, S * 0.24); c.lineTo(S * 0.24, S * 0.3); c.lineTo(S * 0.24, S * 0.8); c.lineTo(S * 0.36, S * 0.85); c.fill(); },
  Freedom(c, S) { P.bg(c, S, '#5fb3f0', '#fde3c4'); P.glow(c, S * 0.7, S * 0.7, S * 0.3, 'rgba(255,240,200,0.8)'); c.strokeStyle = '#2a3550'; c.lineWidth = S * 0.012; c.lineCap = 'round'; for (const [x, y, s] of [[0.35, 0.35, 1], [0.5, 0.27, 0.8], [0.6, 0.4, 0.7], [0.28, 0.5, 0.6], [0.46, 0.45, 0.5]]) { c.beginPath(); c.moveTo(S * (x - 0.06 * s), S * (y - 0.02 * s)); c.quadraticCurveTo(S * (x - 0.03 * s), S * (y - 0.05 * s), S * x, S * y); c.quadraticCurveTo(S * (x + 0.03 * s), S * (y - 0.05 * s), S * (x + 0.06 * s), S * (y - 0.02 * s)); c.stroke(); } },
  Joy(c, S) { P.bg(c, S, '#8fd3ff', '#ffffff'); const cols = ['#ff5a5a', '#ffa64d', '#ffe14d', '#5fd36b', '#4db8ff', '#8a6bff']; cols.forEach((col, i) => { c.strokeStyle = col; c.lineWidth = S * 0.035; c.beginPath(); c.arc(S * 0.5, S * 0.85, S * (0.42 - i * 0.035), Math.PI, 0); c.stroke(); }); c.fillStyle = 'rgba(255,255,255,0.95)'; for (const [x, y, r] of [[0.18, 0.82, 0.08], [0.26, 0.8, 0.06], [0.82, 0.82, 0.08], [0.74, 0.8, 0.06]]) { c.beginPath(); c.arc(S * x, S * y, S * r, 0, 7); c.fill(); } },
  Achievement(c, S) { P.bg(c, S, '#ffb36b', '#ffe8c4'); P.glow(c, S * 0.5, S * 0.25, S * 0.25, 'rgba(255,250,210,0.9)'); c.fillStyle = '#5a4a7a'; c.beginPath(); c.moveTo(S * 0.1, S * 0.85); c.lineTo(S * 0.5, S * 0.32); c.lineTo(S * 0.9, S * 0.85); c.fill(); c.fillStyle = '#f4f0ff'; c.beginPath(); c.moveTo(S * 0.43, S * 0.41); c.lineTo(S * 0.5, S * 0.32); c.lineTo(S * 0.57, S * 0.41); c.lineTo(S * 0.52, S * 0.39); c.lineTo(S * 0.48, S * 0.42); c.fill(); c.strokeStyle = '#3a2a4a'; c.lineWidth = S * 0.008; c.beginPath(); c.moveTo(S * 0.5, S * 0.32); c.lineTo(S * 0.5, S * 0.18); c.stroke(); c.fillStyle = '#ff4f6d'; c.beginPath(); c.moveTo(S * 0.5, S * 0.18); c.lineTo(S * 0.6, S * 0.21); c.lineTo(S * 0.5, S * 0.24); c.fill(); },
  Transformation(c, S) { P.bg(c, S, '#1a2a5a', '#7a4ab8'); P.glow(c, S * 0.5, S * 0.5, S * 0.4, 'rgba(180,220,255,0.5)'); for (const [sx, col] of [[-1, '#58c8ff'], [1, '#c084ff']]) { c.fillStyle = col; c.beginPath(); c.ellipse(S * (0.5 + sx * 0.13), S * 0.44, S * 0.13, S * 0.1, sx * 0.5, 0, 7); c.fill(); c.beginPath(); c.ellipse(S * (0.5 + sx * 0.1), S * 0.6, S * 0.08, S * 0.07, -sx * 0.4, 0, 7); c.fill(); } c.fillStyle = '#2a1a3a'; c.fillRect(S * 0.49, S * 0.38, S * 0.02, S * 0.28); },
};

function cell(c, S, i, ox, oy, draw, label) {
  c.save();
  c.translate(ox, oy);
  c.beginPath(); c.rect(0, 0, S, S); c.clip();
  draw(c, S);
  if (label) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `500 ${S * 0.075}px "Inter", "Roboto", system-ui, sans-serif`;
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = S * 0.03;
    c.fillStyle = '#ffffff';
    c.fillText(label, S / 2, S * 0.91);
  }
  c.restore();
}

export function buildAtlas(userImages) {
  const S = 512, cv = document.createElement('canvas');
  cv.width = cv.height = S * 4;
  const c = cv.getContext('2d');
  const labels = [];
  if (userImages && userImages.length) {
    userImages.slice(0, 16).forEach((img, i) => {
      cell(c, S, i, (i % 4) * S, Math.floor(i / 4) * S, (cc) => {
        const k = Math.max(S / img.width, S / img.height);
        cc.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k);
      }, null);
      labels.push('');
    });
  } else {
    let i = 0;
    for (const set of SETS) for (const name of set.items) { cell(c, S, i, (i % 4) * S, Math.floor(i / 4) * S, PAINT[name], name); labels.push(name); i++; }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, count: labels.length, builtin: !(userImages && userImages.length) };
}

// ---------------------------------------------------------------- user images (kept on this device)
const DB = 'mindlyte-images';
function idb() {
  return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function saveUserImages(files) {
  const db = await idb();
  await new Promise((res, rej) => { const tx = db.transaction('img', 'readwrite'); tx.objectStore('img').put([...files].slice(0, 16), 'list'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
}
export async function clearUserImages() {
  const db = await idb();
  await new Promise((res) => { const tx = db.transaction('img', 'readwrite'); tx.objectStore('img').delete('list'); tx.oncomplete = res; tx.onerror = res; });
}
export async function loadUserImages() {
  try {
    const db = await idb();
    const list = await new Promise((res) => { const r = db.transaction('img').objectStore('img').get('list'); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]); });
    return Promise.all(list.map((b) => createImageBitmap(b)));
  } catch { return []; }
}
let shared = null;
export async function refreshImageAtlas() {
  const imgs = await loadUserImages();
  shared = buildAtlas(imgs);
  for (const s of live) s.setAtlas(shared);
  return imgs.length;
}
const live = new Set();

// ---------------------------------------------------------------- scene
const FRAME_FRAG = /* glsl */ `uniform sampler2D uAtlas; uniform float uA, uB, uMix, uCount, uFade, uGlow, uTime, uRing, uEcho;
  varying vec2 vUv;
  vec4 img(float i, vec2 uv){ i = mod(i, uCount); vec2 c = vec2(mod(i, 4.0), floor(i / 4.0)); return texture2D(uAtlas, vec2((c.x + uv.x) * 0.25, 1.0 - (c.y + 1.0 - uv.y) * 0.25)); }
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float inside = smoothstep(0.86, 0.82, r);
    vec2 uv = (vUv - 0.5) * 1.18 + 0.5;
    vec3 c = mix(img(uA, uv).rgb, img(uB, uv).rgb, uMix);
    float ring = exp(-pow((r - 0.9) * 18.0, 2.0));
    float h = 0.5 + 0.5 * sin(atan(p.y, p.x) * 2.0 + uTime * 0.5);
    vec3 aura = mix(mix(vec3(0.62, 0.36, 1.0), vec3(1.0, 0.55, 0.82), h), vec3(0.45, 0.9, 1.0), 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 - uTime * 0.3)) ;
    vec3 col = c * inside * (0.85 + uGlow * 0.3) + aura * ring * (0.9 + uRing) + aura * exp(-max(r - 0.9, 0.0) * 6.0) * 0.25 * step(0.9, r);
    float a = max(inside, ring * 0.9) * uFade * uEcho;
    gl_FragColor = vec4(col * uEcho, a);
  }`;

export class ImageCycleScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    this.group.add(makeBlanket(U));
    if (!shared) { shared = buildAtlas(null); refreshImageAtlas(); }
    live.add(this);
    this.builtin = shared.builtin;
    const mk = (size, echo) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { ...U, uFade: { value: 0 }, uAtlas: { value: shared.tex }, uCount: { value: shared.count }, uA: { value: 0 }, uB: { value: 1 }, uMix: { value: 0 }, uGlow: { value: 0 }, uRing: { value: 0 }, uEcho: { value: echo } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: FRAME_FRAG,
      }));
      m.renderOrder = 12;
      this.group.add(m);
      return m;
    };
    this.frame = mk(3.6, 1);
    this.echoes = Array.from({ length: 8 }, () => mk(1.6, 0.5));
    // the condensed icon orb
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), new THREE.MeshBasicMaterial({ color: 0xfff0d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.orb);
    this.orbGlow = particles(U, { count: 260, min: [-0.6, -0.6, -0.6], max: [0.6, 0.6, 0.6], vel: [0, 0, 0], sway: 0.25, size: [0.02, 0.05], colors: ['#fff2d0', '#ffd6ff', '#d6f6ff'] });
    this.orbGlow.userData.u.uAlpha.value = 0;
    this.group.add(this.orbGlow);
    this.group.add(particles(U, { count: 500, min: [-30, -2, -80], max: [30, 10, 6], vel: [0, 0.05, 2], sway: 0.6, size: [0.02, 0.05], colors: ['#ffffff', '#ffe4ff', '#d8f4ff'], alpha: 0.7, clear: 1 }));
    this.set = 0;
    this.st = { phase: 'fly', t: 0 };
    this.img = { cur: 0, next: 1, mix: 0, timer: 0 };
  }

  setAtlas(a) { this.builtin = a.builtin; for (const m of [this.frame, ...this.echoes]) { m.material.uniforms.uAtlas.value = a.tex; m.material.uniforms.uCount.value = a.count; } }

  onEvent(e) {
    if (e.type === 'beat' && e.accent) { this.frame.material.uniforms.uRing.value = 1; this.uniforms.uRip.value = 1; }
    if (e.type === 'beat' && this.st.phase === 'cycle' && this.rate < 2.2) this.advance = true;   // slow cycling follows the beat
  }

  _range() {
    const count = this.frame.material.uniforms.uCount.value;
    if (this.builtin) { const base = (this.set % 4) * 4; return [base, 4]; }
    return [0, count];
  }

  update(dt, t, s) {
    const U = this.uniforms, st = this.st;
    st.t += dt;
    U.uRip.value *= Math.exp(-dt * 1.2);
    const fu = this.frame.material.uniforms;
    fu.uRing.value *= Math.exp(-dt * 2.5);
    let z = -5, scale = 1, show = 1, warp = 0.6;
    if (st.phase === 'fly') {
      const k = Math.min(1, st.t / 14);
      const e = 1 - Math.pow(1 - k, 3);
      z = -70 + e * 65;
      warp = 6 * (1 - e) + 0.6;
      show = Math.min(1, st.t / 3);
      if (k >= 1) { st.phase = 'cycle'; st.t = 0; this.img.timer = 0; }
    } else if (st.phase === 'cycle') {
      // accelerate from about one image every 1.5 s to six a second
      const k = Math.min(1, st.t / 30);
      this.rate = 0.65 + Math.pow(k, 1.6) * 5.5;
      const im = this.img;
      im.timer += dt;
      if ((this.rate >= 2.2 && im.timer > 1 / this.rate) || (this.advance && im.timer > 0.35) || im.timer > 1 / this.rate + 0.6) {
        const [base, n] = this._range();
        im.cur = im.next;
        im.next = base + ((im.next - base + 1) % n);
        im.mix = 0; im.timer = 0;
      }
      this.advance = false;
      im.mix = Math.min(1, im.mix + dt * Math.max(6, this.rate * 4));
      fu.uGlow.value = Math.min(1, k * 1.2);
      if (k >= 1) { st.phase = 'condense'; st.t = 0; }
    } else if (st.phase === 'condense') {
      const k = Math.min(1, st.t / 5);
      scale = Math.max(0.001, 1 - k * 1.2);
      show = 1 - k;
      this.orb.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (1 - Math.max(0, k - 0.7) / 0.3);
      if (k >= 1) { st.phase = 'settle'; st.t = 0; }
    } else { // the orb drifts down into the blanket, then on to the next portal
      const k = Math.min(1, st.t / 4);
      this.orb.position.set(0, 1.7 - k * 4.8, -5 - k * 3);
      this.orb.material.opacity = 1 - k;
      show = 0;
      warp = 0.6 + k * 4;
      if (k >= 1) { st.phase = 'fly'; st.t = 0; this.set++; const [b] = this._range(); this.img = { cur: b, next: b + 1, mix: 0, timer: 0 }; }
    }
    if (st.phase !== 'settle') this.orb.position.set(0, 1.7, z + 0.1);
    if (st.phase === 'fly' || st.phase === 'cycle') this.orb.material.opacity = 0;
    this.orbGlow.position.copy(this.orb.position);
    this.orbGlow.userData.u.uAlpha.value = this.orb.material.opacity;
    U.uWarp.value += dt * warp;
    // portal and echo ring
    fu.uA.value = this.img.cur; fu.uB.value = this.img.next; fu.uMix.value = this.img.mix;
    this.frame.position.set(0, 1.7, z);
    this.frame.scale.setScalar(scale * (1 + s.breath * 0.03));
    fu.uFade.value = this.fade * show;
    this.echoes.forEach((m, i) => {
      const a = (i / 8) * Math.PI * 2 + t * 0.05;
      const r = 3.6 * scale;
      m.position.set(Math.cos(a) * r, 1.7 + Math.sin(a) * r * 0.75, z - 1.2);
      m.scale.setScalar(scale);
      const u = m.material.uniforms;
      const [base, n] = this._range();
      u.uA.value = base + ((this.img.cur - base - 1 - i % 3 + n * 4) % n);
      u.uB.value = base + ((this.img.next - base - 1 - i % 3 + n * 4) % n);
      u.uMix.value = this.img.mix;
      u.uFade.value = this.fade * (st.phase === 'cycle' ? Math.min(1, st.t / 4) : show * (st.phase === 'condense' ? 1 : 0));
    });
  }

  dispose() { live.delete(this); super.dispose(); }
}
