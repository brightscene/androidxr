import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Theremin
// A theremin, played as the real one is, without touching it. Your right hand
// near the upright pitch rod sets the pitch (closer is higher); your left hand
// over the loop sets the volume (lower your hand to the loop to fade to silence).
// The tone glides between notes with a gentle vibrato and the theremin's
// singing, vocal timbre. A chip switches between free pitch and a mode that
// settles onto a pentatonic scale, for easy, restful melodies.
//
// Glowing rings show the instrument's fields: around the rod at your hand's
// height, wider as your hand moves away; over the loop, brighter as the
// volume rises.
//
// On a screen: hold the mouse button and move left and right for pitch, up and
// down for volume.

const LOW = 130.81, OCTAVES = 3;           // C3 up to C6
const PENTA = [0, 2, 4, 7, 9];              // C major pentatonic
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
const CAB = new THREE.Vector3(0, -0.42, -0.5);   // the cabinet, relative to your eyes
const ROD = new THREE.Vector3(0.2, -0.38, -0.5); // foot of the pitch rod
const LOOP = new THREE.Vector3(-0.22, -0.34, -0.48);

export class ThereminScene extends BaseScene {
  // opts.bare: just the instrument (no backdrop, no voice of its own), for
  // other scenes to play with it (Theremin monks)
  constructor(opts = {}) {
    super();
    this.bare = !!opts.bare;
    this.wantsPointer = true;
    this.wantsHands = true;
    this.viewPitch = -0.3;
    const U = this.uniforms;
    if (this.bare) this.group.visible = true;

    // a dark stage among the stars, a soft violet haze
    if (!this.bare) this.group.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.008, 0.006, 0.02), vec3(0.05, 0.025, 0.08), fbm(d * 2.2 + vec3(0.0, uTime * 0.006, 0.0)));
          for (int L = 0; L < 2; L++) {
            float fl = float(L);
            vec3 p = d * (160.0 + fl * 180.0), cell = floor(p);
            float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            if (h > 0.987) c += vec3(0.85, 0.85, 1.0) * smoothstep(0.3, 0.0, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 50.0));
          }
          c += vec3(0.4, 0.2, 0.6) * exp(-pow(d.y * 2.5 + 0.3, 2.0)) * 0.12;
          if (d.y < -0.25) c = mix(c, vec3(0.03, 0.02, 0.04) * (0.8 + 0.4 * fbm(d * 40.0)), smoothstep(-0.25, -0.35, d.y));   // a polished dark floor
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));
    if (!this.bare) this.group.add(particles(U, { count: 300, min: [-5, -1, -6], max: [5, 3, 3], vel: [0, 0.02, 0], sway: 0.3, size: [0.005, 0.012], colors: ['#d8c8ff', '#ffd8f0'], alpha: 0.35 }));

    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;

    // the instrument: an art-deco walnut cabinet on slender legs, a brass rod and loop
    const shade = (col, gloss = 0.4) => new THREE.ShaderMaterial({
      uniforms: { uFade: U.uFade, uCol: { value: new THREE.Color(col) }, uGloss: { value: gloss } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uFade, uGloss; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
        void main(){ vec3 n = normalize(vN), L = normalize(vec3(-0.3, 0.8, 0.5));
          float dif = 0.3 + 0.7 * max(dot(n, L), 0.0);
          float spec = pow(max(dot(reflect(-normalize(vV), n), L), 0.0), 30.0) * uGloss;
          vec3 c = uCol * (0.85 + 0.3 * fbm(vec3(vP.x * 40.0, vP.y * 4.0, vP.z * 40.0))) * dif + vec3(1.0, 0.85, 0.6) * spec;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    });
    const walnut = shade('#4a2412', 0.5), brass = shade('#c9a24a', 1.2), dark = shade('#140c08', 0.3);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.2), walnut);
    cab.position.copy(CAB);
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.005), dark);   // its grille
    front.position.copy(CAB).add(new THREE.Vector3(0, 0, 0.101));
    this.rig.add(cab, front);
    for (const x of [-0.2, 0.2]) for (const z of [-0.07, 0.07]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.9, 10), walnut);
      leg.position.copy(CAB).add(new THREE.Vector3(x, -0.51, z));
      this.rig.add(leg);
    }
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.5, 12), brass);
    rod.position.copy(ROD).add(new THREE.Vector3(0, 0.25, 0));
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.004, 8, 40, Math.PI * 1.2), brass);
    loop.rotation.set(-Math.PI / 2, 0, Math.PI * 0.4);
    loop.position.copy(LOOP);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 8), brass);
    arm.rotation.z = Math.PI / 2;
    arm.position.copy(LOOP).add(new THREE.Vector3(0.06, -0.02, 0));
    this.rig.add(rod, loop, arm);
    // a soft lamp glow in the grille, warmer as it plays
    this.lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.06), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uFade: U.uFade, uA: { value: 0 }, uTime: U.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uFade, uA, uTime; varying vec2 vUv; void main(){ float bars = step(0.5, fract(vUv.x * 24.0)); float g = exp(-pow((vUv.x - 0.5) * 2.5, 2.0)) * (0.15 + uA) * (0.6 + 0.4 * bars); gl_FragColor = vec4(vec3(1.0, 0.55, 0.25) * g * uFade, 1.0); }',
    }));
    this.lamp.position.copy(CAB).add(new THREE.Vector3(0, 0, 0.104));
    this.rig.add(this.lamp);

    // field rings: around the rod at your hand's height, and over the loop
    const ringMat = (col) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uFade: U.uFade, uA: { value: 0 }, uCol: { value: new THREE.Color(col) }, uTime: U.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uFade, uA, uTime; uniform vec3 uCol; varying vec2 vUv; void main(){ float w = 0.6 + 0.4 * sin(vUv.x * 60.0 - uTime * 6.0); gl_FragColor = vec4(uCol * uA * w * uFade, 1.0); }',
    });
    this.pitchRings = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(0.97, 1.0, 64, 1), ringMat(['#9ad8ff', '#c8a8ff', '#ff9ad8'][i]));
      m.rotation.x = -Math.PI / 2;
      this.rig.add(m);
      return m;
    });
    this.volRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 64, 1), ringMat('#ffc87a'));
    this.volRing.rotation.x = -Math.PI / 2;
    this.rig.add(this.volRing);

    this.noteLabel = textPlane(U, 0.25, 0.05);
    this.noteLabel.position.copy(ROD).add(new THREE.Vector3(0, 0.62, 0));
    this.rig.add(this.noteLabel);
    this.rodLabel = textPlane(U, 0.16, 0.022); this.rodLabel.userData.set('pitch'); this.rodLabel.material.uniforms.uA.value = 0.3;
    this.rodLabel.position.copy(ROD).add(new THREE.Vector3(0, -0.055, 0.11));
    this.loopLabel = textPlane(U, 0.16, 0.022); this.loopLabel.userData.set('volume'); this.loopLabel.material.uniforms.uA.value = 0.3;
    this.loopLabel.position.copy(LOOP).add(new THREE.Vector3(0, -0.08, 0.1));
    this.rig.add(this.rodLabel, this.loopLabel);

    // free pitch or pentatonic
    let snap = true;
    try { snap = localStorage.getItem('mindlyte-theremin-free') !== '1'; } catch (_) {}
    this.snap = snap;
    this.chip = textPlane(U, 0.5, 0.035);
    this.chip.position.copy(CAB).add(new THREE.Vector3(0, -0.1, 0.13));
    this.rig.add(this.chip);
    this.hint = textPlane(U, 1.0, 0.05);
    this.hint.position.set(0, 0.08, -0.85);
    this.hint.userData.set('Right hand near the rod for pitch · left hand over the loop for volume');
    this.rig.add(this.hint);
    this.hintA = 1;

    this.pitch = 0.4; this.vol = 0; this.f = 261.63;
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

  // the theremin's voice: a near-sine with a little warmth, vibrato and a vocal formant
  _voice() {
    if (this.snd) return this.snd;
    if (this.muted) return null;
    const A = SFX.audio();
    if (!A) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.55; out.connect(send).connect(A.reverb);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = this.f;
    const shape = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 1.6) / Math.tanh(1.6) + 0.06 * x * x; }
    shape.curve = curve;
    const form = ctx.createBiquadFilter(); form.type = 'peaking'; form.frequency.value = 900; form.Q.value = 1.2; form.gain.value = 4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3200;
    o.connect(shape).connect(form).connect(lp).connect(out);
    const vib = ctx.createOscillator(), vg = ctx.createGain();
    vib.frequency.value = 5.2; vg.gain.value = 0;
    vib.connect(vg).connect(o.frequency);
    o.start(); vib.start();
    this.snd = { ctx, out, send, o, vib, vg };
    return this.snd;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const over = (this.hideRays ||= new Set());
    for (const p of INPUT.pointers) if (p.id !== 'mouse') over.add(p.id);   // here you play with your hands, no beams

    // where the hands are: tracked hands (palm), else controllers (left/right by position)
    let right = null, left = null;
    for (const h of INPUT.hands) {
      const P = (h.joints[10] || h.joints[0])?.clone().applyMatrix4(inv);
      if (!P) continue;
      if (h.side === 'right') right = P; else left = P;
    }
    if (!right && !left) {
      for (const p of INPUT.pointers) {
        if (p.id === 'mouse') continue;
        const P = (p.tip || p.origin).clone().applyMatrix4(inv);
        if (P.x > 0) right = right || P; else left = left || P;
      }
    }
    let pitch = null, vol = null;
    if (right) {
      const d = Math.hypot(right.x - ROD.x, right.z - ROD.z);
      pitch = Math.max(0, Math.min(1, 1 - (d - 0.03) / 0.5));   // 3 cm from the rod is the top
      this.rh = right;
    }
    if (left) {
      const hgt = left.y - LOOP.y;
      vol = Math.max(0, Math.min(1, (hgt - 0.02) / 0.3));
    } else if (right && pitch > 0.02) vol = 0.7;   // one hand: a steady volume while it's near
    // on a screen: hold and move the mouse
    const mouse = INPUT.pointers.find((p) => p.id === 'mouse');
    if (mouse && INPUT.held.has('mouse')) {
      const d = mouse.dir.clone().transformDirection(inv);
      pitch = Math.max(0, Math.min(1, 0.5 + d.x * 1.6));
      vol = Math.max(0, Math.min(1, 0.6 + d.y * 2.0));
    }
    if (this.demo) { pitch = 0.45 + 0.35 * Math.sin(t * 0.4) + 0.1 * Math.sin(t * 1.3); vol = 0.6 + 0.3 * Math.sin(t * 0.7); }
    // the chip: tap with a fingertip, or point and press
    for (const p of INPUT.pointers) {
      const press = INPUT.presses.includes(p.id);
      const q = p.tip ? p.tip.clone().applyMatrix4(inv) : null;
      let hit = false;
      if (q) hit = q.distanceTo(this.chip.position) < 0.06;
      else {
        const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
        if (Math.abs(d.z) > 1e-3) { const k = (this.chip.position.z - o.z) / d.z; if (k > 0) { const x = o.addScaledVector(d, k); hit = Math.abs(x.x - this.chip.position.x) < 0.2 && Math.abs(x.y - this.chip.position.y) < 0.025; } }
      }
      const was = this.chipWas?.get(p.id);
      (this.chipWas ||= new Map()).set(p.id, hit);
      if (hit && ((q && !was) || press)) { this.snap = !this.snap; try { localStorage.setItem('mindlyte-theremin-free', this.snap ? '0' : '1'); } catch (_) {} }
    }
    this.chip.userData.set(this.bare ? (this.snap ? '\u25c9 Harmonic steps   \u25cb Glide' : '\u25cb Harmonic steps   \u25c9 Glide') : this.snap ? '\u25c9 Pentatonic   \u25cb Free pitch' : '\u25cb Pentatonic   \u25c9 Free pitch');
    this.chip.material.uniforms.uA.value = 0.55;

    if (pitch != null) this.pitch += (pitch - this.pitch) * Math.min(1, dt * 18);
    this.vol += ((vol ?? 0) - this.vol) * Math.min(1, dt * 10);
    if (this.vol > 0.05) this.hintA = Math.min(this.hintA, 0.99);
    // pitch: exponential across three octaves; in pentatonic mode it settles on the nearest note
    let semis = this.pitch * OCTAVES * 12;
    if (this.snap) {
      const oct = Math.floor(semis / 12), within = semis - oct * 12;
      let best = 0, bd = 99;
      for (const s of [...PENTA, 12]) if (Math.abs(s - within) < bd) { bd = Math.abs(s - within); best = s; }
      semis = oct * 12 + best;
    }
    const target = LOW * 2 ** (semis / 12);
    this.f += (target - this.f) * Math.min(1, dt * (this.snap ? 9 : 25));   // a singing glide between notes
    const S = this.bare ? null : this.vol > 0.003 ? this._voice() : this.snd;
    if (S) {
      const now = S.ctx.currentTime;
      S.o.frequency.setTargetAtTime(this.f, now, 0.015);
      S.vg.gain.setTargetAtTime(this.f * 0.006 * Math.min(1, this.vol * 2), now, 0.3);
      S.out.gain.setTargetAtTime(this.vol * this.vol * 0.14 * this.fade, now, 0.03);
    }
    const n = Math.round(12 * Math.log2(this.f / 16.3516));
    this.noteLabel.userData.set(this.vol > 0.03 ? this.label?.() ?? `${NAMES[((n % 12) + 12) % 12]}${Math.floor(n / 12)}` : '');
    this.noteLabel.material.uniforms.uA.value = Math.min(0.8, this.vol * 1.5);
    this.lamp.material.uniforms.uA.value = this.vol * 0.8;

    // the fields
    const rh = this.rh || new THREE.Vector3(ROD.x + 0.2, ROD.y + 0.2, ROD.z);
    const rr = Math.max(0.03, Math.hypot(rh.x - ROD.x, rh.z - ROD.z));
    this.pitchRings.forEach((m, i) => {
      m.position.set(ROD.x, Math.max(ROD.y, Math.min(ROD.y + 0.5, rh.y)) + (i - 1) * 0.015, ROD.z);
      m.scale.setScalar(rr * (0.6 + i * 0.25) * (1 + 0.05 * Math.sin(t * 6 + i)));
      m.material.uniforms.uA.value = this.vol * (0.5 - i * 0.12) * 1.2 + 0.03;
    });
    this.volRing.position.set(LOOP.x, LOOP.y + 0.02 + this.vol * 0.25, LOOP.z);
    this.volRing.scale.setScalar(0.07 + this.vol * 0.03);
    this.volRing.material.uniforms.uA.value = 0.05 + this.vol * 0.6;
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.2);
    this.hint.material.uniforms.uA.value = (0.25 + 0.35 * Math.min(1, t * 0.5)) * this.hintA;
  }

  _stop() {
    const S = this.snd;
    if (!S) return;
    const end = S.ctx.currentTime + 0.5;
    S.out.gain.setTargetAtTime(0, S.ctx.currentTime, 0.08);
    try { S.o.stop(end); S.vib.stop(end); } catch (_) {}
    setTimeout(() => { try { S.out.disconnect(); S.send.disconnect(); } catch (_) {} }, 800);
    this.snd = null;
  }
  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
