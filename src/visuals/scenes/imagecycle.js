import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';
import { makeBlanket } from './affirm.js';

// Image cycling, after the visualisation practice of cycling rapidly through
// vivid, emotionally charged images of the life you want, framed as a Time Line
// Therapy journey. The aura blanket below is your timeline: the past behind
// you, the future ahead. The first station is a dark obstacle that cracks with
// light and shatters (letting the old story go); then each station cycles
// photographs of one positive theme for 30 seconds, accelerating with the
// music, condenses them into an orb of light, and places that orb into your
// future on the timeline ahead, where it keeps glowing as you fly on.
//
// Photos (Wikimedia Commons, credited in public/photos/photos.json) load from
// the site; painted images are the offline fallback; your own images, added on
// the flat-screen menu, replace both.

const SETS = [
  { title: 'Let the past go', items: ['Peace', 'Rest', 'Open doors', 'Transformation'] },
  { title: 'Return to nature', items: ['Nature', 'Health', 'Growth', 'Freedom'] },
  { title: 'You are loved', items: ['Love', 'Together', 'Home', 'Kindness'] },
  { title: 'Your bright future', items: ['Abundance', 'Gift', 'Joy', 'Achievement'] },
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

function cell(c, S, ox, oy, draw, label) {
  c.save();
  c.translate(ox, oy);
  c.beginPath(); c.rect(0, 0, S, S); c.clip();
  draw(c, S);
  if (label) {
    // a soft scrim keeps the caption readable on bright photos
    const g = c.createLinearGradient(0, S * 0.66, 0, S);
    g.addColorStop(0, 'rgba(8,6,24,0)'); g.addColorStop(1, 'rgba(8,6,24,0.62)');
    c.fillStyle = g; c.fillRect(0, S * 0.66, S, S * 0.34);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = S * 0.066;
    const font = (z) => `400 ${z}px "Jost", "Inter", "Roboto", system-ui, sans-serif`;
    c.font = font(size);
    while (c.measureText(label).width > S * 0.66 && size > 14) { size -= 1; c.font = font(size); }
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = S * 0.025;
    c.fillStyle = '#ffffff';
    c.fillText(label, S / 2, S * 0.83);
  }
  c.restore();
}

// An affirmation slide: glowing words on a soft nebula.
function slide(text, seed) {
  return (c, S) => {
    const hues = [[124, 92, 255], [94, 214, 208], [242, 155, 208], [243, 199, 122]];
    c.fillStyle = '#0b0a1f'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) {
      const h = hues[(i + seed) % 4], x = S * (0.2 + 0.6 * ((Math.sin(seed * 12.9 + i * 4.1) + 1) / 2)), y = S * (0.2 + 0.6 * ((Math.cos(seed * 7.3 + i * 2.7) + 1) / 2));
      const g = c.createRadialGradient(x, y, 0, x, y, S * 0.6);
      g.addColorStop(0, `rgba(${h[0]},${h[1]},${h[2]},0.8)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
    }
    c.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 70; i++) { const x = (Math.sin(i * 91.7 + seed) * 0.5 + 0.5) * S, y = (Math.sin(i * 37.3 + seed * 3) * 0.5 + 0.5) * S; c.beginPath(); c.arc(x, y, 0.6 + (i % 3) * 0.5, 0, 7); c.fill(); }
    // wrap into lines that fit
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const font = (z) => `500 ${z}px "Comfortaa", "Jost", "Nunito", system-ui, sans-serif`;
    let size = S * 0.105, lines;
    for (;;) {
      c.font = font(size);
      lines = []; let line = '';
      for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (c.measureText(t).width > S * 0.74 && line) { lines.push(line); line = w; } else line = t; }
      lines.push(line);
      if (lines.length <= 3 || size < S * 0.06) break;
      size -= 2;
    }
    const lh = size * 1.3, y0 = S / 2 - (lines.length - 1) * lh / 2;
    c.shadowColor = 'rgba(255,240,255,0.9)'; c.shadowBlur = S * 0.04;
    c.fillStyle = '#ffffff';
    lines.forEach((l, i) => c.fillText(l, S / 2, y0 + i * lh));
    c.shadowBlur = 0;
  };
}

function cover(img) {
  return (cc, S) => {
    const k = Math.max(S / img.width, S / img.height);
    cc.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k);
  };
}

// sets: [{ title, items: [{ draw, label }] }] -> one texture atlas plus where each set lives in it
function packAtlas(sets, kind) {
  const total = sets.reduce((n, s) => n + s.items.length, 0);
  const S = total > 36 ? 448 : 512;   // keep the atlas texture a sensible size for the headset
  const G = Math.max(2, Math.ceil(Math.sqrt(total)));
  const cv = document.createElement('canvas');
  cv.width = cv.height = S * G;
  const c = cv.getContext('2d');
  c.fillStyle = '#0b0a1f'; c.fillRect(0, 0, cv.width, cv.height);
  const out = [];
  let i = 0;
  for (const set of sets) {
    const base = i;
    for (const it of set.items) { cell(c, S, (i % G) * S, Math.floor(i / G) * S, it.draw, it.label); i++; }
    out.push({ title: set.title, base, n: set.items.length });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  return { tex, grid: G, sets: out, kind };
}

export function buildAtlas(userImages, photoSets) {
  if (userImages && userImages.length) {
    return packAtlas([{ title: 'Your vision', items: userImages.slice(0, 16).map((img) => ({ draw: cover(img), label: '' })) }], 'user');
  }
  if (photoSets && photoSets.length) {
    let n = 0;
    return packAtlas(photoSets.map((s) => ({ title: s.title, items: s.items.map((it) => (it.text ? { draw: slide(it.text, n++), label: '' } : { draw: cover(it.img), label: it.cap })) })), 'photo');
  }
  return packAtlas(SETS.map((s) => ({ title: s.title, items: s.items.map((name) => ({ draw: PAINT[name], label: name })) })), 'painted');
}

// ---------------------------------------------------------------- photographs shipped with the site
let photoSets = null, photoPromise = null;
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); im.decoding = 'async'; im.onload = () => res(im); im.onerror = rej; im.src = src; });
}
export function loadPhotoSets() {
  if (!photoPromise) {
    photoPromise = (async () => {
      try {
        const man = await (await fetch('photos/photos.json')).json();
        try { await Promise.race([document.fonts.load('500 40px "Comfortaa"'), new Promise((r) => setTimeout(r, 2500))]); } catch {}
        const sets = [];
        for (const s of man.sets) {
          const items = (await Promise.all(s.items.map(async (it) => {
            if (it.text) return it;
            try { return { ...it, img: await loadImage('photos/' + it.f) }; } catch { return null; }
          }))).filter(Boolean);
          if (items.length >= 2) sets.push({ title: s.title, items });
        }
        photoSets = sets.length ? sets : null;
      } catch { photoSets = null; }
      return photoSets;
    })();
  }
  return photoPromise;
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
  const [imgs, photos] = await Promise.all([loadUserImages(), loadPhotoSets()]);
  const next = buildAtlas(imgs, photos);
  if (shared && shared !== next) shared.tex.dispose();
  shared = next;
  for (const s of live) s.setAtlas(shared);
  return imgs.length;
}
const live = new Set();

// ---------------------------------------------------------------- scene
const FRAME_FRAG = /* glsl */ `uniform sampler2D uAtlas; uniform float uA, uB, uMix, uGrid, uFade, uGlow, uTime, uRing, uEcho;
  varying vec2 vUv;
  vec4 img(float i, vec2 uv){ vec2 c = vec2(mod(i, uGrid), floor(i / uGrid)); return texture2D(uAtlas, vec2((c.x + uv.x) / uGrid, 1.0 - (c.y + 1.0 - uv.y) / uGrid)); }
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0;
    float inside = smoothstep(0.86, 0.82, r);
    vec2 uv = clamp((vUv - 0.5) * 1.18 + 0.5, 0.004, 0.996);
    vec3 c = mix(img(uA, uv).rgb, img(uB, uv).rgb, uMix);
    float ring = exp(-pow((r - 0.9) * 18.0, 2.0));
    float h = 0.5 + 0.5 * sin(atan(p.y, p.x) * 2.0 + uTime * 0.5);
    vec3 aura = mix(mix(vec3(0.62, 0.36, 1.0), vec3(1.0, 0.55, 0.82), h), vec3(0.45, 0.9, 1.0), 0.5 + 0.5 * sin(atan(p.y, p.x) * 3.0 - uTime * 0.3));
    vec3 col = c * inside * (0.9 + uGlow * 0.25) + aura * ring * (0.9 + uRing) + aura * exp(-max(r - 0.9, 0.0) * 6.0) * 0.25 * step(0.9, r);
    float a = max(inside, ring * 0.9) * uFade * uEcho;
    gl_FragColor = vec4(col * uEcho, a);
  }`;

const VERT_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

// A dark disc of shards: the old story. Light builds up behind it, leaks
// through the cracks, then it bursts outward and dissolves.
function makeObstacle(U) {
  const rings = [0, 0.42, 0.82, 1.2, 1.56, 1.85], SEC = 16;
  const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const V = (ri, si) => {
    if (ri === 0) return [0, 0];
    const k = ri * 100 + (si % SEC);
    const r = rings[ri] + (ri < rings.length - 1 ? (rnd(k) - 0.5) * 0.18 : 0);
    const a = ((si % SEC) + (rnd(k + 7) - 0.5) * 0.5 + ri * 0.37) / SEC * Math.PI * 2;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  const pos = [], cen = [], dir = [], tone = [];
  let n = 0;
  const tri = (A, B, C) => {
    const cx = (A[0] + B[0] + C[0]) / 3, cy = (A[1] + B[1] + C[1]) / 3;
    const z = (rnd(n + 3) - 0.5) * 0.12;
    const len = Math.hypot(cx, cy) || 1;
    const sp = 2.5 + rnd(n + 11) * 4;
    const d = [cx / len * sp + (rnd(n + 5) - 0.5) * 2, cy / len * sp + (rnd(n + 9) - 0.5) * 2, 1.5 + rnd(n + 13) * 5];
    const spin = (rnd(n + 17) - 0.5) * 8;
    for (const P of [A, B, C]) {
      pos.push(cx + (P[0] - cx) * 0.93, cy + (P[1] - cy) * 0.93, z);
      cen.push(cx, cy, z); dir.push(d[0], d[1], d[2]); tone.push(rnd(n + 1), spin);
    }
    n++;
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let si = 0; si < SEC; si++) {
      const a = V(ri, si), b = V(ri, si + 1), c = V(ri + 1, si), d = V(ri + 1, si + 1);
      if (ri === 0) tri(a, c, d); else { tri(a, c, d); tri(a, d, b); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aCen', new THREE.Float32BufferAttribute(cen, 3));
  g.setAttribute('aDir', new THREE.Float32BufferAttribute(dir, 3));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 2));
  const u = { uBreak: { value: 0 }, uCrack: { value: 0 }, uShow: { value: 0 } };
  const shards = new THREE.Mesh(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { ...U, ...u },
    vertexShader: /* glsl */ `attribute vec3 aCen, aDir; attribute vec2 aTone; uniform float uBreak, uTime; varying float vT, vR, vB;
      void main(){
        vec3 p = position - aCen;
        float b = uBreak;
        float a = aTone.y * b;
        p.xy = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xy;
        p.yz = mat2(cos(a * 0.7), -sin(a * 0.7), sin(a * 0.7), cos(a * 0.7)) * p.yz;
        p *= 1.0 - smoothstep(0.1, 0.9, b) * 0.85;
        vec3 c = aCen + aDir * (b * 1.6 + b * b * 2.2);
        c += vec3(0.0, 0.0, sin(uTime * 0.7 + aTone.x * 6.0) * 0.015);
        vT = aTone.x; vR = length(aCen.xy); vB = b;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(c + p, 1.0);
      }`,
    fragmentShader: /* glsl */ `uniform float uFade, uShow, uCrack, uBreak; varying float vT, vR, vB;
      void main(){
        vec3 base = mix(vec3(0.035, 0.03, 0.06), vec3(0.09, 0.075, 0.13), vT);
        vec3 hot = mix(vec3(1.0, 0.82, 0.55), vec3(0.75, 0.6, 1.0), vT);
        vec3 col = mix(base + hot * uCrack * 0.18, hot * (0.9 + 0.5 * vT), smoothstep(0.0, 0.35, vB));
        float a = uShow * uFade * (1.0 - smoothstep(0.12, 0.8, vB)) * (1.0 - 0.35 * smoothstep(0.0, 0.2, vB)) * smoothstep(1.95, 1.75, vR);
        gl_FragColor = vec4(col, a);
      }`,
  }));
  shards.renderOrder = 13;
  // the light gathering behind the shards
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { ...U, ...u },
    vertexShader: VERT_UV,
    fragmentShader: /* glsl */ `uniform float uFade, uShow, uCrack, uBreak, uTime; varying vec2 vUv;
      void main(){
        vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
        float rays = 0.65 + 0.35 * sin(atan(p.y, p.x) * 9.0 + uTime * 0.4);
        float core = exp(-r * r * 9.0) + exp(-r * 3.2) * 0.45 * rays;
        float flash = exp(-pow(uBreak - 0.12, 2.0) * 60.0) * step(0.001, uBreak);
        vec3 col = mix(vec3(1.0, 0.86, 0.6), vec3(0.8, 0.7, 1.0), r) * core * (uCrack * 1.4 + flash * 1.5) * (1.0 - smoothstep(0.6, 1.6, uBreak) * 0.85);
        gl_FragColor = vec4(col * uShow * uFade, 1.0);
      }`,
  }));
  glow.renderOrder = 11;
  glow.position.z = -0.25;
  const grp = new THREE.Group();
  grp.add(glow, shards);
  grp.userData.u = u;
  return grp;
}

function textPlane(U, w, h) {
  const cv = document.createElement('canvas');
  cv.width = 2048; cv.height = Math.round(2048 * h / w);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { ...U, uTex: { value: tex }, uA: { value: 0 } },
    vertexShader: VERT_UV,
    fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uA, uFade, uTime; varying vec2 vUv;
      void main(){ vec4 t = texture2D(uTex, vUv);
        vec3 tint = mix(vec3(0.86, 0.82, 1.0), vec3(0.78, 0.98, 0.96), 0.5 + 0.5 * sin(vUv.x * 3.0 + uTime * 0.3));
        gl_FragColor = vec4(tint * t.a * uA * 1.4 * uFade, 1.0); }`,
  }));
  m.renderOrder = 20;
  let current = null;
  m.userData.set = (text) => {
    if (text === current) return;
    current = text;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    if (!text) { tex.needsUpdate = true; return; }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let size = cv.height * 0.62;
    const font = (z) => `300 ${z}px "Jost", "Inter", "Roboto", "Segoe UI", system-ui, sans-serif`;
    c.font = font(size);
    while (c.measureText(text).width > cv.width * 0.92) { size -= 4; c.font = font(size); }
    c.shadowColor = 'rgba(255,255,255,0.8)'; c.shadowBlur = size * 0.25;
    c.fillStyle = '#fff';
    c.fillText(text, cv.width / 2, cv.height / 2);
    tex.needsUpdate = true;
  };
  return m;
}

