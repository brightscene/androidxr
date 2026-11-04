import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Space synth
// An analog-style synthesizer floating in space, for making ambient sound.
// Two oscillators (sine, triangle, saw, square) with detune and octave, a
// resonant filter (low / band / high pass), attack and release, an LFO that
// sweeps the filter, echo, a deep "space" reverb and a breath of cosmic noise.
// A two-octave keyboard in the preset's scale; Chord mode plays chords built
// from the scale; the Arpeggiator runs through what you hold (up, down,
// up-down, random) at its own rate; Hold latches notes so drones can build.
// A hundred presets, in six families: pads, drones, bells, plucks, winds and
// choirs. The nebula behind glows with what you play.
//
// Turn a dial: pinch (or click) on it and drag up or down. Tap the keys and
// buttons with a fingertip, or point and pinch.

const WAVES = ['sine', 'triangle', 'sawtooth', 'square'];
const WAVE_NAMES = { sine: 'Sine', triangle: 'Tri', sawtooth: 'Saw', square: 'Square' };
const FILTERS = ['lowpass', 'bandpass', 'highpass'];
const FILTER_NAMES = { lowpass: 'Low pass', bandpass: 'Band pass', highpass: 'High pass' };
const ARPS = ['off', 'up', 'down', 'updown', 'random'];
const ARP_NAMES = { off: 'Off', up: 'Up', down: 'Down', updown: 'Up-down', random: 'Random' };
const CHORDS = ['off', 'triad', 'seventh', 'sus', 'add9', 'open', 'fourths'];
const CHORD_NAMES = { off: 'Off', triad: 'Triad', seventh: '7th', sus: 'Sus', add9: 'Add 9', open: 'Open 5ths', fourths: '4ths' };
const SCALES = {
  'Minor pent': [0, 3, 5, 7, 10], 'Major pent': [0, 2, 4, 7, 9], Lydian: [0, 2, 4, 6, 7, 9, 11], Dorian: [0, 2, 3, 5, 7, 9, 10],
  Aeolian: [0, 2, 3, 5, 7, 8, 10], Mixolydian: [0, 2, 4, 5, 7, 9, 10], Hirajoshi: [0, 2, 3, 7, 8], 'Whole tone': [0, 2, 4, 6, 8, 10],
};
const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

