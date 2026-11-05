import * as THREE from 'three';

// Pictures for the Lights menus (on screens and in the headset): each sacred
// symbol, rendered once with the lights' own shader so it looks exactly as it
// will; little drawings of each light style; and the colour sets.

export const LIGHT_COLOURS = [
  ['vivid', 'Vivid', ['#ff4ad0', '#2ee0ff']],
  ['palette', 'Track palette', ['#7a5aff', '#ffb84a']],
  ['white', 'White', ['#fff2d8', '#ffffff']],
  ['amber', 'Amber', ['#ff8a1a', '#ffd27a']],
  ['violet', 'Violet', ['#8a4aff', '#4ae08a']],
  ['rainbow', 'Rainbow', ['#ff4a4a', '#ffd24a', '#4ae08a', '#4a9aff', '#c84aff']],
];
// what the lights show: a plain glow, a wide glow, or a symbol (always glowing)
export const LIGHT_SYMBOLS = [
  [-1, 'Glow', 'field'], [-2, 'Glow wide', 'wide'],
  [0, 'Flower Life'], [1, 'Sri Yantra'], [2, 'Lotus'], [3, 'Merkaba'], [4, 'Ripples'], [5, 'Seed Life'],
  [6, 'Glowing orb', 'orb'], [8, 'Neon ring', 'ring'], [9, 'Crystal', 'crystal'], [10, 'MindBoss', 'logo'],
];
export const LIGHT_LOOKS = [
  ['Gentle glow', ['#ffb84a', '#ff8ad0'], { lightSymbol: -1, lightColour: 'palette', lightMode: 'soft', lightMax: 1, lightDim: 0.8 }],
  ['Sacred', ['#a46aff', '#5ed6d0'], { lightSymbol: 0, lightColour: 'vivid', lightMode: 'exact', lightMax: 1, lightDim: 0.8 }],
  ['Glowing orb', ['#ff6a9a', '#ffd27a'], { lightSymbol: 6, lightColour: 'vivid', lightMode: 'exact', lightMax: 1, lightDim: 0.8 }],
  ['Neon ring', ['#2ee0ff', '#ff4ad0'], { lightSymbol: 8, lightColour: 'vivid', lightMode: 'exact', lightMax: 1, lightDim: 0.8 }],
  ['Wide wash', ['#2ec4b6', '#a493ff'], { lightSymbol: -2, lightColour: 'violet', lightMode: 'soft', lightMax: 1, lightDim: 0.8 }],
];

// saved settings from earlier versions to the current one
export function migrateLights(p) {
  if (p.lightsV >= 6) return LIGHT_SYMBOLS.some(([k]) => k === p.lightSymbol) ? p.lightSymbol : -1;
  const shape = { orb: 6, chrome: 6, ring: 8, crystal: 9 }[p.lightStyle];
  if (shape != null) return shape;
  if (p.lightStyle === 'wide') return -2;
  if (p.lightSymbol === 7) return 6;
  return Number.isInteger(p.lightSymbol) && p.lightSymbol >= 0 && p.lightSymbol <= 10 ? p.lightSymbol : -1;
}

export const gradient = (c, x0, y0, x1, y1, cols) => {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  cols.forEach((col, i) => g.addColorStop(cols.length > 1 ? i / (cols.length - 1) : 0, col));
  return g;
};

