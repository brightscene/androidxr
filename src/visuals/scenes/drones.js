import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SFX, damp } from '../common.js';

// ===================================================================== Drone light show
// Over a still night lake, a swarm of glowing drones glides from one formation
// to the next like a murmuration of light: a slowly turning globe, a heart, the words "You Matter", "Amazing" and "You are Enough", a
// spiral galaxy, a turning Ferris wheel, a cottage, the Earth, a rocket, a lotus, a butterfly,
// Saturn, a hot-air balloon, a jellyfish, a whale and the moon, each mirrored in the water below.
const N = 1400;
const CY = 22, CZ = -42;
const WORD_DRONES = 820;      // enough to read clearly, without crowding the letters          // centre of the show in the sky

function textTargets(text, width) {
  const cv = document.createElement('canvas');
  cv.width = 1400; cv.height = 300;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 220;
  c.font = `800 ${size}px Jost, "Segoe UI", system-ui, sans-serif`;
  while (c.measureText(text).width > 1340 && size > 60) { size -= 6; c.font = `800 ${size}px Jost, "Segoe UI", system-ui, sans-serif`; }
  c.fillText(text, 700, 155);
  const d = c.getImageData(0, 0, 1400, 300).data;
  // lay the drones on an even grid along the letter strokes, so the words read crisply
  const grid = (step) => { const out = []; for (let y = step / 2; y < 300; y += step) for (let x = step / 2; x < 1400; x += step) if (d[(Math.floor(y) * 1400 + Math.floor(x)) * 4 + 3] > 128) out.push([x, y]); return out; };
  let step = 6, pts = grid(step);
  while (pts.length > WORD_DRONES && step < 30) { step += 0.5; pts = grid(step); }
  const k = width / 1400;
  const lit = pts.map(([x, y]) => [(x - 700) * k, (150 - y) * k, 0]);
  // the rest wait low over the water with their lights off
  const parked = Array.from({ length: N - lit.length }, (_, i) => [(i / (N - lit.length) - 0.5) * width * 1.1, -CY + 4 + Math.random() * 2, (Math.random() - 0.5) * 6, 1]);
  return lit.concat(parked);
}
// draw a coloured picture, then give each drone a point on it and that point's colour
function pictureTargets(draw, width, count, W = 600, H = 400) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  draw(c);
  const d = c.getImageData(0, 0, W, H).data;
  const k = width / W;
  const cands = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (d[i + 3] > 128) cands.push([(x - W / 2) * k, (H / 2 - y) * k, 0, 0, d[i] / 255, d[i + 1] / 255, d[i + 2] / 255]); }
  cands.sort(() => Math.random() - 0.5);
  const lit = spread(cands, count);                       // evenly spaced, never crowding
  const parked = Array.from({ length: N - lit.length }, (_, i) => [(i / Math.max(1, N - lit.length) - 0.5) * width, -CY + 4 + Math.random() * 2, (Math.random() - 0.5) * 6, 1]);
  return lit.concat(parked);
}
function drawBrand(c) {
  // the MindBoss light-tunnel mark, then the wordmark with its gradient "boss"
  const rings = [[56, 66, 50, '#5ED6D0'], [60.3, 60.8, 39, '#74CAE4'], [63.5, 56.9, 30, '#8BB4F4'], [66.3, 53.4, 22, '#A493FF'], [69, 50.1, 15, '#BB98F5'], [71.6, 47, 9.5, '#D59BE5'], [74, 44, 5.5, '#F29BD0']];
  const s = 2.3, ox = 20, oy = 18;
  c.lineWidth = 7;
  for (const [x, y, r, col] of rings) { c.strokeStyle = col; c.beginPath(); c.arc(ox + (x + 4) * s, oy + (y - 6) * s, r * s, 0, Math.PI * 2); c.stroke(); }
  c.fillStyle = '#FFF3D6'; c.beginPath(); c.arc(ox + 78 * s, oy + 38 * s, 7, 0, Math.PI * 2); c.fill();
  c.textBaseline = 'middle';
  c.font = '300 118px Comfortaa, Jost, system-ui, sans-serif';
  c.fillStyle = '#e9e4ff';
  const x0 = 330;
  c.fillText('mind', x0, 150);
  const mw = c.measureText('mind').width;
  c.font = '500 118px Comfortaa, Jost, system-ui, sans-serif';
  const lw = c.measureText('boss').width;
  const g = c.createLinearGradient(x0 + mw, 0, x0 + mw + lw, 0);
  g.addColorStop(0, '#5ED6D0'); g.addColorStop(0.55, '#A493FF'); g.addColorStop(1, '#F29BD0');
  c.fillStyle = g;
  c.fillText('boss', x0 + mw, 150);
}
const ell = (c, x, y, rx, ry, rot = 0) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill(); };
function drawCollie(c) {
  // a rough collie sitting up in profile, facing left, drawn as one flowing outline:
  // long wedge head, semi-erect ears with folded tips, a big mane, plumed tail on the ground
  const outline = () => {
    c.beginPath();
    c.moveTo(130, 116);                                   // nose
    c.bezierCurveTo(160, 102, 190, 90, 212, 84);          // muzzle top to the stop
    c.bezierCurveTo(222, 74, 234, 66, 248, 64);           // forehead
    c.lineTo(254, 46); c.lineTo(238, 52); c.lineTo(262, 40);   // small ear, its top folded forward
    c.lineTo(276, 60);
    c.bezierCurveTo(305, 62, 338, 88, 352, 128);          // the mane over the neck
    c.bezierCurveTo(362, 160, 366, 180, 372, 198);
    c.bezierCurveTo(388, 226, 408, 250, 430, 270);        // back
    c.bezierCurveTo(458, 292, 472, 320, 470, 346);        // haunch and rump
    c.bezierCurveTo(492, 350, 512, 360, 520, 374);        // a short plume of tail on the ground
    c.bezierCurveTo(508, 386, 486, 384, 470, 382);
    c.lineTo(226, 382);                                   // haunch, hind paw and front paws on the ground
    c.lineTo(222, 306);                                   // front of the front legs
    c.bezierCurveTo(190, 290, 168, 250, 166, 210);        // the frilled mane bulging out in front
    c.bezierCurveTo(164, 180, 176, 156, 194, 140);
    c.bezierCurveTo(180, 138, 156, 136, 136, 132);        // a deep lower jaw back to the nose
    c.bezierCurveTo(126, 130, 124, 120, 130, 116);
    c.closePath();
  };
  c.save();
  outline(); c.fillStyle = '#c98536'; c.fill();
  outline(); c.clip();
  // a darker saddle of sable along the back
  c.fillStyle = '#9a5f24';
  c.beginPath(); c.moveTo(290, 70); c.bezierCurveTo(360, 110, 400, 200, 470, 300); c.lineTo(500, 260); c.lineTo(400, 60); c.fill();
  c.fillStyle = '#ffffff';
  // the great white mane: under the jaw, round the neck and down the chest
  c.beginPath(); c.moveTo(150, 140); c.bezierCurveTo(240, 118, 280, 150, 282, 210); c.bezierCurveTo(282, 250, 276, 290, 272, 310); c.lineTo(200, 320); c.lineTo(140, 200); c.fill();
  c.fillRect(220, 300, 84, 90);                         // white front legs
  c.beginPath(); c.moveTo(498, 362); c.lineTo(530, 370); c.lineTo(512, 392); c.lineTo(486, 386); c.fill();   // white tail tip
  c.beginPath(); c.moveTo(214, 84); c.lineTo(150, 110); c.lineTo(152, 116); c.lineTo(222, 90); c.fill();   // the blaze down the muzzle
  c.fillStyle = '#7a4818';
  c.beginPath(); c.moveTo(238, 52); c.lineTo(262, 40); c.lineTo(270, 58); c.lineTo(250, 64); c.fill();     // darker ear
  // the line between the two front legs
  c.strokeStyle = 'rgba(0,0,0,0)'; c.fillStyle = '#d9d9d9'; c.fillRect(260, 320, 3, 62);
  c.restore();
  c.fillStyle = '#1a1208';
  ell(c, 135, 120, 8, 6);                                // nose
  ell(c, 226, 90, 5, 3.5, -0.3);                         // almond eye
}
function drawBunny(c) {
  // a Dutch rabbit sitting in profile, facing left: white front, blaze and feet,
  // soft blue-grey rear, cheeks and ears
  const outline = () => {
    c.beginPath();
    c.moveTo(178, 206);                                   // nose
    c.bezierCurveTo(180, 224, 190, 238, 206, 244);        // muzzle and chin
    c.bezierCurveTo(214, 262, 222, 280, 222, 300);        // throat and chest
    c.bezierCurveTo(218, 330, 212, 356, 210, 372);        // front leg
    c.bezierCurveTo(222, 382, 248, 382, 258, 376);        // front paw
    c.bezierCurveTo(272, 360, 290, 356, 304, 366);        // belly
    c.bezierCurveTo(330, 380, 410, 384, 452, 380);        // the long hind foot
    c.bezierCurveTo(480, 372, 492, 340, 488, 312);        // rump
    c.bezierCurveTo(482, 250, 440, 196, 380, 182);        // rounded back
    c.bezierCurveTo(340, 172, 300, 166, 276, 150);        // shoulders to nape
    c.bezierCurveTo(286, 110, 300, 64, 300, 34);          // back of the ear
    c.bezierCurveTo(300, 18, 284, 16, 278, 32);           // ear tip
    c.bezierCurveTo(268, 70, 258, 110, 246, 132);         // front of the ear
    c.bezierCurveTo(222, 140, 196, 168, 182, 190);        // forehead to nose
    c.closePath();
  };
  c.save();
  outline(); c.fillStyle = '#ffffff'; c.fill();
  outline(); c.clip();
  c.fillStyle = '#8b9cc0';
  // the coloured rear half, cut with a clean saddle line
  c.beginPath(); c.moveTo(318, 150); c.bezierCurveTo(330, 230, 326, 300, 322, 360); c.lineTo(600, 360); c.lineTo(600, 100); c.fill();
  // coloured cheeks and ears, leaving the white blaze up the face
  c.beginPath(); c.moveTo(210, 160); c.bezierCurveTo(240, 150, 280, 150, 286, 190); c.bezierCurveTo(286, 230, 250, 244, 222, 236); c.bezierCurveTo(226, 210, 222, 180, 210, 160); c.fill();
  c.beginPath(); c.moveTo(246, 132); c.lineTo(276, 150); c.lineTo(310, 20); c.lineTo(270, 20); c.fill();
  c.fillStyle = '#ffffff'; c.fillRect(430, 368, 80, 20);  // white hind foot
  c.restore();
  // the far ear, just behind
  c.fillStyle = '#7d8eb3';
  c.beginPath(); c.moveTo(288, 140); c.bezierCurveTo(300, 100, 322, 60, 330, 40); c.bezierCurveTo(336, 28, 324, 22, 316, 36); c.bezierCurveTo(302, 70, 290, 110, 280, 140); c.fill();
  c.fillStyle = '#ffffff'; ell(c, 492, 300, 18, 16);    // cotton tail
  c.fillStyle = '#1a1208'; ell(c, 230, 192, 7, 7);      // eye
}

