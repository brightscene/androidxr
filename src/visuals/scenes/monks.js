import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Monks chanting
// A candlelit monastery hall. Six monks sit in a semicircle before you, chanting
// a deep "Om Mani Padme Hum" on one low drone, with a growl of throat-singing
// beneath. The chant is made live: a choir of voices shaped through vowel
// formants, moving through the syllables in slow, overlapping phrases.
// Interactive: a column of glowing rings rises in front of you, one for each
// overtone of the chant's low note. Touch a ring and that overtone sings out of
// the choir, as real overtone singers do; slide along to play melodies
// made only of the chant's own harmonics. A second, lower chain sets the note
// the whole choir chants on, so you can lead the chant itself.

const F0 = 65.41;                                   // C2: the drone
const HARMONICS = [4, 5, 6, 7, 8, 9, 10, 11, 12];
// vowel formants for a deep male voice: [F1, F2, F3]
const VOWELS = { o: [430, 780, 2600], m: [250, 600, 2200], a: [700, 1100, 2450], i: [300, 2100, 2900], e: [480, 1750, 2500], u: [320, 760, 2250] };
// Om · Ma · Ni · Pad · Me · Hum: [vowel, seconds]
const PHRASE = [['o', 3.2], ['m', 1.6], ['a', 1.5], ['i', 1.4], ['a', 1.4], ['e', 1.5], ['u', 2.2], ['m', 1.8]];
const RING_D = 0.62, RING_Y = -0.12, RING_STEP = 0.082, RING_R = 0.045;   // a chain of linked rings across in front of you
// a second, lower chain sets the note the monks chant on (minor pentatonic around the C drone)
const NOTES = [-5, -2, 0, 3, 5, 7, 10], HOME = 2;
const NOTE_Y = -0.235, NOTE_STEP = 0.1, NOTE_R = 0.052;
const NOTE_NAMES = ['G', 'B♭', 'C', 'E♭', 'F', 'G', 'B♭'];

