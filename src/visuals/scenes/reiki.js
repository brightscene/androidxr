import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT, damp } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';
import { REIKI_THANKS } from '../../audio/scripts.js';
import { TRACE_AFFIRMATIONS, traceId } from '../../audio/affirmations.js';
import FONT from './scriptfont.json';

// Reiki: a faint outline of a Usui Reiki symbol hangs in the air in front of
// you. Trace it with your hand (point at it, or touch it with a fingertip if
// your hands are tracked) and it fills with golden aura light, stroke by
// stroke, in the traditional order. When it's complete you're thanked, it
// glows and fades, and the next symbol appears. The number traced this
// session is kept underneath.
//
// Stroke shapes are hand-drawn approximations for a meditative tracing
// practice, not reference drawings of the symbols.

// --- symbol shapes: strokes as point lists in a box from -1..1 (y up)
function spiral(cx, cy, r0, r1, turns, start, ccw = true, sy = 1) {
  const pts = [], n = Math.round(turns * 48);
  for (let i = 0; i <= n; i++) {
    const k = i / n, a = start + (ccw ? 1 : -1) * k * turns * Math.PI * 2, r = r0 + (r1 - r0) * k;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * sy]);
  }
  return pts;
}
const curve = (pts, steps = 12) => {   // smooth through control points (Catmull-Rom)
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
};
// place a kanji drawn in -1..1 into a slot of a vertical column
const slot = (strokes, i, count) => strokes.map((st) => st.map(([x, y]) => [x * 0.9 / count * 1.6, (y * 0.9 + (count - 1 - 2 * i)) / count]));

const DAI = [[[-0.65, 0.3], [0.65, 0.3]], curve([[0.0, 0.9], [0.0, 0.3], [-0.25, -0.35], [-0.7, -0.85]]), curve([[0.03, 0.15], [0.3, -0.4], [0.7, -0.85]])];
const KO = [[[0, 0.92], [0, 0.55]], [[-0.45, 0.82], [-0.28, 0.58]], [[0.45, 0.82], [0.28, 0.58]], [[-0.7, 0.42], [0.7, 0.42]],
  curve([[-0.2, 0.42], [-0.22, -0.2], [-0.4, -0.6], [-0.7, -0.88]]), [[0.2, 0.42], [0.2, -0.78], [0.7, -0.78], [0.7, -0.55]]];
const MYO = [[[-0.72, 0.45], [-0.72, -0.5]], [[-0.72, 0.45], [-0.3, 0.45], [-0.3, -0.5]], [[-0.72, 0.0], [-0.3, 0.0]], [[-0.72, -0.45], [-0.3, -0.45]],
  curve([[-0.02, 0.85], [-0.02, -0.2], [-0.12, -0.6], [-0.25, -0.88]]), [[-0.02, 0.85], [0.62, 0.85], [0.62, -0.82], [0.45, -0.7]], [[-0.02, 0.32], [0.62, 0.32]], [[-0.02, -0.2], [0.62, -0.2]]];

const SYMBOLS = [
  {
    name: 'Cho Ku Rei', meaning: 'power',
    strokes: [
      [[-0.55, 0.78], [0.05, 0.78]],
      [[0.05, 0.78], [0.05, -0.92]],
      spiral(0.05, -0.05, 0.62, 0.12, 2.75, Math.PI / 2, true, 0.95),
    ],
  },
  {
    name: 'Sei He Ki', meaning: 'harmony',
    strokes: [
      curve([[0.55, 0.82], [0.0, 0.88], [-0.45, 0.62], [-0.35, 0.2], [0.2, -0.05], [-0.15, -0.45], [-0.6, -0.8]]),
      curve([[0.2, 0.45], [0.42, 0.3], [0.25, 0.12]]),
      curve([[0.2, -0.25], [0.45, -0.4], [0.28, -0.6]]),
    ],
  },
  {
    name: 'Dai Ko Myo', meaning: 'great bright light',
    strokes: [...slot(DAI, 0, 3), ...slot(KO, 1, 3), ...slot(MYO, 2, 3)],
  },
  {
    name: 'Raku', meaning: 'grounding and completion',
    strokes: [[[-0.35, 0.92], [0.3, 0.55], [-0.3, 0.12], [0.32, -0.3], [-0.25, -0.68], [0.05, -0.95]]],
  },
];

// even spacing along each stroke so progress moves at a steady rate
function resample(st, step) {
  const out = [st[0]];
  let carry = 0;
  for (let i = 1; i < st.length; i++) {
    const [ax, ay] = st[i - 1], [bx, by] = st[i];
    const len = Math.hypot(bx - ax, by - ay);
    let d = step - carry;
    while (d <= len) { out.push([ax + (bx - ax) * d / len, ay + (by - ay) * d / len]); d += step; }
    carry = len - (d - step);
  }
  const last = st[st.length - 1], prev = out[out.length - 1];
  if (Math.hypot(last[0] - prev[0], last[1] - prev[1]) > step * 0.3) out.push(last);
  return out;
}