// keep drones apart: from a crowd of candidate places, accept one only if no
// accepted drone is closer than dmin (shrinking dmin until there are enough)
function spread(cands, count) {
  let dmin = 1.4, out = [];
  while (dmin > 0.3) {
    out = [];
    const cell = dmin, grid = new Map();
    const key = (x, y) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;
    for (const p of cands) {
      const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell);
      let ok = true;
      for (let dx = -1; dx <= 1 && ok; dx++) for (let dy = -1; dy <= 1 && ok; dy++) {
        for (const q of grid.get(`${cx + dx},${cy + dy}`) || []) if (Math.hypot(p[0] - q[0], p[1] - q[1], (p[2] - q[2]) * 0.5) < dmin) { ok = false; break; }
      }
      if (ok) { out.push(p); const k = key(p[0], p[1]); (grid.get(k) || grid.set(k, []).get(k)).push(p); if (out.length >= count) return out; }
    }
    dmin *= 0.9;
  }
  return out;
}

function heartTargets() {
  const pts = [];
  while (pts.length < N * 8) {
    const x = Math.random() * 2.6 - 1.3, y = Math.random() * 2.6 - 1.4;
    if (Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y < 0) pts.push([x * 15, y * 15 + 2, (Math.random() - 0.5) * 2]);
  }
  return pick(spread(pts, N));
}
function sphereTargets() {
  return Array.from({ length: N }, (_, i) => {
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    return [Math.cos(a) * r * 13, y * 13, Math.sin(a) * r * 13];
  });
}
function spiralTargets() {
  const c = Array.from({ length: N * 8 }, (_, i) => {
    const arm = i % 3, t = Math.random();
    const a = t * 7 + arm * 2.094, r = 2 + t * 17;
    return [Math.cos(a) * r + (Math.random() - 0.5) * 2.5, Math.sin(a) * r * 0.55 + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3];
  });
  return pick(spread(c, N));
}
// choose exactly N points (repeating with a little jitter if there are too few)
function pick(src) {
  const out = [];
  const sh = src.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < N; i++) { const p = sh[i % sh.length]; out.push(i < sh.length ? p : [p[0] + (Math.random() - 0.5) * 0.3, p[1] + (Math.random() - 0.5) * 0.3, p[2]]); }
  // sort left to right so drones fly to nearby places rather than criss-crossing
  return out;
}


