import * as THREE from 'three';
import { SFX, INPUT } from '../common.js';
import { textPlane } from './imagecycle.js';
import { CymaticsScene } from './cymatics.js';

// ===================================================================== Cymatics instrument
// The Clarity journey's floating sand plate, made playable. Thousands of grains
// settle onto the standing-wave figure of a square plate; a chain of rings in
// front of you holds the solfeggio frequencies. Touch a ring to sound its tone
// and hold its figure; touch it again to let go. With no ring held, the plate
// follows the strongest pitch in the music playing around you.
//
// Each frequency shows the plate mode whose natural frequency is closest: for
// a square plate the (n, m) figure cos(nπx)cos(mπy) − cos(mπx)cos(nπy)
// resonates at a frequency that rises with n² + m².

const FREQS = [174, 285, 396, 417, 432, 528, 639, 741, 852, 963];
const PLATE_K = 8.4;   // f = PLATE_K * (n^2 + m^2)
const MODES = (() => { const out = []; for (let n = 1; n <= 10; n++) for (let m = n + 1; m <= 11; m++) out.push([n, m, n * n + m * m]); return out; })();
const modeFor = (f) => {
  const q = f / PLATE_K;
  let best = MODES[0];
  for (const md of MODES) { const d = Math.abs(md[2] - q) - (md[1] - md[0] <= 3 ? 0.5 : 0); if (d < Math.abs(best[2] - q) - (best[1] - best[0] <= 3 ? 0.5 : 0)) best = md; }
  return best;
};
const RING_D = 0.5, RING_Y = -0.34, RING_STEP = 0.075, RING_R = 0.03;

export class CymaticPlateScene extends CymaticsScene {
  constructor() {
    super();
    this.wantsPointer = true;
    this.viewPitch = -0.12;
    const U = this.uniforms;

    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;

    this.readout = textPlane(U, 0.5, 0.045);
    this.readout.position.set(0, RING_Y + 0.07, -RING_D - 0.02);
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
    this.cur = { f: 0 };
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

  // show the plate's figure for a frequency (the sand glides into it)
  _show(f) {
    this.cur.f = f;
    const md = modeFor(f);
    if (this.mode && this.mode[0] === md[0] && this.mode[1] === md[1]) return;
    this.mode = [md[0], md[1]];
    this.shake = Math.max(this.shake, 0.9);
  }

  // the music's chords no longer pick the figure; notes and beats still shake the sand
  onEvent(ev) {
    if (ev.type === 'chord') return;
    super.onEvent(ev);
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

  update(dt, t, st) {
    super.update(dt, t, st);
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
    }
    if (this.held >= 0) this.shake = Math.max(this.shake, 0.55);   // a sounding tone keeps the sand alive
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