// ---- the hundred presets: six families, each with its own character, varied by a seeded hand
const FAMILIES = [
  { kind: 'Pad', w: [2, 1], det: [4, 18], cut: [500, 2400], res: [0.5, 4], atk: [0.8, 3], rel: [2.5, 6], lfoR: [0.05, 0.3], lfoD: [0.1, 0.5], echo: [0.15, 0.45], space: [0.5, 0.9], noise: [0, 0.15], oct: [0, 1] },
  { kind: 'Drone', w: [2, 3], det: [2, 9], cut: [250, 900], res: [1, 8], atk: [2, 5], rel: [4, 9], lfoR: [0.02, 0.12], lfoD: [0.2, 0.7], echo: [0.1, 0.3], space: [0.6, 1], noise: [0.05, 0.3], oct: [-1, 0] },
  { kind: 'Bell', w: [0, 0], det: [0, 7], cut: [1500, 6000], res: [0.5, 3], atk: [0.003, 0.02], rel: [2, 5], lfoR: [0.1, 0.6], lfoD: [0, 0.2], echo: [0.3, 0.6], space: [0.5, 0.9], noise: [0, 0.05], oct: [1, 1] },
  { kind: 'Pluck', w: [2, 3], det: [3, 12], cut: [700, 3000], res: [2, 9], atk: [0.003, 0.02], rel: [0.6, 1.8], lfoR: [0.1, 0.5], lfoD: [0, 0.3], echo: [0.35, 0.65], space: [0.4, 0.8], noise: [0, 0.05], oct: [0, 1] },
  { kind: 'Wind', w: [1, 0], det: [8, 25], cut: [300, 1500], res: [4, 14], atk: [1.5, 4], rel: [3, 7], lfoR: [0.03, 0.2], lfoD: [0.4, 0.9], echo: [0.1, 0.35], space: [0.7, 1], noise: [0.35, 0.8], oct: [0, 0] },
  { kind: 'Choir', w: [2, 1], det: [6, 16], cut: [600, 1800], res: [3, 10], atk: [0.6, 2], rel: [2, 5], lfoR: [0.15, 0.6], lfoD: [0.1, 0.35], echo: [0.15, 0.4], space: [0.6, 0.95], noise: [0.02, 0.12], oct: [0, 1], ftype: 1 },
];
const ADJ = ['Nebula', 'Pulsar', 'Quasar', 'Solar', 'Lunar', 'Orbital', 'Stellar', 'Galactic', 'Cosmic', 'Astral', 'Ion', 'Photon', 'Aurora', 'Comet', 'Zenith', 'Eclipse', 'Gravity', 'Horizon', 'Halo', 'Nova', 'Polar', 'Celestial', 'Deep Field', 'Kuiper', 'Saturn'];
const NOUN = { Pad: ['Bloom', 'Veil', 'Haze', 'Drift', 'Glow', 'Tide', 'Silk', 'Dawn', 'Sails', 'Mist'], Drone: ['Hum', 'Engine', 'Abyss', 'Core', 'Monolith', 'Undertow', 'Furnace', 'Well', 'Deep', 'Pulse'], Bell: ['Chimes', 'Bells', 'Glass', 'Crystals', 'Beacons', 'Lanterns', 'Tines', 'Ice', 'Stars', 'Signals'], Pluck: ['Rain', 'Sparks', 'Dust', 'Shards', 'Ripples', 'Pebbles', 'Droplets', 'Fireflies', 'Ticks', 'Seeds'], Wind: ['Wind', 'Storm', 'Breath', 'Whisper', 'Gale', 'Static', 'Solar Wind', 'Dust Storm', 'Ether', 'Vapour'], Choir: ['Choir', 'Voices', 'Hymn', 'Chant', 'Sirens', 'Angels', 'Chorus', 'Psalm', 'Song', 'Call'] };
function rng(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
export const PRESETS = (() => {
  const out = [], used = new Set();
  const scaleNames = Object.keys(SCALES);
  for (let i = 0; i < 100; i++) {
    const F = FAMILIES[i % FAMILIES.length], r = rng(i + 7);
    const L = (k) => F[k][0] + (F[k][1] - F[k][0]) * r();
    let name;
    do { name = `${ADJ[Math.floor(r() * ADJ.length)]} ${NOUN[F.kind][Math.floor(r() * 10)]}`; } while (used.has(name));
    used.add(name);
    out.push({
      name, kind: F.kind,
      w1: WAVES[F.w[0]], w2: WAVES[(F.w[1] + (r() < 0.3 ? 1 : 0)) % 4], det: L('det'), oct: Math.round(L('oct')),
      cut: L('cut'), res: L('res'), ftype: F.ftype ? FILTERS[1] : r() < 0.85 ? FILTERS[0] : FILTERS[1],
      atk: L('atk'), rel: L('rel'), lfoR: L('lfoR'), lfoD: L('lfoD'), echo: L('echo'), space: L('space'), noise: L('noise'),
      scale: scaleNames[Math.floor(r() * scaleNames.length)], root: [48, 50, 51, 53, 55, 45, 46][Math.floor(r() * 7)] + (F.kind === 'Drone' ? -12 : 0),
      chord: F.kind === 'Pad' || F.kind === 'Choir' ? (r() < 0.5 ? 'add9' : 'triad') : F.kind === 'Drone' ? 'open' : 'off',
      arp: F.kind === 'Pluck' || F.kind === 'Bell' ? ARPS[1 + Math.floor(r() * 4)] : 'off', arpRate: 3 + r() * 6,
    });
  }
  return out;
})();

// the dials: [key, label, min, max, curve ('log' for frequencies and times)]
const DIALS = [
  ['det', 'Detune', 0, 40], ['cut', 'Cutoff', 80, 9000, 'log'], ['res', 'Resonance', 0.3, 18], ['atk', 'Attack', 0.003, 6, 'log'], ['rel', 'Release', 0.1, 10, 'log'], ['lfoR', 'LFO rate', 0.02, 8, 'log'],
  ['lfoD', 'LFO depth', 0, 1], ['echo', 'Echo', 0, 0.85], ['space', 'Space', 0, 1], ['noise', 'Cosmos', 0, 1], ['arpRate', 'Arp rate', 1, 16, 'log'], ['vol', 'Volume', 0, 1],
];
const CW = 2048, CH = 1100;                // the panel's canvas
const PW = 1.1, PH = PW * CH / CW;         // the panel in metres
const KEYS = 14;

export class SynthScene extends BaseScene {
  constructor() {
    super();
    this.wantsPointer = true;
    this.wantsHands = true;
    this.viewPitch = -0.6;   // on a screen, the whole panel sits clear of the session bar
    const U = this.uniforms;
    this.su = { ...U, uLevel: { value: 0 } };

    // space: a nebula that glows with the sound, stars, a slow aurora band
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.su,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uLevel; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.01, 0.0)), m = fbm(d * 4.0 + n * 1.5 + 3.0);
          vec3 c = mix(vec3(0.005, 0.006, 0.02), vec3(0.06, 0.03, 0.12), n);
          c += vec3(0.5, 0.2, 0.8) * smoothstep(0.55, 0.85, m) * (0.25 + uLevel * 1.2);
          c += vec3(0.1, 0.6, 0.8) * smoothstep(0.6, 0.9, fbm(d * 3.0 + 9.0)) * (0.15 + uLevel * 0.9);
          vec3 p = d * 210.0, cell = floor(p);
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          if (h > 0.985) c += vec3(0.9) * smoothstep(0.3, 0.0, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 60.0));
          float az = atan(d.x, -d.z);
          c += mix(vec3(0.1, 0.9, 0.5), vec3(0.6, 0.3, 1.0), smoothstep(0.1, 0.4, d.y)) * smoothstep(0.5, 0.8, fbm(vec3(az * 2.0, d.y * 3.0, uTime * 0.03))) * smoothstep(0.05, 0.25, d.y) * smoothstep(0.7, 0.3, d.y) * (0.12 + uLevel * 0.6);
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));
    this.group.add(particles(U, { count: 500, min: [-6, -2, -8], max: [6, 4, 4], vel: [0, 0.02, 0], sway: 0.3, size: [0.006, 0.016], colors: ['#c8b8ff', '#9affe8', '#ffd8f0'], alpha: 0.45 }));

    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;

    // the panel: drawn into one canvas, redrawn when anything changes
    this.cv = document.createElement('canvas'); this.cv.width = CW; this.cv.height = CH;
    this.tex = new THREE.CanvasTexture(this.cv); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 8;
    this.panel = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    this.panel.position.set(0, -0.33, -0.55);
    this.panel.rotation.x = -0.75;
    this.rig.add(this.panel);
    // a soft glow round the panel
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(PW * 1.25, PH * 1.4), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.su,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uFade, uLevel; varying vec2 vUv; void main(){ vec2 q = (vUv - 0.5) * 2.0; float r = max(abs(q.x), abs(q.y)); gl_FragColor = vec4(vec3(0.35, 0.25, 0.8) * smoothstep(1.0, 0.75, r) * smoothstep(0.6, 0.8, r) * (0.25 + uLevel) * uFade, 1.0); }',
    }));
    glow.position.z = -0.005;
    this.panel.add(glow);
    // the oscilloscope: its own little canvas, updated every frame
    this.sc = document.createElement('canvas'); this.sc.width = 512; this.sc.height = 160;
    this.stex = new THREE.CanvasTexture(this.sc); this.stex.colorSpace = THREE.SRGBColorSpace;
    const scope = new THREE.Mesh(new THREE.PlaneGeometry(PW * 0.22, PW * 0.22 * 160 / 512), new THREE.MeshBasicMaterial({ map: this.stex, transparent: true }));
    scope.position.set(PW * 0.355, PH * 0.37, 0.002);
    this.panel.add(scope);

    this.p = { ...PRESETS[0], vol: 0.7, hold: false };
    this.presetI = 0;
    try { const i = +localStorage.getItem('mindlyte-synth-preset'); if (i >= 0 && i < 100) { this.presetI = i; this.p = { ...PRESETS[i], vol: 0.7, hold: false }; } } catch (_) {}
    this.voices = [];
    this.held = new Map();      // key index -> pointer ids holding it
    this.latched = new Set();   // keys latched by Hold
    this.drag = new Map();      // pointer id -> { dial, v0, y0 }
    this.touching = new Map();  // fingertip id -> key index it's on
    this.arp = { i: 0, t: 0, dir: 1 };
    this._layout();
    this.dirty = true;
  }

  // ---- layout, in canvas pixels
  _layout() {
    const L = (this.L = { buttons: [], dials: [], keys: [] });
    const btn = (id, x, y, w, h, label, val) => L.buttons.push({ id, x, y, w, h, label, val });
    // top row: presets, oscillators, filter type, arp, chord, hold
    btn('prev', 60, 70, 70, 80, '‹'); btn('next', 520, 70, 70, 80, '›');
    btn('w1', 640, 70, 150, 80, 'Osc 1', () => WAVE_NAMES[this.p.w1]);
    btn('w2', 805, 70, 150, 80, 'Osc 2', () => WAVE_NAMES[this.p.w2]);
    btn('oct', 970, 70, 110, 80, 'Oct 2', () => (this.p.oct > 0 ? '+' : '') + this.p.oct);
    btn('ftype', 1095, 70, 170, 80, 'Filter', () => FILTER_NAMES[this.p.ftype]);
    btn('scale', 60, 200, 260, 70, 'Scale', () => this.p.scale);
    btn('root', 335, 200, 120, 70, 'Key', () => NOTE_NAMES[this.p.root % 12]);
    btn('arp', 470, 200, 200, 70, 'Arp', () => ARP_NAMES[this.p.arp]);
    btn('chord', 685, 200, 200, 70, 'Chord', () => CHORD_NAMES[this.p.chord]);
    btn('hold', 900, 200, 140, 70, 'Hold', () => (this.p.hold ? 'On' : 'Off'));
    btn('panic', 1055, 200, 210, 70, 'All notes off', () => '');
    // dials: two rows of six
    DIALS.forEach(([k, label], i) => L.dials.push({ k, label, x: 160 + (i % 6) * 300, y: 420 + Math.floor(i / 6) * 250, r: 72 }));
    // the keyboard
    const kw = (CW - 120) / KEYS;
    for (let i = 0; i < KEYS; i++) L.keys.push({ i, x: 60 + i * kw, y: 900, w: kw - 10, h: 170 });
  }

  // a key's note: its scale degree, two octaves up from the root
  _note(i) {
    const sc = SCALES[this.p.scale] || SCALES['Minor pent'];
    return this.p.root + Math.floor(i / sc.length) * 12 + sc[i % sc.length];
  }
  _chord(i) {
    const c = this.p.chord;
    if (c === 'off') return [this._note(i)];
    const steps = { triad: [0, 2, 4], seventh: [0, 2, 4, 6], sus: [0, 3, 4], add9: [0, 2, 4, 8], open: [0, 4, 7], fourths: [0, 3, 6] }[c];
    if (c === 'open') return [this._note(i), this._note(i) + 7, this._note(i) + 12];
    return steps.map((s) => this._note(i + s));
  }

  // ---- drawing
  _draw() {
    const c = this.cv.getContext('2d'), p = this.p, L = this.L;
    c.clearRect(0, 0, CW, CH);
    c.beginPath(); c.roundRect(8, 8, CW - 16, CH - 16, 60);
    const g = c.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, 'rgba(22,16,48,0.95)'); g.addColorStop(1, 'rgba(8,8,24,0.95)');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(170,150,255,0.55)'; c.lineWidth = 5; c.stroke();
    const font = (w, s) => `${w} ${s}px Jost, Inter, system-ui, sans-serif`;
    // preset name
    c.fillStyle = '#f2eeff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = font(500, 44); c.fillText(p.name, 325, 98);
    c.font = font(400, 26); c.fillStyle = 'rgba(220,210,255,0.6)'; c.fillText(`${this.presetI + 1} / 100 · ${p.kind}`, 325, 140);
    for (const b of L.buttons) {
      const on = (b.id === 'hold' && p.hold) || (b.id === 'arp' && p.arp !== 'off') || (b.id === 'chord' && p.chord !== 'off');
      c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, 20);
      c.fillStyle = on ? 'rgba(255,214,140,0.9)' : b.hot ? 'rgba(90,80,150,0.9)' : 'rgba(40,34,80,0.85)'; c.fill();
      c.strokeStyle = 'rgba(200,190,255,0.5)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = on ? '#1a1206' : '#f2eeff';
      if (b.val) {
        c.font = font(400, 20); c.globalAlpha = 0.7; c.fillText(b.label, b.x + b.w / 2, b.y + 20); c.globalAlpha = 1;
        c.font = font(500, 30); c.fillText(b.val(), b.x + b.w / 2, b.y + b.h - 26);
      } else { c.font = font(500, b.id === 'panic' ? 26 : 56); c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 2); }
    }
    // dials
    for (const d of L.dials) {
      const [, , lo, hi, curve] = DIALS.find((x) => x[0] === d.k);
      const v = p[d.k], f = curve === 'log' ? Math.log(v / lo) / Math.log(hi / lo) : (v - lo) / (hi - lo);
      const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * Math.max(0, Math.min(1, f));
      c.lineCap = 'round';
      c.beginPath(); c.arc(d.x, d.y, d.r, a0, a0 + Math.PI * 1.5); c.strokeStyle = 'rgba(120,110,190,0.4)'; c.lineWidth = 12; c.stroke();
      const gg = c.createLinearGradient(d.x - d.r, 0, d.x + d.r, 0); gg.addColorStop(0, '#5ad8ff'); gg.addColorStop(1, '#d78cff');
      c.beginPath(); c.arc(d.x, d.y, d.r, a0, a1); c.strokeStyle = gg; c.lineWidth = 12; c.stroke();
      c.beginPath(); c.arc(d.x, d.y, d.r - 22, 0, Math.PI * 2); c.fillStyle = d.hot ? 'rgba(80,70,140,1)' : 'rgba(30,26,60,1)'; c.fill();
      c.beginPath(); c.moveTo(d.x + Math.cos(a1) * (d.r - 46), d.y + Math.sin(a1) * (d.r - 46)); c.lineTo(d.x + Math.cos(a1) * (d.r - 26), d.y + Math.sin(a1) * (d.r - 26)); c.strokeStyle = '#fff'; c.lineWidth = 8; c.stroke();
      c.fillStyle = '#f2eeff'; c.font = font(500, 28); c.fillText(d.label, d.x, d.y + d.r + 34);
      c.font = font(400, 22); c.globalAlpha = 0.65;
      const txt = d.k === 'cut' ? `${Math.round(v)} Hz` : d.k === 'atk' || d.k === 'rel' ? `${v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(1) + ' s'}` : d.k === 'lfoR' ? `${v.toFixed(2)} Hz` : d.k === 'arpRate' ? `${v.toFixed(1)} /s` : d.k === 'det' ? `${Math.round(v)} c` : d.k === 'res' ? v.toFixed(1) : `${Math.round(v * 100)}%`;
      c.fillText(txt, d.x, d.y + 2); c.globalAlpha = 1;
    }
    // keys
    for (const k of L.keys) {
      const lit = this.held.has(k.i) || this.latched.has(k.i) || this.arpLit === k.i;
      c.beginPath(); c.roundRect(k.x, k.y, k.w, k.h, 18);
      const hue = 200 + (k.i / KEYS) * 120;
      c.fillStyle = lit ? `hsla(${hue},90%,70%,0.95)` : `hsla(${hue},55%,30%,0.85)`; c.fill();
      c.strokeStyle = `hsla(${hue},80%,75%,0.7)`; c.lineWidth = 3; c.stroke();
      const n = this._note(k.i);
      c.fillStyle = lit ? '#120a20' : '#f2eeff'; c.font = font(500, 28); c.fillText(NOTE_NAMES[n % 12], k.x + k.w / 2, k.y + k.h - 32);
    }
    this.tex.needsUpdate = true;
    this.dirty = false;
  }

  _scope() {
    const c = this.sc.getContext('2d');
    c.clearRect(0, 0, 512, 160);
    c.beginPath(); c.roundRect(2, 2, 508, 156, 18); c.fillStyle = 'rgba(4,10,20,0.9)'; c.fill(); c.strokeStyle = 'rgba(90,216,255,0.5)'; c.lineWidth = 3; c.stroke();
    const an = this.S?.an;
    if (an) {
      if (!this.td || this.td.length !== an.fftSize) this.td = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(this.td);
      let start = 0;
      for (let i = 1; i < this.td.length / 2; i++) if (this.td[i - 1] < 0 && this.td[i] >= 0) { start = i; break; }   // steady trace
      c.beginPath();
      for (let x = 0; x < 500; x++) { const v = this.td[start + x] || 0; const y = 80 - v * 220; x ? c.lineTo(6 + x, y) : c.moveTo(6, y); }
      c.strokeStyle = '#7affe0'; c.lineWidth = 3; c.shadowColor = '#7affe0'; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0;
    }
    this.stex.needsUpdate = true;
  }

  // ---- sound
  _audio() {
    if (this.S) return this.S;
    if (this.muted) return null;
    const A = SFX.audio();
    if (!A) return null;
    const { ctx } = A;
    const bus = ctx.createGain(); bus.gain.value = 1;
    const out = ctx.createGain(); out.gain.value = 0;
    bus.connect(out); out.connect(A.out);
    // echo: a filtered delay line feeding back on itself
    const dl = ctx.createDelay(2); dl.delayTime.value = 0.42;
    const fb = ctx.createGain(); fb.gain.value = 0.4;
    const dlf = ctx.createBiquadFilter(); dlf.type = 'lowpass'; dlf.frequency.value = 2600;
    const dsend = ctx.createGain(); dsend.gain.value = 0;
    bus.connect(dsend).connect(dl).connect(dlf).connect(fb).connect(dl);
    dlf.connect(out);
    // space: the app's big reverb
    const rsend = ctx.createGain(); rsend.gain.value = 0;
    out.connect(rsend).connect(A.reverb);
    // the LFO, shared by every voice's filter
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.2;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0;
    lfo.connect(lfoG); lfo.start();
    // cosmic noise: band-passed, swept by the LFO
    const nsrc = ctx.createBufferSource(); nsrc.buffer = A.noise; nsrc.loop = true;
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 700; nbp.Q.value = 3;
    const ng = ctx.createGain(); ng.gain.value = 0;
    lfoG.connect(nbp.frequency);
    if (A.noise) { nsrc.connect(nbp).connect(ng).connect(bus); nsrc.start(); }
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    out.connect(an);
    this.S = { ctx, bus, out, dl, fb, dsend, rsend, lfo, lfoG, nsrc, ng, an, A };
    return this.S;
  }

  _noteOn(midi, short) {
    const S = this._audio();
    if (!S) return null;
    const { ctx } = S, p = this.p, now = ctx.currentTime;
    const f = 440 * 2 ** ((midi - 69) / 12);
    const env = ctx.createGain(); env.gain.value = 0;
    const filt = ctx.createBiquadFilter(); filt.type = p.ftype; filt.frequency.value = Math.min(16000, p.cut * (1 + (f / 440) * 0.25)); filt.Q.value = p.res;
    S.lfoG.connect(filt.frequency);
    const o1 = ctx.createOscillator(); o1.type = p.w1; o1.frequency.value = f; o1.detune.value = -p.det / 2;
    const o2 = ctx.createOscillator(); o2.type = p.w2; o2.frequency.value = f * 2 ** p.oct; o2.detune.value = p.det / 2;
    const g1 = ctx.createGain(), g2 = ctx.createGain();
    const loud = (w) => (w === 'sawtooth' || w === 'square' ? 0.5 : 1);
    g1.gain.value = 0.5 * loud(p.w1); g2.gain.value = 0.38 * loud(p.w2);
    o1.connect(g1).connect(filt); o2.connect(g2).connect(filt);
    filt.connect(env).connect(S.bus);
    o1.start(now); o2.start(now);
    const peak = 0.16 / Math.sqrt(1 + this.voices.length * 0.25);
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peak, now + p.atk);
    const v = { midi, env, filt, o: [o1, o2], peak };
    if (short) { this._release(v, now + Math.max(p.atk, 0.05) + 0.08); }
    else this.voices.push(v);
    // voice stealing beyond 16
    while (this.voices.length > 16) this._release(this.voices.shift(), now);
    return v;
  }
  _release(v, at) {
    const S = this.S;
    if (!S || !v || v.gone) return;
    v.gone = true;
    const t = Math.max(at ?? S.ctx.currentTime, S.ctx.currentTime);
    v.env.gain.cancelScheduledValues(t);
    v.env.gain.setValueAtTime(v.env.gain.value || v.peak, t);
    v.env.gain.setTargetAtTime(0, t, this.p.rel / 4);
    const end = t + this.p.rel * 1.3 + 0.2;
    for (const o of v.o) try { o.stop(end); } catch (_) {}
    setTimeout(() => { try { v.env.disconnect(); v.filt.disconnect(); } catch (_) {} }, (end - S.ctx.currentTime) * 1000 + 300);
  }
  _keyDown(i) {
    if (this.p.arp !== 'off') return;   // the arpeggiator plays held keys itself
    const vs = this._chord(i).map((m) => this._noteOn(m)).filter(Boolean);
    (this.keyVoices ||= new Map()).set(i, vs);
  }
  _keyUp(i) {
    const vs = this.keyVoices?.get(i);
    if (!vs) return;
    for (const v of vs) { this._release(v); const k = this.voices.indexOf(v); if (k >= 0) this.voices.splice(k, 1); }
    this.keyVoices.delete(i);
  }
  _allOff() {
    for (const v of this.voices) this._release(v);
    this.voices = []; this.keyVoices?.clear(); this.latched.clear(); this.held.clear();
    this.dirty = true;
  }

  // ---- presets and controls
  _preset(i) {
    this._allOff();
    this.presetI = (i + 100) % 100;
    this.p = { ...PRESETS[this.presetI], vol: this.p.vol, hold: this.p.hold };
    try { localStorage.setItem('mindlyte-synth-preset', this.presetI); } catch (_) {}
    this.dirty = true;
  }
  _button(id) {
    const p = this.p, cyc = (arr, v) => arr[(arr.indexOf(v) + 1) % arr.length];
    if (id === 'prev') return this._preset(this.presetI - 1);
    if (id === 'next') return this._preset(this.presetI + 1);
    if (id === 'w1') p.w1 = cyc(WAVES, p.w1);
    if (id === 'w2') p.w2 = cyc(WAVES, p.w2);
    if (id === 'oct') p.oct = p.oct >= 1 ? -1 : p.oct + 1;
    if (id === 'ftype') p.ftype = cyc(FILTERS, p.ftype);
    if (id === 'scale') { this._allOff(); p.scale = cyc(Object.keys(SCALES), p.scale); }
    if (id === 'root') { this._allOff(); p.root = p.root + 1 > 57 ? 45 : p.root + 1; }
    if (id === 'arp') { this._allOff(); p.arp = cyc(ARPS, p.arp); }
    if (id === 'chord') { this._allOff(); p.chord = cyc(CHORDS, p.chord); }
    if (id === 'hold') { p.hold = !p.hold; if (!p.hold) { for (const i of this.latched) this._keyUp(i); this.latched.clear(); } }
    if (id === 'panic') this._allOff();
    this.dirty = true;
  }

  _place() {
    const h = INPUT.head;
    if (!h) return false;
    const f = new THREE.Vector3(h.fwd.x, 0, h.fwd.z);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    this.rig.position.copy(h.pos);
    this.rig.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    return true;
  }

  // where a pointer meets the panel, in canvas pixels (and how far a fingertip is from it)
  _hit(p) {
    const inv = new THREE.Matrix4().copy(this.panel.matrixWorld).invert();
    let q, dist = 0;
    if (p.tip && INPUT.xr) { q = p.tip.clone().applyMatrix4(inv); dist = q.z; }
    else {
      const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
      if (Math.abs(d.z) < 1e-4) return null;
      const k = -o.z / d.z;
      if (k <= 0) return null;
      q = o.addScaledVector(d, k);
    }
    const x = (q.x / PW + 0.5) * CW, y = (0.5 - q.y / PH) * CH;
    if (x < 0 || x > CW || y < 0 || y > CH) return null;
    return { x, y, dist };
  }
  _at(h) {
    const L = this.L;
    for (const k of L.keys) if (h.x > k.x && h.x < k.x + k.w && h.y > k.y && h.y < k.y + k.h) return { key: k };
    for (const b of L.buttons) if (h.x > b.x && h.x < b.x + b.w && h.y > b.y && h.y < b.y + b.h) return { button: b };
    for (const d of L.dials) if (Math.hypot(h.x - d.x, h.y - d.y) < d.r + 20) return { dial: d };
    return null;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    const over = (this.hideRays ||= new Set());
    over.clear();
    for (const b of this.L.buttons) b.hotNow = false;
    for (const d of this.L.dials) d.hotNow = false;
    const down = new Set();

    for (const p of pointers) {
      const h = this._hit(p);
      const touchMode = p.tip && INPUT.xr;
      if (h && (!touchMode || Math.abs(h.dist) < 0.08)) over.add(p.id);
      // dragging a dial
      const dg = this.drag.get(p.id);
      const holding = INPUT.held.has(p.id) || p.held;
      if (dg) {
        if (!holding || !h) { this.drag.delete(p.id); continue; }
        const [, , lo, hi, curve] = DIALS.find((x) => x[0] === dg.d.k);
        const f0 = curve === 'log' ? Math.log(dg.v0 / lo) / Math.log(hi / lo) : (dg.v0 - lo) / (hi - lo);
        const f = Math.max(0, Math.min(1, f0 + (dg.y0 - h.y) / 500));
        this.p[dg.d.k] = curve === 'log' ? lo * (hi / lo) ** f : lo + (hi - lo) * f;
        dg.d.hotNow = true;
        this.dirty = true;
        continue;
      }
      if (!h) { this.touching.delete(p.id); this.ptrKey?.delete(p.id); continue; }
      const what = this._at(h);
      if (what?.dial) what.dial.hotNow = true;
      if (what?.button) what.button.hotNow = true;
      const pressed = INPUT.presses.includes(p.id) || p.press;
      if (touchMode) {
        // a fingertip touching the panel: keys sound while touched, buttons on touch
        const touchingNow = h.dist < 0.015 && h.dist > -0.04;
        const was = this.touching.get(p.id);
        if (touchingNow && what?.key) {
          down.add(what.key.i);
          if (was !== what.key.i) this.touching.set(p.id, what.key.i);
        } else if (touchingNow && what?.button && was !== 'b' + what.button.id) { this.touching.set(p.id, 'b' + what.button.id); this._button(what.button.id); }
        else if (!touchingNow) this.touching.delete(p.id);
        if (what?.dial && holding && !this.drag.has(p.id) && pressed) this.drag.set(p.id, { d: what.dial, v0: this.p[what.dial.k], y0: h.y });
        continue;
      }
      if (pressed && what?.button) this._button(what.button.id);
      if (pressed && what?.dial) this.drag.set(p.id, { d: what.dial, v0: this.p[what.dial.k], y0: h.y });
      if (what?.key && (pressed || (holding && this.ptrKey?.get(p.id) !== undefined))) {
        if (pressed && this.p.hold) { if (this.latched.has(what.key.i)) { this.latched.delete(what.key.i); this._keyUp(what.key.i); } else { this.latched.add(what.key.i); this._keyDown(what.key.i); } this.dirty = true; }
        else if (!this.p.hold && holding) { down.add(what.key.i); (this.ptrKey ||= new Map()).set(p.id, what.key.i); }
      }
      if (!holding) this.ptrKey?.delete(p.id);
    }
    // keys held by pointers or fingertips this frame
    if (!this.p.hold) {
      for (const i of down) if (!this.held.has(i)) { this.held.set(i, true); this._keyDown(i); this.dirty = true; }
      for (const i of [...this.held.keys()]) if (!down.has(i)) { this.held.delete(i); this._keyUp(i); this.dirty = true; }
    } else for (const i of down) if (!this.latched.has(i) && !this._touchLatched?.has(i)) { this.latched.add(i); this._keyDown(i); (this._touchLatched ||= new Set()).add(i); this.dirty = true; }
    if (this._touchLatched) for (const i of [...this._touchLatched]) if (!down.has(i)) this._touchLatched.delete(i);
    for (const b of this.L.buttons) if (b.hotNow !== !!b.hot) { b.hot = b.hotNow; this.dirty = true; }
    for (const d of this.L.dials) if (d.hotNow !== !!d.hot) { d.hot = d.hotNow; this.dirty = true; }

    // the arpeggiator: steps through what's held (chord tones too), over two octaves
    const p = this.p;
    if (p.arp !== 'off') {
      const keys = [...new Set([...this.held.keys(), ...this.latched])].sort((a, b) => a - b);
      const pool = [...new Set(keys.flatMap((i) => this._chord(i)))].sort((a, b) => a - b);
      const seq = pool.length ? [...pool, ...pool.map((m) => m + 12)] : [];
      this.arp.t -= dt;
      if (seq.length && this.arp.t <= 0) {
        this.arp.t = 1 / p.arpRate;
        let idx;
        if (p.arp === 'up') idx = this.arp.i % seq.length;
        else if (p.arp === 'down') idx = seq.length - 1 - (this.arp.i % seq.length);
        else if (p.arp === 'updown') { const n = Math.max(1, seq.length * 2 - 2), k = this.arp.i % n; idx = k < seq.length ? k : n - k; }
        else idx = Math.floor(Math.random() * seq.length);
        this.arp.i++;
        const v = this._noteOn(seq[idx], false);
        if (v) this._release(v, this.S.ctx.currentTime + Math.min(0.6, 0.7 / p.arpRate) + p.atk);
        this.arpLit = keys.length ? keys[idx % keys.length] : -1;
        this.dirty = true;
      }
      if (!seq.length) this.arp.i = 0;
    }

    // live parameters
    const S = this.S || (this.voices.length || this.latched.size || p.noise > 0 ? this._audio() : null);
    if (S) {
      const now = S.ctx.currentTime;
      S.out.gain.setTargetAtTime(p.vol * 0.9 * this.fade, now, 0.05);
      S.dsend.gain.setTargetAtTime(p.echo, now, 0.05);
      S.fb.gain.setTargetAtTime(p.echo * 0.75, now, 0.05);
      S.rsend.gain.setTargetAtTime(p.space * 1.2, now, 0.05);
      S.lfo.frequency.setTargetAtTime(p.lfoR, now, 0.05);
      S.lfoG.gain.setTargetAtTime(p.lfoD * p.cut * 0.8, now, 0.05);
      S.ng.gain.setTargetAtTime(p.noise * 0.05, now, 0.2);
      for (const v of this.voices) {
        v.filt.frequency.setTargetAtTime(Math.min(16000, p.cut), now, 0.04);
        v.filt.Q.setTargetAtTime(p.res, now, 0.04);
        if (v.filt.type !== p.ftype) v.filt.type = p.ftype;
        v.o[0].type !== p.w1 && (v.o[0].type = p.w1);
        v.o[1].type !== p.w2 && (v.o[1].type = p.w2);
        v.o[0].detune.setTargetAtTime(-p.det / 2, now, 0.05); v.o[1].detune.setTargetAtTime(p.det / 2, now, 0.05);
      }
      // how loud: for the glow
      if (!this.fd || this.fd.length !== S.an.fftSize) this.fd = new Float32Array(S.an.fftSize);
      S.an.getFloatTimeDomainData(this.fd);
      let e = 0; for (let i = 0; i < this.fd.length; i += 4) e += this.fd[i] * this.fd[i];
      const lvl = Math.min(1, Math.sqrt(e / (this.fd.length / 4)) * 6);
      this.su.uLevel.value += (lvl - this.su.uLevel.value) * Math.min(1, dt * 4);
    }
    if (this.dirty) this._draw();
    this._scope();
  }

  // for previews: a slow arpeggio on held notes
  _demoPointers(t) {
    if (!this._demoSet) { this._demoSet = true; this.p.hold = true; this.p.arp = 'updown'; this.p.chord = 'add9'; this.latched.add(2); this.dirty = true; }
    return [];
  }

  _stop() {
    const S = this.S;
    if (!S) return;
    for (const v of this.voices) this._release(v);
    this.voices = [];
    const end = S.ctx.currentTime + 0.6;
    S.out.gain.setTargetAtTime(0, S.ctx.currentTime, 0.1);
    try { S.lfo.stop(end); S.nsrc.stop(end); } catch (_) {}
    setTimeout(() => { try { S.out.disconnect(); S.rsend.disconnect(); S.dl.disconnect(); } catch (_) {} }, 900);
    this.S = null;
  }
  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