// ---- blissful formations: points with their own colours, and some that move
// a point: [x, y, z, parked, r, g, b, kind, a, rad, ox, oy] (kind/a/rad/ox/oy for moving parts)
const hexRGB = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
function fillN(pts, width = 30) {
  const lit = pts.length > N ? pts.sort(() => Math.random() - 0.5).slice(0, N) : pts;
  const parked = Array.from({ length: N - lit.length }, (_, i) => [(i / Math.max(1, N - lit.length) - 0.5) * width, -CY + 4 + Math.random() * 2, (Math.random() - 0.5) * 6, 1]);
  return lit.concat(parked);
}
function ferrisTargets() {
  const R = 12, pts = [];
  for (const z of [-1.2, 1.2]) for (let i = 0; i < 170; i++) { const a = (i / 170) * Math.PI * 2; pts.push([0, 0, z, 0, ...hexRGB(i % 2 ? '#7ff0ff' : '#ffffff'), 1, a, R]); }
  for (let s = 0; s < 12; s++) for (let k = 1; k < 10; k++) { const a = (s / 12) * Math.PI * 2; pts.push([0, 0, 0, 0, ...hexRGB('#b48aff'), 1, a, (k / 10) * R]); }
  const cabCols = ['#ff7a9a', '#ffd27a', '#7affb0', '#7ac8ff', '#ff9a5a', '#e08aff'];
  for (let c = 0; c < 16; c++) { const a = (c / 16) * Math.PI * 2; for (let k = 0; k < 18; k++) pts.push([0, 0, 0, 0, ...hexRGB(cabCols[c % 6]), 2, a, R, ((k % 6) / 5 - 0.5) * 1.6, -0.6 - Math.floor(k / 6) * 0.55]); }
  for (let k = 0; k < 18; k++) pts.push([0, 0, 0, 0, ...hexRGB('#ffffff'), 1, (k / 18) * Math.PI * 2, 0.8]);
  for (const sx of [-1, 1]) for (const z of [-1.5, 1.5]) for (let k = 0; k < 26; k++) { const f = k / 25; pts.push([sx * f * 9, -f * 17, z, 0, ...hexRGB('#8a9ab8')]); }
  for (const p of pts) if (p[7]) { const a = p[8]; p[0] = Math.cos(a) * p[9] + (p[7] === 2 ? p[10] : 0); p[1] = Math.sin(a) * p[9] + (p[7] === 2 ? p[11] : 0); }
  return fillN(pts);
}
const ferrisAnim = (b, t) => {
  if (!b[7]) return b;
  const a = b[8] + t * 0.22;
  return [Math.cos(a) * b[9] + (b[7] === 2 ? b[10] : 0), Math.sin(a) * b[9] + (b[7] === 2 ? b[11] : 0), b[2]];
};
function earthTargets() {
  const pts = [], M = 1250, R = 13;
  for (let i = 0; i < M; i++) {
    const y = 1 - (i + 0.5) / M * 2, r = Math.sqrt(1 - y * y), lon = i * 2.39996, lat = Math.asin(y);
    const land = Math.sin(lon * 2 + 1.3) * Math.cos(lat * 2) + 0.6 * Math.sin(lon * 3 - 2) * Math.sin(lat * 3 + 1) + 0.4 * Math.cos(lon * 5 + lat * 4);
    let col = land > 0.25 ? (Math.abs(lat) < 0.5 && land > 0.85 ? '#d9b26a' : '#3fbf5a') : '#2a6fe0';
    if (Math.abs(lat) > 1.15) col = '#f2f8ff';
    if (Math.sin(lon * 7 + lat * 9) + Math.sin(lon * 3 - lat * 11) > 1.55) col = '#ffffff';   // a few clouds
    pts.push([Math.cos(lon) * r * R, y * R, Math.sin(lon) * r * R, 0, ...hexRGB(col)]);
  }
  return fillN(pts);
}
function saturnTargets() {
  const pts = [], R = 7;
  for (let i = 0; i < 700; i++) {
    const y = 1 - (i + 0.5) / 700 * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    pts.push([Math.cos(a) * r * R, y * R * 0.92, Math.sin(a) * r * R, 0, ...hexRGB(Math.sin(y * 14) > 0.3 ? '#f2d39a' : '#d9a86a')]);
  }
  const tilt = 0.42;
  for (let i = 0; i < 620; i++) {
    const rr = 10 + Math.random() * 6, a = Math.random() * Math.PI * 2;
    if (rr > 13.2 && rr < 13.7) continue;   // the Cassini division
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    pts.push([x, -z * Math.sin(tilt), z * Math.cos(tilt), 0, ...hexRGB(rr < 13 ? '#fff0c8' : '#e8c890')]);
  }
  return fillN(pts);
}
function butterflyTargets() {
  const pts = [];
  const inWing = (x, y) => ((x - 6) / 7) ** 2 + ((y - 3.5) / 5.5) ** 2 < 1 || ((x - 4.5) / 4.5) ** 2 + ((y + 4) / 3.8) ** 2 < 1;
  while (pts.length < 2300) {
    const x = Math.random() * 14, y = Math.random() * 18 - 8.5;
    if (x < 0.4 || !inWing(x, y)) continue;
    const edge = !inWing(x + 0.9, y) || !inWing(x, y + 0.9) || !inWing(x, y - 0.9);
    const spot = (x - 9) ** 2 + (y - 5) ** 2 < 1.6 || (x - 6) ** 2 + (y + 4.5) ** 2 < 1.2;
    const col = spot ? '#ffffff' : edge ? '#7a3aaa' : y > 0 ? (x > 7 ? '#ff8a3a' : '#ffb04a') : '#c86aff';
    for (const sx of [1, -1]) pts.push([sx * x, y, 0, 0, ...hexRGB(col), 3]);
  }
  for (let k = 0; k < 40; k++) pts.push([0, -6 + k * 0.32, 0, 0, ...hexRGB('#ffe8c8')]);
  for (const sx of [-1, 1]) for (let k = 0; k < 10; k++) pts.push([sx * k * 0.3, 7 + k * 0.4, 0, 0, ...hexRGB('#ffe8c8')]);   // antennae
  return fillN(spread(pts.sort(() => Math.random() - 0.5), 1250));
}
const butterflyAnim = (b, t) => {
  if (b[7] !== 3) return b;
  const f = 0.75 * Math.sin(t * 2.0) ** 2;   // the wings lift and open again
  return [Math.sign(b[0]) * Math.abs(b[0]) * Math.cos(f), b[1], Math.abs(b[0]) * Math.sin(f) + b[2]];
};
function jellyfishTargets() {
  const pts = [];
  for (let i = 0; i < 620; i++) {
    const y = (i + 0.5) / 620, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    pts.push([Math.cos(a) * r * 8, 6 + y * 5.5, Math.sin(a) * r * 8, 0, ...hexRGB(y > 0.6 ? '#ffb8f0' : '#c88aff'), 4]);
  }
  for (let s = 0; s < 12; s++) {
    const a = (s / 12) * Math.PI * 2, cx = Math.cos(a) * (s % 2 ? 6 : 3.5), cz = Math.sin(a) * (s % 2 ? 6 : 3.5);
    for (let k = 0; k < 55; k++) pts.push([cx, 6 - k * 0.32, cz, 0, ...hexRGB(s % 2 ? '#8af0ff' : '#ffd0f8'), 5, s, k * 0.32]);
  }
  return fillN(pts);
}
const jellyAnim = (b, t) => {
  if (b[7] === 4) { const k = 1 + 0.07 * Math.sin(t * 1.4); return [b[0] * k, 6 + (b[1] - 6) / k, b[2] * k]; }
  if (b[7] === 5) { const d = b[9], w = (Math.sin(t * 1.4 - d * 0.35 + b[8]) - Math.sin(-d * 0.35 + b[8])) * 0.12 * d; return [b[0] + w, b[1], b[2] + w * 0.5]; }
  return b;
};
// pictures, drawn and then flown
function drawCottage(c) {
  c.fillStyle = '#3a8a4a'; c.fillRect(0, 335, 600, 65);                                          // the lawn
  c.fillStyle = '#e8eef8'; c.fillRect(170, 190, 260, 150);                                       // the walls
  c.fillStyle = '#e0553a'; c.beginPath(); c.moveTo(150, 195); c.lineTo(300, 90); c.lineTo(450, 195); c.fill();   // the roof
  c.fillStyle = '#b07a5a'; c.fillRect(380, 100, 30, 70);                                         // the chimney
  c.fillStyle = '#ffd36a'; for (const [x, y] of [[195, 215], [345, 215], [195, 275]]) c.fillRect(x, y, 55, 42);   // glowing windows
  c.beginPath(); c.arc(300, 140, 18, 0, Math.PI * 2); c.fill();                                  // the round attic window
  c.fillStyle = '#a06a3a'; c.fillRect(280, 270, 44, 70);                                         // the door
  c.fillStyle = '#e8e8e8'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(398 + k * 16, 80 - k * 18, 10 + k * 3, 0, Math.PI * 2); c.fill(); }   // smoke
  c.fillStyle = '#3aaa5a'; c.beginPath(); c.arc(510, 230, 50, 0, Math.PI * 2); c.fill(); c.fillStyle = '#8a5a3a'; c.fillRect(500, 270, 20, 65);   // a tree
}
const cottageAnim = (b, t) => (b[4] > 0.85 && b[5] > 0.85 && b[6] > 0.85 && b[1] > 9 ? [b[0] + 0.6 * (Math.sin(t * 0.9 + b[1] * 0.4) - Math.sin(b[1] * 0.4)), b[1] + 0.5 * Math.sin(t * 0.6) ** 2, b[2]] : b);
function drawRocket(c) {
  c.fillStyle = '#e8eef8'; c.beginPath(); c.moveTo(300, 30); c.bezierCurveTo(360, 90, 360, 220, 340, 290); c.lineTo(260, 290); c.bezierCurveTo(240, 220, 240, 90, 300, 30); c.fill();
  c.fillStyle = '#ff4a5a'; c.beginPath(); c.moveTo(300, 30); c.bezierCurveTo(330, 55, 342, 80, 345, 100); c.lineTo(255, 100); c.bezierCurveTo(258, 80, 270, 55, 300, 30); c.fill();   // the nose
  c.fillStyle = '#5ab8ff'; c.beginPath(); c.arc(300, 160, 26, 0, Math.PI * 2); c.fill();      // the porthole
  c.fillStyle = '#ff4a5a'; c.beginPath(); c.moveTo(262, 230); c.lineTo(215, 300); c.lineTo(262, 290); c.fill(); c.beginPath(); c.moveTo(338, 230); c.lineTo(385, 300); c.lineTo(338, 290); c.fill();   // fins
  c.fillStyle = '#ffa020'; c.beginPath(); c.moveTo(268, 292); c.quadraticCurveTo(300, 400, 332, 292); c.fill();   // the flame
  c.fillStyle = '#fff07a'; c.beginPath(); c.moveTo(284, 292); c.quadraticCurveTo(300, 360, 316, 292); c.fill();
}
const rocketAnim = (b, t, i) => {
  const flame = b[1] < -4 && b[4] > 0.9 && b[6] < 0.6;
  return [b[0], b[1] + 0.6 * Math.sin(t * 0.8) + (flame ? 0.5 * (Math.sin(t * 13 + i) - Math.sin(i)) : 0), b[2]];
};
function drawLotus(c) {
  c.fillStyle = '#3aaa6a'; c.beginPath(); c.ellipse(170, 330, 120, 26, 0, 0, Math.PI * 2); c.fill(); c.beginPath(); c.ellipse(440, 335, 120, 24, 0, 0, Math.PI * 2); c.fill();   // lily pads
  const petal = (a, len, w, col) => { c.save(); c.translate(300, 300); c.rotate(a); c.fillStyle = col; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(w, -len * 0.55, 0, -len); c.quadraticCurveTo(-w, -len * 0.55, 0, 0); c.fill(); c.restore(); };
  for (const a of [-1.3, -0.85, 0.85, 1.3]) petal(a, 170, 60, '#ff8ac8');
  for (const a of [-0.55, -0.2, 0.2, 0.55]) petal(a, 210, 55, '#ffb8e0');
  petal(0, 240, 50, '#fff0f8');
  c.fillStyle = '#ffd36a'; c.beginPath(); c.ellipse(300, 290, 40, 16, 0, 0, Math.PI * 2); c.fill();
}
const lotusAnim = (b, t) => { const k = 1 + 0.05 * Math.sin(t * 0.7); return [b[0] * k, b[1] * k, b[2]]; };
function drawBalloon(c) {
  const cols = ['#ff4a5a', '#ffb02a', '#ffe14a', '#4ad07a', '#4ab8ff', '#a46aff'];
  c.save(); c.beginPath(); c.moveTo(300, 330); c.bezierCurveTo(140, 230, 150, 30, 300, 30); c.bezierCurveTo(450, 30, 460, 230, 300, 330); c.clip();
  for (let k = 0; k < 12; k++) { c.fillStyle = cols[k % 6]; c.fillRect(150 + k * 26, 0, 26, 400); }
  c.restore();
  c.strokeStyle = '#e8d8b0'; c.lineWidth = 4; c.beginPath(); c.moveTo(270, 318); c.lineTo(282, 360); c.moveTo(330, 318); c.lineTo(318, 360); c.stroke();
  c.fillStyle = '#c08a5a'; c.fillRect(276, 358, 48, 34);
}
const balloonAnim = (b, t) => [b[0] + 1.0 * Math.sin(t * 0.3), b[1] + 1.4 * Math.sin(t * 0.5), b[2]];
function drawWhale(c) {
  c.fillStyle = '#3a8ae0';
  c.beginPath(); c.moveTo(60, 230); c.bezierCurveTo(80, 120, 300, 110, 420, 190); c.bezierCurveTo(460, 210, 480, 220, 500, 200);
  c.lineTo(560, 150); c.lineTo(545, 215); c.lineTo(580, 260); c.lineTo(500, 235); c.bezierCurveTo(440, 270, 200, 300, 60, 230); c.fill();
  c.fillStyle = '#bfe0ff'; c.beginPath(); c.moveTo(70, 240); c.bezierCurveTo(160, 290, 330, 280, 430, 240); c.bezierCurveTo(330, 260, 160, 265, 70, 240); c.fill();   // the pale belly
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(130, 200, 7, 0, Math.PI * 2); c.fill();   // eye
  c.fillStyle = '#bff0ff'; for (let k = 0; k < 6; k++) { c.beginPath(); c.arc(150 + (k % 2 ? 10 : -10), 110 - k * 14, 6 + k, 0, Math.PI * 2); c.fill(); }   // the spout
}
const whaleAnim = (b, t) => (b[0] > 6 ? [b[0], b[1] + 1.4 * Math.sin(t * 1.1) * ((b[0] - 6) / 14), b[2]] : [b[0], b[1] + 0.3 * Math.sin(t * 1.1), b[2]]);
function drawMoon(c) {
  c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(300, 200, 140, 0, Math.PI * 2); c.fill();
  c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(360, 170, 125, 0, Math.PI * 2); c.fill(); c.globalCompositeOperation = 'source-over';
  c.fillStyle = '#ffffff';
  const star = (x, y, r) => { c.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2 - Math.PI / 2, rr = k % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.fill(); };
  star(470, 90, 26); star(520, 230, 18); star(420, 310, 20); star(90, 80, 16); star(540, 340, 12);
}