// Words as single-line handwriting (Hershey Script Simplex), centred, in metres.
// Pen strokes that meet are joined, so a word is usually one long flowing stroke.
function textStrokes(text, maxW = 0.8, maxH = 0.34) {
  const words = text.split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? `${cur} ${w}` : w; if (t.length > 13 && cur) { lines.push(cur); cur = w; } else cur = t; }
  lines.push(cur);
  const LH = 36, raw = [];
  let widest = 0;
  lines.forEach((ln, li) => {
    let x = 0;
    const these = [];
    for (const ch of ln) {
      const g = FONT.chars[ch.charCodeAt(0) - FONT.first];
      if (!g) { x += 14; continue; }
      for (const seg of g.d.split('M').slice(1)) {
        const pts = [...seg.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1] + x, +m[2] + li * LH]);
        if (pts.length > 1) these.push(pts);
      }
      x += g.o * 2;
    }
    for (const st of these) for (const p of st) p[0] -= x / 2;   // centre each line
    widest = Math.max(widest, x);
    raw.push(...these);
  });
  const merged = [];
  for (const st of raw) {
    const prev = merged[merged.length - 1];
    if (prev) { const a = prev[prev.length - 1], b = st[0]; if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1.6) { prev.push(...st.slice(1)); continue; } }
    merged.push(st.map((p) => [...p]));
  }
  const h = lines.length * LH, k = Math.min(maxW / widest, maxH / h);
  return merged.map((st) => st.map(([x, y]) => [x * k, -(y - h / 2) * k]));
}

const SIZE = 0.26;                                   // half-height of a symbol (m)
const PLANE = new THREE.Vector3(0, 1.35, -0.75);      // where the symbols hang until we know where you are
const REACH = 0.75;                                   // how far in front of you (m)

// What a tracing scene traces. Reiki symbols by default; the affirmation
// tracing journey passes its own deck (see AffirmationTraceScene below).
const REIKI = {
  deck: () => SYMBOLS.map((sym) => ({ title: `${sym.name} · ${sym.meaning}`, strokes: sym.strokes.map((st) => st.map(([x, y]) => [x * SIZE, y * SIZE])) })),
  hint: 'Trace the faint outline with your hand',
  score: (n) => `Symbols traced this session: ${n}`,
  done(scene) {
    scene.thanks.userData.set('Thank you');
    const k = Math.floor(Math.random() * REIKI_THANKS.length);
    if (scene.fade > 0.5) setTimeout(() => SFX.say(`reiki-thanks-${k + 1}`, 0), 500);
  },
};