const PLACE_LINES = ['Placed in your future', 'It is already on its way', 'Your timeline glows brighter', 'Let it unfold'];

export class ImageCycleScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    this.group.add(makeBlanket(U));
    if (!shared) shared = buildAtlas(null, null);
    refreshImageAtlas();
    live.add(this);
    this.atlas = shared;
    const mk = (size, echo) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        uniforms: { ...U, uFade: { value: 0 }, uAtlas: { value: shared.tex }, uGrid: { value: shared.grid }, uA: { value: 0 }, uB: { value: 1 }, uMix: { value: 0 }, uGlow: { value: 0 }, uRing: { value: 0 }, uEcho: { value: echo } },
        vertexShader: VERT_UV,
        fragmentShader: FRAME_FRAG,
      }));
      m.renderOrder = 12;
      this.group.add(m);
      return m;
    };
    this.frame = mk(3.6, 1);
    this.echoes = Array.from({ length: 8 }, () => mk(1.6, 0.5));
    this.obstacle = makeObstacle(U);
    this.group.add(this.obstacle);
    this.title = textPlane(U, 5.2, 0.62);
    this.group.add(this.title);
    // the condensed orb
    this.orb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 32, 24), new THREE.MeshBasicMaterial({ color: 0xfff0d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(this.orb);
    this.orbGlow = particles(U, { count: 260, min: [-0.6, -0.6, -0.6], max: [0.6, 0.6, 0.6], vel: [0, 0, 0], sway: 0.25, size: [0.02, 0.05], colors: ['#fff2d0', '#ffd6ff', '#d6f6ff'] });
    this.orbGlow.userData.u.uAlpha.value = 0;
    this.group.add(this.orbGlow);
    // beacons: the orbs you have placed in your future, glowing on the timeline ahead
    this.beacons = Array.from({ length: 6 }, (_, i) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 16), new THREE.MeshBasicMaterial({ color: [0xffe9c2, 0xd9c8ff, 0xc2fff6, 0xffd0ee][i % 4], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      const halo = particles(U, { count: 120, min: [-0.9, -0.4, -0.9], max: [0.9, 1.6, 0.9], vel: [0, 0.12, 0], sway: 0.3, size: [0.02, 0.06], colors: ['#fff2d0', '#e4d8ff', '#d6fff8'] });
      halo.userData.u.uAlpha.value = 0;
      b.add(halo);
      b.userData = { on: 0, halo, x: [-3.2, 3.4, -1.4, 2.0, -3.8, 1.0][i], z: -26 - i * 7 };
      this.group.add(b);
      return b;
    });
    this.placed = 0;
    this.group.add(particles(U, { count: 500, min: [-30, -2, -80], max: [30, 10, 6], vel: [0, 0.05, 2], sway: 0.6, size: [0.02, 0.05], colors: ['#ffffff', '#ffe4ff', '#d8f4ff'], alpha: 0.7, clear: 1 }));
    this.station = 0;
    this.st = { phase: 'fly', t: 0 };
    this._resetImages();
  }

  setAtlas(a) {
    this.atlas = a;
    for (const m of [this.frame, ...this.echoes]) { m.material.uniforms.uAtlas.value = a.tex; m.material.uniforms.uGrid.value = a.grid; }
    this._resetImages();
  }

  _set() { const s = this.atlas.sets; return s[this.station % s.length]; }
  _resetImages() { const { base, n } = this._set(); this.img = { cur: base, next: base + (n > 1 ? 1 : 0), mix: 0, timer: 0 }; }
  _wrap(i) { const { base, n } = this._set(); return base + (((i - base) % n) + n) % n; }

  onEvent(e) {
    if (e.type === 'beat' && e.accent) { this.frame.material.uniforms.uRing.value = 1; this.uniforms.uRip.value = 1; }
    if (e.type === 'beat' && this.st.phase === 'cycle' && this.rate < 2.2) this.advance = true;   // slow cycling follows the beat
    if (e.type === 'beat' && e.accent && this.st.phase === 'obstacle' && this.st.t > 5) this.breakNow = true;
  }

  // only the scene you're in makes sounds, not one fading out
  _sfx(kind, opts) { if (this.fade > 0.5) SFX.play(kind, opts); }

  _next(phase) { this.st.phase = phase; this.st.t = 0; }

  update(dt, t, s) {
    const U = this.uniforms, st = this.st;
    st.t += dt;
    U.uRip.value *= Math.exp(-dt * 1.2);
    const fu = this.frame.material.uniforms;
    fu.uRing.value *= Math.exp(-dt * 2.5);
    const ou = this.obstacle.userData.u;
    let z = -5, scale = 1, show = 1, warp = 0.6, titleA = 0, title = this._set().title;
    const firstStation = this.station % this.atlas.sets.length === 0;
    let obst = 0;
    if (st.phase === 'fly') {
      const k = Math.min(1, st.t / 14);
      const e = 1 - Math.pow(1 - k, 3);
      z = -70 + e * 65;
      warp = 6 * (1 - e) + 0.6;
      if (firstStation) { show = 0; obst = Math.min(1, st.t / 3); title = 'Let the old story go'; ou.uBreak.value = 0; ou.uCrack.value = 0; }
      else show = Math.min(1, st.t / 3);
      titleA = Math.max(0, Math.min(1, (st.t - 7) / 3));
      if (k >= 1) this._next(firstStation ? 'obstacle' : 'cycle');
      if (k >= 1) this.img.timer = 0;
    } else if (st.phase === 'obstacle') {
      // light gathers behind the old story until a strong beat (or 11 s) breaks it open
      show = 0; obst = 1;
      if (!this.broke) {
        ou.uCrack.value = Math.min(1, st.t / 8);
        title = st.t < 6 ? 'Let the old story go' : 'Break through';
        titleA = 1;
        if (this.breakNow || st.t > 11) { this.broke = true; this.breakAt = st.t; U.uRip.value = 1.5; }
      } else {
        const b = (st.t - this.breakAt) / 3.2;
        ou.uBreak.value = b;
        ou.uCrack.value = Math.max(0, 1 - b);
        title = 'Break through'; titleA = Math.max(0, 1 - b * 2);
        show = Math.min(1, Math.max(0, (b - 0.25) * 1.6));
        if (b >= 1.25) { this.broke = false; this.breakNow = false; this._next('cycle'); this.img.timer = 0; }
      }
    } else if (st.phase === 'cycle') {
      // Accelerate from one image every 1.5 s to fourteen a second over 30 s,
      // hold for 6 s, then a final surge up to 24 a second (36-40 s), held
      // to 46 s, before everything goes still.
      const k = Math.min(1, st.t / 30);
      if (st.t < 30) this.rate = 0.65 + Math.pow(k, 1.8) * 13.35;
      else if (st.t < 36) this.rate = 14;
      else { const f = Math.min(1, (st.t - 36) / 4); this.rate = 14 + f * f * (3 - 2 * f) * 10; }
      this.surge = st.t > 36 ? Math.min(1, (st.t - 36) / 4) : 0;
      const im = this.img;
      im.timer += dt;
      if ((this.rate >= 2.2 && im.timer >= 1 / this.rate - 0.004) || (this.advance && im.timer > 0.35) || im.timer > 1 / this.rate + 0.6) {
        im.cur = im.next;
        im.next = this._wrap(im.next + 1);
        im.mix = 0; im.timer = 0;
        // each image lands with a dull thud, alternating right and left ear
        this.side = -(this.side || -1);
        this._sfx('thud', { pan: this.side * 0.85, decay: Math.max(0.04, Math.min(0.4, 0.7 / this.rate)), gain: 2.4 - Math.min(0.5, this.rate * 0.035) });
      }
      this.advance = false;
      im.mix = Math.min(1, im.mix + dt * Math.max(6, this.rate * 4));
      fu.uGlow.value = Math.min(1, k * 1.2);
      titleA = Math.max(0, 1 - st.t / 6);
      obst = firstStation ? 1 : 0;
      fu.uRing.value = Math.max(fu.uRing.value, this.surge * 0.7);
      if (st.t >= 46) this._next('condense');
    } else if (st.phase === 'condense') {
      const k = Math.min(1, st.t / 5);
      scale = Math.max(0.001, 1 - k * 1.2);
      show = 1 - k;
      this.orb.material.opacity = Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5) * (1 - Math.max(0, k - 0.85) / 0.15 * 0.3);
      if (k >= 1) { this._next('place'); this._sfx('whoosh', { pan: 0, dur: 2.2, gain: 0.8 }); }
    } else { // place the orb into your future: it arcs ahead and settles onto the timeline
      const k = Math.min(1, st.t / 6);
      const bi = this.placed % this.beacons.length;
      const B = this.beacons[bi].userData;
      const e = k * k * (3 - 2 * k);
      this.orb.position.set(B.x * e, 1.7 + Math.sin(e * Math.PI) * 1.4 - e * 4.6, -5 + (B.z + 5) * e);
      this.orb.material.opacity = 1 - Math.max(0, k - 0.8) / 0.2;
      show = 0;
      warp = 0.6 + k * 2;
      title = PLACE_LINES[this.placed % PLACE_LINES.length]; titleA = Math.sin(Math.min(1, k * 1.2) * Math.PI);
      if (k >= 1) {
        B.on = 1; this.placed++;
        this._sfx('thud', { pan: Math.sign(B.x) * 0.5, decay: 0.6, gain: 0.7 });
        this.station++;
        if (this.station % this.atlas.sets.length === 0) for (const b of this.beacons) b.userData.on = 0;   // a fresh timeline each round
        this._resetImages();
        this._next('fly');
      }
    }
    if (st.phase !== 'place') this.orb.position.set(0, 1.7, z + 0.1);
    if (st.phase === 'fly' || st.phase === 'cycle' || st.phase === 'obstacle') this.orb.material.opacity = 0;
    this.orbGlow.position.copy(this.orb.position);
    this.orbGlow.userData.u.uAlpha.value = this.orb.material.opacity;
    U.uWarp.value += dt * warp;
    // obstacle
    ou.uShow.value = obst;
    this.obstacle.position.set(0, 1.7, z + 0.15);
    this.obstacle.visible = obst > 0.001;
    // title, above the portal
    this.title.userData.set(title);
    this.title.material.uniforms.uA.value = damp(this.title.material.uniforms.uA.value, titleA, 3, dt);
    this.title.position.set(0, st.phase === 'place' ? 2.3 : 3.95, st.phase === 'place' ? -6 : z);
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
      u.uA.value = this._wrap(this.img.cur - 1 - (i % 3));
      u.uB.value = this._wrap(this.img.next - 1 - (i % 3));
      u.uMix.value = this.img.mix;
      u.uFade.value = this.fade * (st.phase === 'cycle' ? Math.min(1, st.t / 4) : show * (st.phase === 'condense' ? 1 : 0));
    });
    // beacons breathe on the timeline ahead
    this.beacons.forEach((b, i) => {
      const d = b.userData;
      const target = d.on ? 0.85 + 0.15 * Math.sin(t * 1.3 + i) : 0;
      b.material.opacity = damp(b.material.opacity, target * this.fade, 1.5, dt);
      d.halo.userData.u.uAlpha.value = b.material.opacity;
      b.position.set(d.x, -1.9 + Math.sin(t * 0.6 + i) * 0.08, d.z);
      b.scale.setScalar(1 + s.breath * 0.12);
    });
  }

  dispose() { live.delete(this); super.dispose(); }
}