const SHOW = [
  { kind: 'sphere', hold: 16, cols: ['#6fd3ff', '#a493ff', '#ffffff'], spin: 0.15 },
  { kind: 'heart', hold: 18, cols: ['#ff3b6b', '#ff6f91', '#ffb3c6'], spin: 0.05 },
  { kind: 'text', text: 'You Matter', hold: 14, cols: ['#ffffff', '#ffe6b0', '#ffd27a'] },
  { kind: 'heart', hold: 12, cols: ['#ff3b6b', '#ff8fb4', '#ffffff'] },
  { kind: 'text', text: 'Amazing', hold: 14, cols: ['#7ff0ff', '#b8a9ff', '#ffffff'] },
  { kind: 'spiral', hold: 16, cols: ['#a493ff', '#f29bd0', '#5ed6d0'], spin: 0.08 },
  { kind: 'text', text: 'You are Enough', hold: 16, cols: ['#ffd27a', '#ffffff', '#ffb36b'] },
  { kind: 'gen', make: ferrisTargets, anim: ferrisAnim, hold: 22 },
  { kind: 'picture', draw: drawCottage, anim: cottageAnim, hold: 18 },
  { kind: 'gen', make: earthTargets, hold: 20, spin: 0.12 },
  { kind: 'heart', hold: 10, cols: ['#ff3b6b', '#ff8fb4', '#ffffff'] },
  { kind: 'picture', draw: drawRocket, anim: rocketAnim, hold: 16 },
  { kind: 'picture', draw: drawLotus, anim: lotusAnim, hold: 18 },
  { kind: 'gen', make: butterflyTargets, anim: butterflyAnim, hold: 18 },
  { kind: 'gen', make: saturnTargets, hold: 18, spin: 0.08 },
  { kind: 'picture', draw: drawBalloon, anim: balloonAnim, hold: 16 },
  { kind: 'gen', make: jellyfishTargets, anim: jellyAnim, hold: 18, spin: 0.05 },
  { kind: 'picture', draw: drawWhale, anim: whaleAnim, hold: 18 },
  { kind: 'picture', draw: drawMoon, hold: 16 },
  { kind: 'picture', draw: drawBrand, hold: 16, wide: true },
];