export class ReikiScene extends BaseScene {
  constructor(opts = REIKI) {
    super();
    this.opts = opts;
    this.deck = opts.deck();
    this.wantsPointer = true;
    const U = this.uniforms;
    // a soft violet room of light
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uBreath; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          float n = fbm(d * 2.5 + vec3(0.0, uTime * 0.01, 0.0));
          vec3 c = mix(vec3(0.015, 0.01, 0.04), vec3(0.09, 0.05, 0.17), n);
          c += vec3(0.25, 0.16, 0.05) * exp(-pow(length(d - normalize(vec3(0.0, 0.0, -1.0))) * 1.6, 2.0)) * (0.25 + uBreath * 0.08);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    dome.renderOrder = -5;
    this.group.add(dome);
    this.group.add(particles(U, { count: 600, min: [-6, 0, -8], max: [6, 4, 2], vel: [0, 0.05, 0], sway: 0.4, size: [0.008, 0.02], colors: ['#ffe6b0', '#e8d8ff'], alpha: 0.55 }));

    this.holder = new THREE.Group();
    this.holder.position.copy(PLANE);
    this.group.add(this.holder);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { ...U, uDoneS: { value: 0 }, uDoneI: { value: 0 }, uShow: { value: 0 }, uGlow: { value: 0 } },
      vertexShader: /* glsl */ `attribute vec3 aInfo; varying vec3 vInfo; varying float vX;
        void main(){ vInfo = aInfo; vX = aInfo.z; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uDoneS, uDoneI, uShow, uGlow, uTime, uFade; varying vec3 vInfo; varying float vX;
        void main(){
          float s = vInfo.x, i = vInfo.y;
          bool done = s < uDoneS - 0.5 || (abs(s - uDoneS) < 0.5 && i <= uDoneI);
          bool current = abs(s - uDoneS) < 0.5;
          float prof = exp(-vX * vX * 9.0);                   // soft across the line
          vec3 gold = vec3(1.0, 0.74, 0.3), aura = vec3(1.0, 0.9, 0.62);
          vec3 c; float a;
          if (done) { c = mix(gold, aura, prof) * (1.4 + uGlow * 1.2 + 0.2 * sin(uTime * 3.0 - i * 0.2)); a = prof; }
          else {
            float guide = current ? 0.38 + 0.25 * exp(-pow(i - uDoneI - 3.0, 2.0) * 0.05) * (0.6 + 0.4 * sin(uTime * 4.0)) : 0.2;
            c = vec3(0.85, 0.82, 1.0) * guide; a = prof * 0.8;
          }
          gl_FragColor = vec4(c * a * uShow * uFade, 1.0);
        }`,
    });
    // a little glowing bead where your trace is
    this.cursor = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.holder.add(this.cursor);
    // where to begin the next stroke: a pulsing ring
    this.start = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.018, 32), new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.holder.add(this.start);
    this.title = textPlane(U, 0.9, 0.11); this.title.position.set(0, SIZE + 0.1, 0); this.holder.add(this.title);
    this.thanks = textPlane(U, 0.75, 0.13); this.thanks.position.set(0, SIZE + 0.1, 0.01); this.holder.add(this.thanks);
    this.score = textPlane(U, 0.9, 0.08); this.score.position.set(0, -SIZE - 0.08, 0); this.holder.add(this.score);
    this.sparks = particles(U, { count: 300, min: [-SIZE, -SIZE, -0.05], max: [SIZE, SIZE, 0.05], vel: [0, 0.04, 0], sway: 0.08, size: [0.003, 0.009], colors: ['#ffe2a0', '#fff5d8'], alpha: 1 });
    this.sparks.userData.u.uAlpha.value = 0;
    this.holder.add(this.sparks);
    this.count = 0;
    this.which = 0;
    this._load(0);
  }

  _load(k) {
    this.placeNext = true;   // each new symbol appears in front of you
    const item = this.deck[k % this.deck.length];
    this.item = item;
    const step = item.step || 0.025;
    this.paths = item.strokes.map((st) => resample(st, step).map(([x, y]) => new THREE.Vector2(x, y)));
    // ribbons along every stroke, with stroke number, point number and position across
    const pos = [], info = [], idx = [];
    const W = item.width || 0.009;
    let base = 0;
    this.paths.forEach((pts, s) => {
      pts.forEach((p, i) => {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const t = new THREE.Vector2(b.x - a.x, b.y - a.y).normalize();
        const nx = -t.y, ny = t.x;
        pos.push(p.x + nx * W, p.y + ny * W, s * 0.0005, p.x - nx * W, p.y - ny * W, s * 0.0005);
        info.push(s, i, 1, s, i, -1);
        if (i > 0) { const o = base + (i - 1) * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
      });
      base += pts.length * 2;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aInfo', new THREE.Float32BufferAttribute(info, 3));
    g.setIndex(idx);
    if (this.lines) { this.holder.remove(this.lines); this.lines.geometry.dispose(); }
    this.lines = new THREE.Mesh(g, this.mat);
    this.lines.renderOrder = 10;
    this.holder.add(this.lines);
    this.prog = { s: 0, i: 0 };
    this.state = { phase: 'in', t: 0 };
    this.title.userData.set(item.title);
    this.score.userData.set(this.count ? this.opts.score(this.count) : this.opts.hint);
    this.thanks.userData.set('');
  }

  _sfx(kind, opts) { if (this.fade > 0.5) SFX.play(kind, opts); }

  // where each pointer meets the symbol plane, in symbol coordinates
  _touches() {
    const out = [];
    if (this.demo && this.state.phase === 'trace') {
      const path = this.paths[Math.min(this.prog.s, this.paths.length - 1)];
      const q = path[Math.min(path.length - 1, this.prog.i + 2)];
      return [new THREE.Vector2(q.x, q.y)];
    }
    const inv = new THREE.Matrix4().copy(this.holder.matrixWorld).invert();
    for (const p of INPUT.pointers) {
      let hit = null;
      if (p.tip) {
        const local = p.tip.clone().applyMatrix4(inv);
        if (Math.abs(local.z) < 0.2) hit = local;   // fingertip near the symbol: trace by touch
      }
      if (!hit) {
        const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
        if (Math.abs(d.z) > 1e-3) { const k = -o.z / d.z; if (k > 0) hit = o.addScaledVector(d, k); }
      }
      if (hit && Math.abs(hit.x) < SIZE * 2 && Math.abs(hit.y) < SIZE * 2) out.push(new THREE.Vector2(hit.x, hit.y));
    }
    return out;
  }

  // hang the symbol at your eye level, straight in front of where you're facing
  _place() {
    const h = INPUT.head;
    if (!h) return false;
    const f = new THREE.Vector3(h.fwd.x, 0, h.fwd.z);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    this.holder.position.set(h.pos.x + f.x * REACH, h.pos.y - 0.04, h.pos.z + f.z * REACH);
    this.holder.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    return true;
  }

  update(dt, t) {
    this.xr = INPUT.pointers.some((p) => p.id !== 'mouse');
    if (this.placeNext) this.placeNext = !this._place();
    const st = this.state, m = this.mat.uniforms;
    st.t += dt;
    this.holder.updateMatrixWorld(true);
    const touches = this._touches();
    this.cursor.material.opacity = damp(this.cursor.material.opacity, touches.length && st.phase === 'trace' ? 0.9 : 0, 8, dt);
    if (touches.length) this.cursor.position.set(touches[0].x, touches[0].y, 0.005);
    let show = 1;
    if (st.phase === 'in') {
      show = Math.min(1, st.t / 2);
      if (st.t >= 2) { st.phase = 'trace'; st.t = 0; }
    } else if (st.phase === 'trace') {
      const P = this.prog, path = this.paths[P.s];
      const tol = this.xr ? 0.05 : 0.035;               // how close you need to be (m): hands wobble more than a mouse
      for (const q of touches) {
        // move along the stroke as far as you're following it
        for (let look = 1; look <= (this.item.look || 6) && P.i + look < path.length; look++) {
          if (q.distanceTo(path[P.i + look]) < tol) { P.i += look; look = 0; }
        }
        if (P.i === 0 && q.distanceTo(path[0]) < tol) P.i = 1;
      }
      if (P.i >= path.length - 1) {
        P.s++; P.i = 0;
        this._sfx('chime', { gain: 0.35, dur: 2.2, note: [1, 1.122, 1.26, 1.335, 1.5][P.s % 5], pan: 0 });
        if (P.s >= this.paths.length) {
          st.phase = 'done'; st.t = 0;
          this.count++;
          this.score.userData.set(this.opts.score(this.count));
          this._sfx('chime', { gain: 0.6, dur: 5, note: 1, pan: 0 });
          this.opts.done(this);
        }
      }
      // pulsing ring at the start of the next stroke until you begin it
      const next = this.paths[Math.min(P.s, this.paths.length - 1)][0];
      this.start.position.set(next.x, next.y, 0.003);
      this.start.scale.setScalar(1 + 0.25 * Math.sin(t * 4));
      this.start.material.opacity = damp(this.start.material.opacity, P.i === 0 && st.phase === 'trace' ? 0.8 : 0, 6, dt);
    } else if (st.phase === 'done') {
      // glow, thank you, then fade out and on to the next symbol
      m.uGlow.value = Math.max(0, 1 - st.t / 3);
      this.sparks.userData.u.uAlpha.value = Math.max(0, 1 - st.t / 4);
      this.start.material.opacity = 0;
      show = st.t < 4.5 ? 1 : Math.max(0, 1 - (st.t - 4.5) / 1.5);
      if (st.t >= 6.5) { this.which++; this._load(this.which); show = 0; }
    }
    const P = this.prog;
    m.uDoneS.value = P.s;
    m.uDoneI.value = P.i;
    m.uShow.value = show;
    this.title.material.uniforms.uA.value = show * 0.75 * (st.phase === 'done' ? Math.max(0, 1 - st.t / 0.5) : 1);
    this.score.material.uniforms.uA.value = show * 0.55;
    this.thanks.material.uniforms.uA.value = st.phase === 'done' ? Math.min(1, st.t / 0.6) * show : 0;
  }
}

// ===================================================================== Affirmation tracing
// A short affirmation hangs in front of you in flowing handwriting. Trace it
// with your finger (or point), letter by letter, and it fills with golden
// light; when it's complete it's read aloud to you, then the next one appears.
const AFFIRM = {
  deck() {
    const order = TRACE_AFFIRMATIONS.map((text, i) => ({ text, i })).sort(() => Math.random() - 0.5);
    return order.map(({ text, i }) => ({ title: 'Trace the words', strokes: textStrokes(text), step: 0.012, look: 12, width: 0.006, text, say: traceId(i) }));
  },
  hint: 'Trace the words with your finger',
  score: (n) => `Affirmations traced this session: ${n}`,
  done(scene) {
    scene.thanks.userData.set(scene.item.text);   // the finished affirmation glows above as it's spoken
    if (scene.fade > 0.5) setTimeout(() => SFX.say(scene.item.say, 0, scene.item.text), 400);
  },
};

export class AffirmationTraceScene extends ReikiScene {
  constructor() { super(AFFIRM); }
}