export class MonksScene extends BaseScene {
  constructor() {
    super();
    this.wantsPointer = true;
    const U = this.uniforms;

    // the hall: dark carved wood, red pillars, warm lamplight
    this.group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(14, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; varying vec3 vW; void main(){ vDir = position; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir); float az = atan(d.x, -d.z), y = d.y;
          float grain = fbm(vec3(az * 12.0, y * 30.0, 1.0));
          vec3 c = mix(vec3(0.03, 0.016, 0.01), vec3(0.075, 0.04, 0.02), grain);
          // red lacquered pillars round the hall
          float pillar = smoothstep(0.03, 0.06, abs(fract(az / 0.7) - 0.5) - 0.38);
          c = mix(c, vec3(0.42, 0.05, 0.035) * (0.55 + 0.45 * grain) * (0.6 + 0.6 * exp(-pow((y + 0.05) * 3.0, 2.0))), pillar * smoothstep(0.75, 0.6, y));
          // painted banners: bands of colour and pattern between the pillars
          float banner = step(0.25, y) * step(y, 0.6) * (1.0 - pillar);
          vec3 bc = 0.5 + 0.5 * cos(6.28 * (floor(az / 0.7) * 0.37 + vec3(0.0, 0.33, 0.67)));
          float pat = 0.6 + 0.4 * sin(y * 90.0) * sin(az * 60.0);
          c = mix(c, bc * vec3(0.3, 0.2, 0.12) * (0.75 + 0.25 * pat), banner * 0.4);
          // warm glow from the lamps low down, a beam from a high window
          c += vec3(0.5, 0.25, 0.08) * exp(-pow((y + 0.02) * 7.0, 2.0)) * 0.22;
          float beam = exp(-pow((az + 0.9) * 4.0 - (y - 0.4) * 2.5, 2.0)) * smoothstep(-0.1, 0.5, y);
          c += vec3(1.0, 0.8, 0.5) * beam * 0.12 * (0.8 + 0.2 * fbm(vec3(az * 8.0, y * 8.0, uTime * 0.05)));
          c *= smoothstep(-0.6, -0.15, y) * 0.7 + 0.3;
          gl_FragColor = vec4(grade(c), uFade); }`,
    })), { renderOrder: -10 }));

    // the floor: polished wood
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vW; ${NOISE}
        void main(){ float plank = fbm(vec3(vW.x * 0.6, vW.z * 8.0, 1.0)) * (0.8 + 0.2 * step(0.5, fract(vW.x * 1.2)));
          vec3 c = mix(vec3(0.07, 0.035, 0.018), vec3(0.16, 0.08, 0.035), plank);
          c += vec3(0.4, 0.18, 0.05) * exp(-length(vW.xz - vec2(0.0, -3.0)) * 0.6) * 0.3;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    }));
    this.group.add(floor);

    // butter lamps: rows of small flickering flames
    const lamps = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 15; i++) {
      const a = (i - 7) * 0.13, R = 4.6 + row * 0.25;
      lamps.push(Math.sin(a) * R, 0.75 + row * 0.18, -Math.cos(a) * R - 1.6, Math.random());
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(lamps.filter((_, k) => k % 4 < 3), 3));
    lg.setAttribute('aSeed', new THREE.Float32BufferAttribute(lamps.filter((_, k) => k % 4 === 3), 1));
    const lampPts = new THREE.Points(lg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'attribute float aSeed; uniform float uTime, uViewH; varying float vF; void main(){ vF = 0.75 + 0.25 * sin(uTime * (7.0 + aSeed * 5.0) + aSeed * 30.0); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = 0.09 * projectionMatrix[1][1] * uViewH / -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uFade; varying float vF; void main(){ vec2 p = gl_PointCoord - 0.5; p.y *= 0.6; float d = length(p) * 2.0; float a = exp(-d * d * 5.0) * vF; gl_FragColor = vec4(vec3(1.0, 0.6, 0.2) * a * 1.4 * uFade, 1.0); }',
    }));
    lampPts.frustumCulled = false;
    this.group.add(lampPts);
    this.group.add(particles(U, { count: 260, min: [-3, 0.6, -6], max: [3, 5, -1], vel: [0.02, 0.12, 0], sway: 0.6, size: [0.03, 0.08], colors: ['#c8b8a8', '#a89888'], alpha: 0.18 }));   // incense smoke

    // the monks: seated figures in maroon and saffron, gently swaying as they chant
    const robe = new THREE.ShaderMaterial({
      uniforms: { ...U, uCol: { value: new THREE.Color('#5a0e10') } },
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade; uniform vec3 uCol; varying vec3 vN; varying vec3 vW; ${NOISE}
        void main(){ vec3 n = normalize(vN);
          float lamp = max(dot(n, normalize(vec3(0.0, 0.3, -1.0))), 0.0);       // lit from the lamps behind and below
          float rim = pow(1.0 - abs(n.z), 2.0) * 0.4;
          float folds = 0.8 + 0.2 * fbm(vW * 9.0);
          vec3 c = uCol * folds * (0.25 + lamp * 0.5) + vec3(0.5, 0.25, 0.08) * rim;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    });
    const saffron = robe.clone(); saffron.uniforms = { ...U, uCol: { value: new THREE.Color('#b8661a') } };
    const skin = robe.clone(); skin.uniforms = { ...U, uCol: { value: new THREE.Color('#6a4a32') } };
    this.monks = [];
    for (let i = 0; i < 6; i++) {
      const a = (i - 2.5) * 0.3, R = 4.0;
      const m = new THREE.Group();
      const lap = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), saffron); lap.scale.set(0.5, 0.16, 0.42); lap.position.y = 0.12;   // crossed legs under a saffron cloth
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.32, 0.62, 20), robe); torso.position.y = 0.5;
      const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), robe); shoulders.scale.set(0.3, 0.14, 0.2); shoulders.position.y = 0.78;
      const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), skin); neck.position.y = 0.88;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin); head.scale.set(1, 1.1, 1); head.position.y = 1.0;
      m.add(lap, torso, shoulders, neck, head);
      m.position.set(Math.sin(a) * R, 0, -Math.cos(a) * R);
      m.lookAt(0, 0, 0);
      this.group.add(m);
      this.monks.push({ m, ph: Math.random() * 6 });
    }

    // the harmonic ladder, hung in front of you
    this.rig = new THREE.Group();
    this.rig.position.set(0, 1.6, 0);
    this.group.add(this.rig);
    this.rings = HARMONICS.map((n, k) => {
      const col = new THREE.Color().setHSL(0.08 + k * 0.09, 0.85, 0.6);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(RING_R, 0.006, 10, 48), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uFade: U.uFade, uCol: { value: col }, uOn: { value: 0 } },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uFade, uOn; uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol * (0.35 + uOn * 1.6) * uFade, 1.0); }',
      }));
      const glow = new THREE.Mesh(new THREE.CircleGeometry(RING_R * 2.2, 32), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uFade: U.uFade, uCol: { value: col }, uOn: { value: 0 }, uTime: U.uTime },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uFade, uOn, uTime; uniform vec3 uCol; varying vec2 vP;
          void main(){ float r = length(vP) / ${(RING_R * 2.2).toFixed(4)}; float a = exp(-r * r * 6.0) * (0.06 + uOn * 0.6) * (0.85 + 0.15 * sin(uTime * 12.0 - r * 20.0));
            gl_FragColor = vec4(uCol * a * uFade, 1.0); }`,
      }));
      const g = new THREE.Group();
      g.add(ring, glow);
      g.position.set((k - (HARMONICS.length - 1) / 2) * RING_STEP, RING_Y, -RING_D);   // low overtones on the left, high on the right
      this.rig.add(g);
      return { n, g, ring, glow, on: 0, target: 0, R: RING_R };
    });
    // the chant chain: deeper, saffron and crimson like the robes, slightly larger links
    this.notes = NOTES.map((semi, k) => {
      const col = new THREE.Color().setHSL(0.0 + k * 0.022, 0.9, 0.5);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(NOTE_R, 0.009, 12, 56), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uFade: U.uFade, uCol: { value: col }, uOn: { value: 0 }, uSel: { value: 0 } },
        vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uFade, uOn, uSel; uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol * (0.3 + uSel * 0.5 + uOn * 1.4) * uFade, 1.0); }',
      }));
      ring.rotation.y = (k % 2) * 0.5;   // alternate links turned, like a real chain
      const glow = new THREE.Mesh(new THREE.CircleGeometry(NOTE_R * 2.4, 32), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uFade: U.uFade, uCol: { value: col }, uOn: { value: 0 }, uSel: { value: 0 }, uTime: U.uTime },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform float uFade, uOn, uSel, uTime; uniform vec3 uCol; varying vec2 vP;
          void main(){ float r = length(vP) / ${(NOTE_R * 2.4).toFixed(4)}; float a = exp(-r * r * 6.0) * (0.04 + uSel * 0.22 + uOn * 0.5) * (0.85 + 0.15 * sin(uTime * 3.0 - r * 10.0));
            gl_FragColor = vec4(uCol * a * uFade, 1.0); }`,
      }));
      const label = textPlane(U, 0.08, 0.03);
      label.userData.set(NOTE_NAMES[k]);
      label.position.set(0, -NOTE_R - 0.022, 0);
      label.material.uniforms.uA.value = 0.35;
      const g = new THREE.Group();
      g.add(ring, glow, label);
      g.position.set((k - (NOTES.length - 1) / 2) * NOTE_STEP, NOTE_Y, -RING_D);
      this.rig.add(g);
      return { semi, g, ring, glow, on: 0, target: 0, R: NOTE_R, note: true };
    });
    this.sel = HOME; this.root = F0; this.nod = 0;
    this.hint = textPlane(U, 1.0, 0.06);
    this.hint.position.set(0, NOTE_Y - 0.11, -RING_D);
    this.hint.userData.set('Upper rings: overtones · lower rings: the note of the chant');
    this.rig.add(this.hint);
    this.hintA = 1;
    this.placeNext = true;
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

  // ---- the choir
  _choir() {
    if (this.snd) return this.snd;
    if (this.muted) return null;
    const A = SFX.audio();
    if (!A || this.fade < 0.05) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.8; out.connect(send).connect(A.reverb);   // a big stone hall
    // every monk's voice feeds one shared vocal tract (the formant filters)
    const source = ctx.createGain(); source.gain.value = 1;
    const voices = [];
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.value = F0 * (1 + (i - 2.5) * 0.0025);
      const vib = ctx.createOscillator(), vg = ctx.createGain();
      vib.frequency.value = 0.18 + i * 0.05; vg.gain.value = F0 * 0.004;
      vib.connect(vg).connect(o.frequency);
      const g = ctx.createGain(); g.gain.value = 0;
      o.connect(g).connect(source);
      o.start(); vib.start();
      voices.push({ o, vib, g });
    }
    // throat-singing undertone: an octave below, rough and quiet
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = F0 / 2;
    const subLp = ctx.createBiquadFilter(); subLp.type = 'lowpass'; subLp.frequency.value = 180;
    const subG = ctx.createGain(); subG.gain.value = 0;
    sub.connect(subLp).connect(subG).connect(out); sub.start();
    // formants
    const formants = [0, 1, 2].map((k) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [6, 9, 11][k]; f.frequency.value = VOWELS.o[k];
      const g = ctx.createGain(); g.gain.value = [1.0, 0.55, 0.25][k];
      source.connect(f).connect(g).connect(out);
      return f;
    });
    const body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = 320;
    const bodyG = ctx.createGain(); bodyG.gain.value = 0.35;
    source.connect(body).connect(bodyG).connect(out);
    // overtones: a very narrow band of the choir lifted at each harmonic, plus a pure whistle
    const tones = HARMONICS.map((n) => {
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F0 * n; bp.Q.value = 38;
      const g = ctx.createGain(); g.gain.value = 0;
      source.connect(bp).connect(g).connect(out);
      const w = ctx.createOscillator(); w.type = 'sine'; w.frequency.value = F0 * n;
      const wg = ctx.createGain(); wg.gain.value = 0;
      w.connect(wg).connect(out); w.start();
      return { g, wg, w, bp };
    });
    this.snd = { ctx, out, send, voices, sub, subG, formants, tones, nodes: [out, send, source, body, bodyG, subLp] };
    this.step = -1; this.stepT = 0; this.breath = 0;
    return this.snd;
  }

  // move the choir through the syllables, with breaths between phrases
  _chant(dt) {
    const S = this.snd;
    const now = S.ctx.currentTime;
    this.stepT -= dt;
    if (this.stepT > 0) return;
    if (this.breath > 0) {   // breathing in between phrases
      this.breath = 0; this.step = -1;
    }
    this.step++;
    if (this.step >= PHRASE.length) {
      // a breath: the voices fall away one by one, then the next phrase
      S.voices.forEach((v, i) => v.g.gain.setTargetAtTime(0, now + i * 0.08, 0.25));
      S.subG.gain.setTargetAtTime(0, now, 0.3);
      this.breath = 1; this.stepT = 1.6 + Math.random() * 0.6;
      return;
    }
    const [vowel, dur] = PHRASE[this.step];
    const F = VOWELS[vowel];
    S.formants.forEach((f, k) => f.frequency.setTargetAtTime(F[k], now, vowel === 'm' ? 0.12 : 0.22));
    // voices come in staggered at the start of a phrase; "m" closes the mouth, quieter
    const level = vowel === 'm' ? 0.08 : 0.14;
    S.voices.forEach((v, i) => v.g.gain.setTargetAtTime(level, now + (this.step === 0 ? i * 0.12 : 0), this.step === 0 ? 0.5 : 0.15));
    S.subG.gain.setTargetAtTime(vowel === 'm' ? 0.05 : 0.09, now, 0.4);
    // the pitch sags a little at the end of the phrase
    const sag = this.step === PHRASE.length - 1 ? 0.97 : 1;
    S.voices.forEach((v, i) => v.o.frequency.setTargetAtTime(this.root * (1 + (i - 2.5) * 0.0025) * sag, now, this.gliding ? 0.25 : 0.8));
    this.stepT = dur * (0.92 + Math.random() * 0.16);
  }

  // glide the whole choir (and its overtones) to a new note
  _retune(k) {
    if (k === this.sel) return;
    this.sel = k; this.root = F0 * Math.pow(2, NOTES[k] / 12); this.nod = 1;
    const S = this.snd;
    if (!S) return;
    const now = S.ctx.currentTime, gl = 0.12;
    S.voices.forEach((v, i) => { v.o.frequency.setTargetAtTime(this.root * (1 + (i - 2.5) * 0.0025), now, gl); });
    S.sub.frequency.setTargetAtTime(this.root / 2, now, gl);
    S.tones.forEach((T, j) => { T.bp.frequency.setTargetAtTime(this.root * HARMONICS[j], now, gl); T.w.frequency.setTargetAtTime(this.root * HARMONICS[j], now, gl); });
    // if the choir is resting between phrases, wake it on the new note
    if (this.breath) { this.stepT = 0; }
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    // the monks sway gently
    this.nod = Math.max(0, this.nod - dt * 1.5);
    for (const mk of this.monks) { mk.m.rotation.z = Math.sin(t * 0.4 + mk.ph) * 0.02; mk.m.position.y = -Math.sin(this.nod * Math.PI) * 0.025; }

    // touching rings
    const all = this.all ||= [...this.rings, ...this.notes];
    for (const r of all) r.target = 0;
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    const over = this.hideRays ||= new Set();
    over.clear();
    for (const p of pointers) {
      let best = null, bd = Infinity;
      if (p.tip) {
        const q = p.tip.clone().applyMatrix4(inv);
        for (const r of all) { const d = q.distanceTo(r.g.position); if (d < r.R * 1.6 && d < bd) { bd = d; best = r; } }
        // hide this hand's beam while the fingertip is among the rings
        for (const r of all) if (q.distanceTo(r.g.position) < r.R * 3) { over.add(p.id); break; }
      } else {
        const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
        if (Math.abs(d.z) > 1e-3) {
          const k = (-RING_D - o.z) / d.z;
          if (k > 0) {
            const q = o.addScaledVector(d, k);
            if (Math.abs(q.y - (RING_Y + NOTE_Y) / 2) < 0.12 && Math.abs(q.x) < NOTE_STEP * NOTES.length / 2 + 0.03) over.add(p.id);   // over the chains: hide the beam
            for (const r of all) { const dd = q.distanceTo(r.g.position); if (dd < r.R * 1.15 && dd < bd) { bd = dd; best = r; } }
          }
        }
      }
      if (best) { best.target = 1; this.hintA = Math.min(this.hintA, 0.99); if (best.note) this._retune(this.notes.indexOf(best)); }
    }

    const S = this._choir();
    if (S) {
      const now = S.ctx.currentTime;
      S.out.gain.setTargetAtTime(0.5 * this.fade, now, 0.4);
      this._chant(dt);
      for (let k = 0; k < this.rings.length; k++) {
        const r = this.rings[k], T = S.tones[k];
        T.g.gain.setTargetAtTime(r.target * 9, now, r.target ? 0.12 : 0.5);
        T.wg.gain.setTargetAtTime(r.target * 0.045, now, r.target ? 0.15 : 0.6);
      }
    }
    for (const r of all) {
      r.on += (r.target - r.on) * (1 - Math.exp(-dt * (r.target ? 10 : 2.5)));
      r.ring.material.uniforms.uOn.value = r.on;
      r.glow.material.uniforms.uOn.value = r.on;
      r.g.scale.setScalar(1 + r.on * 0.25);
    }
    // the chanting note stays softly lit, breathing with the choir
    this.notes.forEach((r, k) => {
      const s = k === this.sel ? 1 : 0;
      r.ring.material.uniforms.uSel.value += (s - r.ring.material.uniforms.uSel.value) * (1 - Math.exp(-dt * 4));
      r.glow.material.uniforms.uSel.value = r.ring.material.uniforms.uSel.value * (0.8 + 0.2 * Math.sin(t * 1.3));
    });
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.3);
    this.hint.material.uniforms.uA.value = 0.5 * this.hintA * Math.min(1, t * 0.3);
  }

  // for previews: an invisible hand drifts back and forth along the chain
  _demoPointers(t) {
    const row = Math.floor(t / 6) % 2 ? this.notes : this.rings;
    const k = Math.floor((Math.sin(t * 0.5) * 0.5 + 0.5) * (row.length - 0.01));
    const world = row[k].g.position.clone().applyMatrix4(this.rig.matrixWorld);
    return [{ id: 'demo', origin: world, dir: new THREE.Vector3(0, 0, -1), tip: world }];
  }

  _stop() {
    const S = this.snd;
    if (!S) return;
    const end = S.ctx.currentTime + 0.8;
    S.out.gain.setTargetAtTime(0, S.ctx.currentTime, 0.15);
    for (const v of S.voices) { try { v.o.stop(end); v.vib.stop(end); } catch (_) {} }
    for (const t of S.tones) try { t.w.stop(end); } catch (_) {}
    try { S.sub.stop(end); } catch (_) {}
    setTimeout(() => { for (const n of S.nodes) try { n.disconnect(); } catch (_) {} }, 1200);
    this.snd = null;
  }

  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
