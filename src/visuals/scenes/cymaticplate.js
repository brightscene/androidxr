import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Cymatics
// A round plate of dark glass floats in front of you, dusted with glowing sand.
// Sound makes it vibrate, and the sand gathers along the still lines of the
// vibration, as in a real cymatics experiment.
//
// The patterns are the true resonant modes of a circular plate: a frequency
// excites the mode whose natural frequency is closest (plate vibrations go as
// the square of the wavenumber, and each mode's shape is a Bessel function
// round the plate, times a cosine around it). Low notes make simple rings and
// crosses; higher notes, intricate rosettes.
//
// Below it hangs a chain of rings, one for each solfeggio frequency. Touch a
// ring to sound its tone and hold its pattern on the plate; touch it again to
// let it go. When no ring is held, the plate follows the strongest pitch in the
// music playing around you.

const FREQS = [174, 285, 396, 417, 432, 528, 639, 741, 852, 963];
const PLATE_K = 4.6;   // f = PLATE_K * k^2: maps the audible range onto the plate's modes

// Bessel function of the first kind, by its integral
function besselJ(m, x) {
  let s = 0;
  const N = 64;
  for (let i = 0; i < N; i++) { const t = ((i + 0.5) / N) * Math.PI; s += Math.cos(m * t - x * Math.sin(t)); }
  return s / N;
}
// zeros of J_m: the plate's modes (m nodal diameters, n nodal circles)
const MODES = (() => {
  const out = [];
  for (let m = 0; m <= 10; m++) {
    let prev = besselJ(m, 0.5), n = 0;
    for (let x = 0.55; x < 26 && n < 6; x += 0.05) {
      const v = besselJ(m, x);
      if ((v > 0) !== (prev > 0)) { n++; out.push({ m, n, k: x - 0.025 }); }
      prev = v;
    }
  }
  return out.sort((a, b) => a.k - b.k);
})();
// a frequency between two of the plate's resonances excites both: the nearest
// mode, plus the next nearest in proportion to how close the frequency is to it
const modeFor = (f) => {
  const k = Math.sqrt(Math.max(20, f) / PLATE_K);
  const s = [...MODES].sort((a, b) => Math.abs(a.k - k) - Math.abs(b.k - k));
  const a = s[0], b = s.find((m) => m.m !== a.m) || s[1];
  const w = Math.max(0, Math.min(0.7, 0.9 * (1 - Math.abs(b.k - k) / (Math.abs(a.k - k) + Math.abs(b.k - k) + 1e-6)) * 0.9));
  return { ...a, b, w };
};

const RING_D = 0.5, RING_Y = -0.2, RING_STEP = 0.075, RING_R = 0.03;