// portraits from photos: each point is a drone's place and colour
let PORTRAITS = null;
fetch('drones/portraits.json').then((r) => r.json()).then((j) => { PORTRAITS = j; }).catch(() => {});
function photoTargets(name, height) {
  const P = PORTRAITS?.[name];
  if (!P) return null;
  const lit = P.points.slice().sort(() => Math.random() - 0.5).slice(0, N).map(([x, y, r, g, b]) => {
    // lift the colours a touch so they glow, and keep the darkest parts faint rather than off
    const k = 1.15;
    return [x * height, y * height - 5, (Math.random() - 0.5) * 0.8, 0, Math.min(1, r * k + 0.02), Math.min(1, g * k + 0.02), Math.min(1, b * k + 0.02)];
  });
  const parked = Array.from({ length: N - lit.length }, (_, i) => [(i / Math.max(1, N - lit.length) - 0.5) * height, -CY + 4 + Math.random() * 2, (Math.random() - 0.5) * 6, 1]);
  return lit.concat(parked);
}

export class DroneShowScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    // night sky over hills, with the lake below
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(vec3(0.03, 0.035, 0.08), vec3(0.004, 0.006, 0.02), smoothstep(0.0, 0.6, h));
          vec2 st = starDot(d, 260.0, 0.994); c += vec3(0.8, 0.85, 1.0) * st.x * smoothstep(0.05, 0.3, h) * 0.5;
          float hills = 0.03 + 0.035 * fbm(vec3(atan(d.z, d.x) * 6.0, 0.0, 1.0));
          c = mix(c, vec3(0.008, 0.01, 0.02), smoothstep(hills + 0.003, hills - 0.003, h) * step(-0.01, h));
          c = mix(c, vec3(0.006, 0.008, 0.018), step(h, -0.01));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.bri = new Float32Array(N).fill(1);
    this.mid = Array.from({ length: N }, () => [0, 0, 0]);
    this.dur = Array.from({ length: N }, () => 3.5 + Math.random() * 1.5);
    const seed = new Float32Array(N).map(() => Math.random());
    this.from = sphereTargets(); this.to = this.from; this.delay = Array.from({ length: N }, () => Math.random() * 1.6);
    this.cFrom = this._cols(SHOW[0].cols); this.cTo = this.cFrom;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aBri', new THREE.BufferAttribute(this.bri, 1));
    const mat = (alpha) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uA: { value: alpha } },
      vertexShader: /* glsl */ `attribute vec3 aCol; attribute float aSeed; attribute float aBri; uniform float uTime, uViewH; varying vec3 vC; varying float vT; ${POINT_SIZE}
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointPx(0.55 * (0.7 + 0.3 * min(aBri, 1.5)), mv);
          vC = aCol; vT = aBri * (0.9 + 0.1 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 40.0));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade, uA; varying vec3 vC; varying float vT;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q);
          float core = exp(-r * 60.0), halo = exp(-r * 10.0) * 0.35;
          gl_FragColor = vec4((vC * (core * 1.3 + halo) + vec3(1.0) * core * 0.4) * vT * uA * uFade, 1.0); }`,
    });
    this.drones = new THREE.Points(g, mat(1));
    this.drones.frustumCulled = false;
    this.group.add(this.drones);
    // their reflection in the lake
    const refl = new THREE.Points(g, mat(0.22));
    refl.scale.y = -1; refl.position.y = -1;
    refl.frustumCulled = false;
    this.group.add(refl);

    this.step = 0; this.t = 0; this.state = 'hold'; this.cur = SHOW[0]; this.spin = 0;
    this.mid = this.from.map((p) => p.slice());
    this._place(99);
  }

  _cols(list) {
    const cs = list.map((h) => new THREE.Color(h));
    return Array.from({ length: N }, (_, i) => cs[(i * 7 + (i >> 3)) % cs.length]);
  }
  _targets(f) {
    if (f.kind === 'heart') return heartTargets();
    if (f.kind === 'text') return textTargets(f.text, f.text.length > 10 ? 62 : 48);
    if (f.kind === 'picture') return f.wide ? pictureTargets(f.draw, 66, 1150, 900, 300) : pictureTargets(f.draw, 46, 1100);
    if (f.kind === 'photo') return photoTargets(f.name, f.name === 'lady' ? 34 : 32) || sphereTargets();
    if (f.kind === 'spiral') return spiralTargets();
    if (f.kind === 'gen') return f.make();
    return sphereTargets();
  }
  // order target points to roughly match where each drone is now, so they glide sideways
  _match(targets) {
    const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => (this.from[a][0] - this.from[b][0]) || (this.from[a][1] - this.from[b][1]));
    const tg = targets.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = new Array(N);
    idx.forEach((d, k) => { out[d] = tg[k]; });
    return out;
  }
  // k: seconds since the transition began (or 99 when holding)
  _place(k) {
    const cs = Math.cos(this.spin), sn = Math.sin(this.spin);
    const nav = 0.12;
    for (let i = 0; i < N; i++) {
      const a = this.from[i], m = this.mid[i];
      let b = this.to[i];
      if (k === 99 && this.cur.anim && !b[3]) b = this.cur.anim(b, this.animT || 0, i);
      const local = (k - this.delay[i]) / this.dur[i];
      const e0 = Math.min(1, Math.max(0, local));
      const e = e0 * e0 * (3 - 2 * e0);
      // a smooth curved flight: out through the loose cloud and in to the new place
      const u1 = 1 - e;
      let x = u1 * u1 * a[0] + 2 * u1 * e * m[0] + e * e * b[0];
      let y = u1 * u1 * a[1] + 2 * u1 * e * m[1] + e * e * b[1];
      let z = u1 * u1 * a[2] + 2 * u1 * e * m[2] + e * e * b[2];
      const xr = x * cs + z * sn, zr = -x * sn + z * cs;
      this.pos[i * 3] = xr; this.pos[i * 3 + 1] = CY + y; this.pos[i * 3 + 2] = CZ + zr;
      // lights: dim to a soft navigation light on leaving, flare on arriving, then settle
      const after = (local - 1) * this.dur[i];             // seconds since this drone arrived
      let br, cc;
      if (local <= 0) { br = a[3] ? 0 : 1; cc = this.cFrom[i]; }
      else if (local < 1) { br = a[3] ? 0 : Math.max(nav, 1 - local * 6); cc = local < 0.2 ? this.cFrom[i] : null; }
      else { br = after < 0.15 ? (a[3] ? 0 : nav) + (1.7 - (a[3] ? 0 : nav)) * after / 0.15 : 1 + 0.7 * Math.exp(-(after - 0.15) * 5); cc = this.cTo[i]; if (b[3]) br = a[3] ? 0 : Math.max(0, nav * (1 - after)); }
      if (local > 0 && local < 1 && local >= 0.2) { this.col[i * 3] = 0.9; this.col[i * 3 + 1] = 0.93; this.col[i * 3 + 2] = 1.0; }
      else { const c = cc || this.cTo[i]; this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; }
      this.bri[i] = br;
    }
    const at = this.drones.geometry.attributes;
    at.position.needsUpdate = true; at.aCol.needsUpdate = true; at.aBri.needsUpdate = true;
  }
  update(dt) {
    this.t += dt;
    const f = this.cur;
    if (f.spin) this.spin += dt * f.spin; else this.spin = damp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 1.2, dt);
    if (this.state === 'hold' && this.t > f.hold) {
      // on to the next formation
      this.from = Array.from({ length: N }, (_, i) => [this.pos[i * 3] / 1, this.pos[i * 3 + 1] - CY, this.pos[i * 3 + 2] - CZ, this.to[i] && this.to[i][3] ? 1 : 0]);
      this.spin = 0;
      this.step = (this.step + 1) % SHOW.length;
      this.cur = SHOW[this.step];
      this.cFrom = this.cTo === this.cFrom ? this.cFrom : this.cTo;
      this.cFrom = Array.from({ length: N }, (_, i) => new THREE.Color(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]));
      this.to = this._match(this._targets(this.cur));
      this.cTo = this.cur.cols ? this._cols(this.cur.cols) : this.to.map((p) => (p.length > 4 ? new THREE.Color(p[4], p[5], p[6]) : new THREE.Color(1, 1, 1)));
      const lift = 4 + Math.random() * 4;
      for (let i = 0; i < N; i++) {
        const a = this.from[i], b = this.to[i];
        this.mid[i] = [(a[0] + b[0]) / 2 + (Math.random() - 0.5) * 2, (a[1] + b[1]) / 2 + lift + (a[0] + b[0]) * 0.02, (a[2] + b[2]) / 2 + 4 + (Math.random() - 0.5) * 2];
        this.delay[i] = (a[0] + 30) / 60 * 1.6 + Math.random() * 0.2;
        this.dur[i] = 3.5 + Math.random() * 1.8;
      }
      this.state = 'move'; this.t = 0;
      if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 5, gain: 0.25 });
    }
    if (this.state === 'hold') this.animT = (this.animT || 0) + dt;
    if (this.state === 'move') {
      this.animT = 0;
      this._place(this.t);
      if (this.t > 8.5) { this.state = 'hold'; this.t = 0; if (this.fade > 0.5) SFX.play('chime', { note: [0, 4, 7, 12][this.step % 4], pan: 0, gain: 0.3 }); }
    } else this._place(99);
  }
}