// a little drawing of a light style, in a square of size s at (x, y)
export function drawStyle(c, kind, x, y, s, cols = ['#ff4ad0', '#2ee0ff']) {
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.36;
  c.save();
  const glow = (gx, gy, gr, col) => { const g = c.createRadialGradient(gx, gy, 0, gx, gy, gr); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(gx, gy, gr, 0, Math.PI * 2); c.fill(); };
  if (kind === 'logo') {   // the MindBoss mark: nested rings spiralling into a bright core
    glow(cx, cy, r * 1.3, cols[0] + '77');
    const k = (s * 0.86) / 100, ox = cx - 65 * k, oy = cy - 55 * k;
    const R = [[56, 66, 50, '#5ED6D0'], [60.3, 60.8, 39, '#74CAE4'], [63.5, 56.9, 30, '#8BB4F4'], [66.3, 53.4, 22, '#A493FF'], [69, 50.1, 15, '#BB98F5'], [71.6, 47, 9.5, '#D59BE5'], [74, 44, 5.5, '#F29BD0']];
    c.lineWidth = Math.max(1, s * 0.02);
    for (const [x0, y0, rr, col] of R) { c.strokeStyle = col; c.beginPath(); c.arc(ox + x0 * k, oy + y0 * k, rr * k, 0, Math.PI * 2); c.stroke(); }
    glow(ox + 74 * k, oy + 44 * k, 9 * k, '#FFF3D6'); c.fillStyle = '#FFF3D6'; c.beginPath(); c.arc(ox + 74 * k, oy + 44 * k, 2.4 * k, 0, Math.PI * 2); c.fill();
  } else if (kind === 'none') { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = s * 0.025; c.setLineDash([s * 0.06, s * 0.05]); c.beginPath(); c.arc(cx, cy, r * 0.8, 0, Math.PI * 2); c.stroke(); c.setLineDash([]); c.beginPath(); c.moveTo(cx - r * 0.55, cy + r * 0.55); c.lineTo(cx + r * 0.55, cy - r * 0.55); c.stroke(); }
  else if (kind === 'field') { glow(cx - r * 0.45, cy, r * 1.1, cols[0]); glow(cx + r * 0.45, cy, r * 1.1, cols[1]); }
  else if (kind === 'wide') {
    for (const [i, col] of [[0, cols[0]], [1, cols[1]]]) { const g = c.createLinearGradient(x, cy - r * 0.6, x, cy + r * 0.6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(i ? cx : x + s * 0.06, cy - r * 0.6, s * 0.44, r * 1.2); }
  } else if (kind === 'orb') { glow(cx, cy, r * 1.25, cols[0]); c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, cy, r * 0.45, 0, Math.PI * 2); c.fill(); }
  else if (kind === 'ring') { glow(cx, cy, r * 1.3, cols[1] + '88'); c.strokeStyle = cols[1]; c.lineWidth = s * 0.08; c.beginPath(); c.arc(cx, cy, r * 0.75, 0, Math.PI * 2); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = s * 0.02; c.stroke(); }
  else if (kind === 'crystal') {
    glow(cx, cy, r * 1.2, cols[0] + '66');
    c.fillStyle = gradient(c, cx - r, cy - r, cx + r, cy + r, [cols[0], '#ffffff', cols[1]]);
    c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r * 0.7, cy - r * 0.2); c.lineTo(cx + r * 0.45, cy + r * 0.85); c.lineTo(cx - r * 0.45, cy + r * 0.85); c.lineTo(cx - r * 0.7, cy - r * 0.2); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx, cy + r * 0.85); c.moveTo(cx - r * 0.7, cy - r * 0.2); c.lineTo(cx + r * 0.7, cy - r * 0.2); c.stroke();
  } else if (kind === 'chrome') {
    const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.1, cx, cy, r); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#9aa4b8'); g.addColorStop(0.8, cols[1]); g.addColorStop(1, '#2a2e3a');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r * 0.85, 0, Math.PI * 2); c.fill();
  } else {   // symbols: a flower of life
    if (kind === 'both') glow(cx, cy, r * 1.3, cols[0] + '77');
    c.strokeStyle = kind === 'both' ? '#fff' : cols[1]; c.lineWidth = s * 0.02;
    const rr = r * 0.32;
    c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.stroke();
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; c.beginPath(); c.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, rr, 0, Math.PI * 2); c.stroke(); }
    c.beginPath(); c.arc(cx, cy, rr * 2, 0, Math.PI * 2); c.stroke();
  }
  c.restore();
}

// render each symbol with the lights' own material, once, into little canvases
export function renderSymbolThumbs(renderer, strobe, count, size = 192) {
  if (renderer.xr.isPresenting || !strobe.meshes?.[0]) return null;
  const mat = strobe.meshes[0].material.clone();
  const u = mat.uniforms;
  u.uStyle.value = 0; if (u.uGlow) u.uGlow.value = 0; u.uBright.value = 1; u.uMax.value = 1; u.uMix.value = 0;
  u.uCol.value = new THREE.Color(0.75, 0.6, 1.0);
  mat.blending = THREE.NormalBlending;
  const scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), mat);
  scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1.05, 1.05, 1.05, -1.05, 0.1, 10);
  cam.position.z = 1;
  const rt = new THREE.WebGLRenderTarget(size, size);
  const px = new Uint8Array(size * size * 4);
  const prev = renderer.getRenderTarget(), prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const out = [];
  renderer.setClearColor(0x000000, 0);
  for (let i = 0; i < count; i++) {
    u.uSym.value = i; u.uSymB.value = i;
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, px);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);   // flip
    // brightness becomes alpha, so the symbol sits on any background
    for (let k = 0; k < img.data.length; k += 4) { const m = Math.max(img.data[k], img.data[k + 1], img.data[k + 2]); img.data[k + 3] = Math.min(255, m * 1.4); }
    ctx.putImageData(img, 0, 0);
    out.push(cv);
  }
  renderer.setRenderTarget(prev);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose(); quad.geometry.dispose(); mat.dispose();
  return out;
}