export class CymaticPlateScene extends BaseScene {
  constructor() {
    super();
    this.wantsPointer = true;
    this.viewPitch = -0.12;
    const U = this.uniforms;

    // a dark, quiet space, faintly violet
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.01, 0.01, 0.025), vec3(0.06, 0.035, 0.1), fbm(d * 2.0 + vec3(0.0, uTime * 0.01, 0.0)));
          c += vec3(0.15, 0.1, 0.3) * exp(-pow(d.y * 3.0, 2.0)) * 0.25;
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));
    this.group.add(particles(U, { count: 400, min: [-5, -1, -6], max: [5, 3, 3], vel: [0, 0.03, 0], sway: 0.3, size: [0.005, 0.012], colors: ['#d8c8ff', '#a8e8ff'], alpha: 0.4 }));

    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;

    // the plate
    this.pu = { ...U, uM: { value: 0 }, uK: { value: 2.4 }, uM2: { value: 0 }, uK2: { value: 2.4 }, uB: { value: new THREE.Vector3(0, 2.4, 0) }, uB2: { value: new THREE.Vector3(0, 2.4, 0) }, uMix: { value: 1 }, uAmp: { value: 0.3 }, uRot: { value: 0 }, uHue: { value: 0.6 } };
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.3, 128), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.pu,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy / 0.3; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime, uM, uK, uM2, uK2, uMix, uAmp, uRot, uHue; uniform vec3 uB, uB2; varying vec2 vP; ${NOISE}
        float J(float m, float x){ float s = 0.0; for (int i = 0; i < 40; i++){ float t = (float(i) + 0.5) / 40.0 * 3.14159265; s += cos(m * t - x * sin(t)); } return s / 40.0; }
        float field(float m, float k, float r, float a){ return J(m, k * r) * cos(m * (a + uRot)); }
        vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ float r = length(vP), a = atan(vP.y, vP.x);
          if (r > 1.0) discard;
          // sand gathers where the plate is still: the nodal lines of the mode
          float f1 = field(uM, uK, r, a) + uB.z * field(uB.x, uB.y, r, a + 0.5), f2 = field(uM2, uK2, r, a) + uB2.z * field(uB2.x, uB2.y, r, a + 0.5);
          // distance to the nodal line, in pixels, so every line is the same fine width
          float d1 = abs(f1) / max(1e-5, length(vec2(dFdx(f1), dFdy(f1))));
          float d2 = abs(f2) / max(1e-5, length(vec2(dFdx(f2), dFdy(f2))));
          float s1 = exp(-d1 * d1 * 0.07) + exp(-d1 * 0.4) * 0.25, s2 = exp(-d2 * d2 * 0.07) + exp(-d2 * 0.4) * 0.25;
          float sand = mix(s2, s1, uMix);
          float grain = 0.65 + 0.35 * fbm(vec3(vP * 90.0, uTime * 6.0 * uAmp));
          // the vibrating antinodes shimmer faintly
          float vib = abs(mix(f2, f1, uMix)) * (0.5 + 0.5 * sin(uTime * 40.0)) * uAmp;
          vec3 col = mix(vec3(1.0, 0.95, 0.85), hue(uHue) * 0.6 + 0.5, 0.55);
          vec3 c = vec3(0.015, 0.012, 0.03) + col * sand * grain * (0.35 + uAmp * 1.6) + hue(uHue + 0.15) * vib * 0.25;
          c += vec3(0.5, 0.45, 0.8) * smoothstep(0.96, 1.0, r) * 0.5;   // the plate's rim
          gl_FragColor = vec4(c * uFade, 0.97 * uFade); }`,
    }));
    plate.position.set(0, -0.0, -0.9);
    plate.rotation.x = -0.85;   // tilted towards you
    this.rig.add(plate);
    this.plate = plate;
    this.readout = textPlane(U, 0.5, 0.045);
    this.readout.position.set(0, 0.25, -0.98);
    this.rig.add(this.readout);

    // the chain of tones
    this.rings = FREQS.map((f, k) => {
      const col = new THREE.Color().setHSL(0.72 - k * 0.07, 0.8, 0.62);
      const mat = (fs) => new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uFade: U.uFade, uCol: { value: col }, uOn: { value: 0 }, uTime: U.uTime },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: fs,
      });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.005, 10, 40), mat('uniform float uFade, uOn; uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol * (0.35 + uOn * 1.5) * uFade, 1.0); }'));
      ring.rotation.y = (k % 2) * 0.5;
      const glow = new THREE.Mesh(new THREE.CircleGeometry(RING_R * 2.3, 32), mat(`uniform float uFade, uOn, uTime; uniform vec3 uCol; varying vec2 vP;
        void main(){ float r = length(vP) / ${(RING_R * 2.3).toFixed(4)}; gl_FragColor = vec4(uCol * exp(-r * r * 6.0) * (0.04 + uOn * 0.55) * (0.85 + 0.15 * sin(uTime * 10.0 - r * 20.0)) * uFade, 1.0); }`));
      const label = textPlane(U, 0.07, 0.022);
      label.userData.set(String(f));
      label.material.uniforms.uA.value = 0.35;
      label.position.y = -RING_R - 0.02;
      const g = new THREE.Group();
      g.add(ring, glow, label);
      g.position.set((k - (FREQS.length - 1) / 2) * RING_STEP, RING_Y, -RING_D);
      this.rig.add(g);
      return { f, k, g, ring, glow, on: 0, touching: false };
    });
    this.hint = textPlane(U, 0.9, 0.05);
    this.hint.position.set(0, RING_Y - 0.085, -RING_D);
    this.hint.userData.set('Touch a ring to sound its tone and see its pattern · touch again to follow the music');
    this.rig.add(this.hint);
    this.hintA = 1;

    this.held = -1;      // the ring sounding, if any
    this.cur = { f: 0, m: 0, k: 2.4 };
    this.amp = 0;
    this.spec = null;
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

  // show the plate's pattern for a frequency, blending from the last one
  _show(f) {
    const md = modeFor(f);
    this.cur.f = f;
    if (md.m === this.cur.m && Math.abs(md.k - this.cur.k) < 1e-3 && Math.abs(md.w - (this.cur.w || 0)) < 0.03) return;
    const P = this.pu;
    P.uM2.value = P.uM.value; P.uK2.value = P.uK.value; P.uB2.value.copy(P.uB.value); P.uMix.value = 0;
    P.uM.value = md.m; P.uK.value = md.k; P.uB.value.set(md.b.m, md.b.k, md.w);
    this.cur.w = md.w;
    this.cur.m = md.m; this.cur.k = md.k; this.cur.n = md.n;
    P.uHue.value = (Math.log2(f / 100) / 3.5) % 1;
  }

  // the tone for a ring: a pure sine with a whisper of its octave
  _tone(on, f) {
    const A = SFX.audio();
    if (!A || this.muted) return;
    const { ctx } = A;
    if (!this.snd) {
      const out = ctx.createGain(); out.gain.value = 0; out.connect(A.out);
      const send = ctx.createGain(); send.gain.value = 0.6; out.connect(send).connect(A.reverb);
      const o = ctx.createOscillator(); o.type = 'sine';
      const o2 = ctx.createOscillator(); o2.type = 'sine';
      const g2 = ctx.createGain(); g2.gain.value = 0.12;
      o.connect(out); o2.connect(g2).connect(out); o.start(); o2.start();
      this.snd = { ctx, out, send, o, o2 };
    }
    const S = this.snd, now = ctx.currentTime;
    if (f) { S.o.frequency.setTargetAtTime(f, now, 0.05); S.o2.frequency.setTargetAtTime(f * 2, now, 0.05); }
    S.out.gain.setTargetAtTime(on ? 0.07 * this.fade : 0, now, on ? 0.4 : 0.6);
  }

  // the strongest pitch in what's playing, from the app's analyser
  _musicPitch() {
    const A = SFX.audio();
    const an = A?.analyser;
    if (!an) return 0;
    const n = an.frequencyBinCount;
    if (!this.spec || this.spec.length !== n) this.spec = new Float32Array(n);
    an.getFloatFrequencyData(this.spec);
    const hz = A.ctx.sampleRate / an.fftSize;
    let bi = -1, bv = -Infinity;
    for (let i = Math.floor(90 / hz); i < Math.min(n - 1, Math.ceil(1100 / hz)); i++) if (this.spec[i] > bv) { bv = this.spec[i]; bi = i; }
    if (bi < 1 || bv < -75) return 0;
    const a = this.spec[bi - 1], b = this.spec[bi], c = this.spec[bi + 1];
    const off = 0.5 * (a - c) / (a - 2 * b + c || 1);   // between bins
    this.musicLevel = Math.max(0, Math.min(1, (bv + 75) / 45));
    return (bi + off) * hz;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    const over = (this.hideRays ||= new Set());
    over.clear();

    for (const r of this.rings) r.near = false;
    for (const p of pointers) {
      let best = null, bd = Infinity;
      if (p.tip) {
        const q = p.tip.clone().applyMatrix4(inv);
        for (const r of this.rings) { const d = q.distanceTo(r.g.position); if (d < RING_R * 1.7 && d < bd) { bd = d; best = r; } }
        if (Math.abs(q.y - RING_Y) < 0.08 && Math.abs(q.x) < RING_STEP * FREQS.length / 2 + 0.03 && Math.abs(q.z + RING_D) < 0.1) over.add(p.id);
      } else {
        const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
        if (Math.abs(d.z) > 1e-3) {
          const k = (-RING_D - o.z) / d.z;
          if (k > 0) {
            const q = o.addScaledVector(d, k);
            for (const r of this.rings) { const dd = q.distanceTo(r.g.position); if (dd < RING_R * 1.3 && dd < bd) { bd = dd; best = r; } }
            if (Math.abs(q.y - RING_Y) < 0.06 && Math.abs(q.x) < RING_STEP * FREQS.length / 2 + 0.03) over.add(p.id);
          }
        }
      }
      if (!best) continue;
      best.near = true;
      // a fingertip touching a ring toggles it; pointing needs a pinch or click
      const pressed = INPUT.presses.includes(p.id) || p.press;
      const touchedNow = p.tip && !best.touching;
      if (pressed || touchedNow) {
        this.hintA = Math.min(this.hintA, 0.99);
        if (this.held === best.k) { this.held = -1; this._tone(false); }
        else { this.held = best.k; this._show(best.f); this._tone(true, best.f); }
      }
    }
    for (const r of this.rings) r.touching = r.near && pointers.some((p) => p.tip);

    // with no ring held, the plate follows the music
    if (this.held < 0) {
      const f = this._musicPitch();
      if (f > 0) {
        this.smoothF = this.smoothF ? this.smoothF + (f - this.smoothF) * Math.min(1, dt * 2.5) : f;
        this._show(this.smoothF);
      }
      this.amp += ((this.musicLevel || 0.2) * 0.55 - this.amp) * Math.min(1, dt * 2);
    } else this.amp += (0.75 - this.amp) * Math.min(1, dt * 2);
    const P = this.pu;
    P.uMix.value = Math.min(1, P.uMix.value + dt * 1.4);
    P.uAmp.value = this.amp;
    P.uRot.value += dt * 0.03;
    this.readout.userData.set(this.cur.f ? `${Math.round(this.cur.f)} Hz${this.held < 0 ? ' · following the music' : ''}` : '');
    this.readout.material.uniforms.uA.value = 0.45;

    for (const r of this.rings) {
      const target = r.k === this.held ? 1 : r.near ? 0.35 : 0;
      r.on += (target - r.on) * (1 - Math.exp(-dt * 6));
      r.ring.material.uniforms.uOn.value = r.on;
      r.glow.material.uniforms.uOn.value = r.on;
      r.g.scale.setScalar(1 + r.on * 0.2);
    }
    if (this.snd) this.snd.out.gain.setTargetAtTime(this.held >= 0 ? 0.07 * this.fade : 0, this.snd.ctx.currentTime, 0.3);
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.25);
    this.hint.material.uniforms.uA.value = (0.25 + 0.35 * Math.min(1, t * 0.5)) * this.hintA;
  }

  // for previews: step through the rings
  _demoPointers(t) {
    const step = Math.floor(t / 2.2), r = this.rings[(step * 3) % this.rings.length];
    const press = step !== this._demoStep; this._demoStep = step;
    if (!SFX.audio()) { if (press) { this.held = r.k; this._show(r.f); } return []; }
    const w = r.g.position.clone().applyMatrix4(this.rig.matrixWorld);
    return [{ id: 'demo', origin: w.clone().add(new THREE.Vector3(0, 0, 0.3)), dir: new THREE.Vector3(0, 0, -1), tip: null, press }];
  }

  _stop() {
    const S = this.snd;
    if (!S) return;
    const end = S.ctx.currentTime + 0.6;
    S.out.gain.setTargetAtTime(0, S.ctx.currentTime, 0.1);
    try { S.o.stop(end); S.o2.stop(end); } catch (_) {}
    setTimeout(() => { try { S.out.disconnect(); S.send.disconnect(); } catch (_) {} }, 900);
    this.snd = null;
  }
  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
