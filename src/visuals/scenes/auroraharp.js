import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Aurora resonance
// An instrument of light. Beneath a polar night, nine curtains of aurora hang
// in an arc around you. Sweep your hands through them: each curtain ripples
// where you touch it and sings a slow, glassy tone that swells and lingers.
//
// The nine are tuned to the harmonic series of the monks' low C (partials 2,
// 3, 4, 5, 6, 8, 9, 10 and 12), in just intonation: together they make an
// open C major ninth, the most restful of chords. Whatever you stack, in any
// order, it's consonant: no tone beats against another. And the curtains
// resonate with one another: while some sing, the rest hum softly along, the
// way strings sound in sympathy. The more harmonics you stack, the brighter
// the whole sky's aurora grows.

const F0 = 65.41;
const PARTIALS = [2, 3, 4, 5, 6, 8, 9, 10, 12];
const NAMES = ['C', 'G', 'C', 'E', 'G', 'C', 'D', 'E', 'G'];
const ARC_R = 0.7, SPREAD = 0.22, BOTTOM = -0.45, TOP = 0.85, WIDTH = 0.11;

export class AuroraResonanceScene extends BaseScene {
  constructor() {
    super();
    this.wantsPointer = true;
    this.wantsHands = true;
    this.viewPitch = 0.05;
    const U = this.uniforms;
    this.skyU = { ...U, uGlow: { value: 0 } };

    // the polar night: stars, a faint ever-present aurora that blooms as you play, snowfields below
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.skyU,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uGlow; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.01, 0.015, 0.04), vec3(0.0, 0.004, 0.015), smoothstep(0.0, 0.9, d.y));
          for (int L = 0; L < 3; L++) {
            float fl = float(L);
            vec3 p = d * (150.0 + fl * 170.0), cell = floor(p);
            float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
            if (h > 0.985 - fl * 0.005) {
              vec3 o = 0.3 + 0.4 * fract(sin(cell * vec3(91.7, 47.3, 23.1)) * 4375.85);
              c += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.8), fract(h * 37.0)) * smoothstep(0.32, 0.0, length(fract(p) - o)) * (0.55 + 0.45 * sin(uTime * (0.8 + h * 4.0) + h * 70.0)) * (1.2 - fl * 0.3) * smoothstep(-0.02, 0.1, d.y);
            }
          }
          // the sky's aurora: soft bands that brighten with the chord
          if (d.y > 0.0) {
            float az = atan(d.x, -d.z);
            vec2 q = vec2(az * 1.5 + 0.3 * sin(d.y * 4.0 + uTime * 0.05), d.y);
            float band = fbm(vec3(q.x * 2.0, q.y * 0.6, uTime * 0.03));
            float curtain = smoothstep(0.45, 0.75, band) * smoothstep(0.08, 0.3, d.y) * smoothstep(0.95, 0.4, d.y);
            float rays = 0.6 + 0.4 * fbm(vec3(q.x * 30.0, uTime * 0.2, 2.0));
            vec3 ac = mix(vec3(0.1, 0.9, 0.5), vec3(0.6, 0.3, 1.0), smoothstep(0.3, 0.8, d.y)) + vec3(1.0, 0.3, 0.6) * smoothstep(0.65, 0.9, band) * 0.4;
            c += ac * curtain * rays * (0.12 + uGlow * 0.9);
          } else {
            c = mix(vec3(0.05, 0.06, 0.1), vec3(0.12, 0.14, 0.2), fbm(d * 20.0)) * (0.5 + 0.5 * smoothstep(-0.3, 0.0, d.y));
            c += vec3(0.1, 0.5, 0.35) * uGlow * 0.15 * smoothstep(-0.4, 0.0, d.y);   // the snow catching the light
          }
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));
    this.group.add(particles(U, { count: 400, min: [-6, -1, -6], max: [6, 4, 6], vel: [0.02, -0.05, 0], sway: 0.5, size: [0.006, 0.014], colors: ['#e8f0ff', '#c8ffe8'], alpha: 0.45 }));

    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;

    // the nine curtains
    this.curtains = PARTIALS.map((n, k) => {
      const a = (k - (PARTIALS.length - 1) / 2) * SPREAD;
      const col1 = new THREE.Color().setHSL(0.36 + k * 0.065, 0.85, 0.55), col2 = new THREE.Color().setHSL(0.5 + k * 0.06, 0.8, 0.62);
      const u = { uTime: U.uTime, uFade: U.uFade, uE: { value: 0 }, uHum: { value: 0 }, uHitY: { value: 0 }, uHitT: { value: -9 }, uC1: { value: col1 }, uC2: { value: col2 }, uSeed: { value: k * 3.7 } };
      const m = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, TOP - BOTTOM, 1, 1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: u,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uTime, uFade, uE, uHum, uHitY, uHitT, uSeed; uniform vec3 uC1, uC2; varying vec2 vUv; ${NOISE}
          void main(){
            float y = vUv.y, x = vUv.x;
            // a ripple running up and down the curtain from where you touched it
            float age = uTime - uHitT;
            float rip = sin((abs(y - uHitY) - age * 0.6) * 40.0) * exp(-abs(abs(y - uHitY) - age * 0.6) * 6.0) * exp(-age * 1.2);
            float fold = x + 0.18 * sin(y * 7.0 + uTime * 0.4 + uSeed) + 0.06 * rip;
            float rays = pow(fbm(vec3(fold * 14.0, y * 0.8 - uTime * 0.1, uSeed)), 2.0) * 2.2;   // fine vertical rays
            float edge = smoothstep(0.0, 0.4, fold) * smoothstep(1.0, 0.6, fold);
            float vert = smoothstep(0.0, 0.25, y) * pow(1.0 - y, 0.6);
            vec3 c = mix(uC1, uC2, smoothstep(0.35, 1.0, y));
            float level = 0.045 + uHum * 0.3 + uE * 1.3;
            c *= rays * edge * vert * level;
            c += mix(uC1, vec3(1.0), 0.5) * smoothstep(0.03, 0.0, abs(y - 0.03)) * edge * (0.15 + uE * 0.6);   // a bright hem
            gl_FragColor = vec4(c * uFade * 0.9, 1.0); }`,
      }));
      m.position.set(Math.sin(a) * ARC_R, (TOP + BOTTOM) / 2, -Math.cos(a) * ARC_R);
      m.rotation.y = -a;
      this.rig.add(m);
      const label = textPlane(U, 0.06, 0.022);
      label.userData.set(NAMES[k]);
      label.material.uniforms.uA.value = 0.3;
      label.position.set(Math.sin(a) * (ARC_R - 0.02), BOTTOM - 0.03, -Math.cos(a) * (ARC_R - 0.02));
      label.rotation.y = -a;
      this.rig.add(label);
      return { k, n, f: F0 * n, a, m, u, e: 0, hum: 0, side: new Map(), node: null };
    });

    this.hint = textPlane(U, 0.9, 0.05);
    this.hint.position.set(0, BOTTOM - 0.1, -ARC_R + 0.02);
    this.hint.userData.set('Sweep your hands through the curtains of light · every harmony here is in tune');
    this.rig.add(this.hint);
    this.hintA = 1;
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

  // where a point sits relative to a curtain: across it (0..1), up it (0..1), and which side
  _rel(c, p) {
    const ang = Math.atan2(p.x, -p.z);
    const across = (ang - c.a) * Math.hypot(p.x, p.z) / WIDTH + 0.5;
    return { across, up: (p.y - BOTTOM) / (TOP - BOTTOM), side: Math.hypot(p.x, p.z) - ARC_R };
  }

  _excite(c, strength, up) {
    c.e = Math.min(1, c.e + strength);
    c.u.uHitY.value = Math.max(0, Math.min(1, up));
    c.u.uHitT.value = this.uniforms.uTime.value;
    this.hintA = Math.min(this.hintA, 0.99);
  }

  // a tone for each curtain: a soft glassy voice (fundamental, octave and twelfth, gently chorused)
  _voice(c) {
    if (c.node) return c.node;
    if (this.muted) return null;
    const A = SFX.audio();
    if (!A) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-0.85, Math.min(0.85, Math.sin(c.a) * 1.4));
    out.connect(pan).connect(A.out);
    const send = ctx.createGain(); send.gain.value = 1.0; pan.connect(send).connect(A.reverb);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.min(6000, c.f * 5); lp.Q.value = 0.4;
    lp.connect(out);
    const oscs = [[1, 0.6, 0], [1, 0.4, 0.35], [2, 0.18, -0.2], [3, 0.07, 0.15]].map(([r, w, det]) => {
      const o = ctx.createOscillator(); o.type = r === 1 && det ? 'triangle' : 'sine';
      o.frequency.value = c.f * r; o.detune.value = det * 6;
      const g = ctx.createGain(); g.gain.value = w;
      o.connect(g).connect(lp); o.start();
      return o;
    });
    // a slow shimmer on each voice
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.15 + c.k * 0.03; lg.gain.value = 0.15;
    lfo.connect(lg).connect(out.gain); lfo.start();
    c.node = { ctx, out, pan, send, oscs, lfo, quiet: 0 };
    return c.node;
  }

  _silence(c) {
    const N = c.node;
    if (!N) return;
    const end = N.ctx.currentTime + 0.6;
    N.out.gain.cancelScheduledValues(N.ctx.currentTime);
    N.out.gain.setTargetAtTime(0, N.ctx.currentTime, 0.12);
    for (const o of [...N.oscs, N.lfo]) try { o.stop(end); } catch (_) {}
    setTimeout(() => { try { N.pan.disconnect(); N.send.disconnect(); } catch (_) {} }, 900);
    c.node = null;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    const over = (this.hideRays ||= new Set());
    over.clear();

    // hands (and controllers) passing through a curtain
    const touchers = [];
    for (const h of INPUT.hands) { const J = h.joints; for (const j of [9, 14, 19]) if (J[j]) touchers.push({ id: h.side + j, p: J[j].clone().applyMatrix4(inv) }); }
    for (const p of pointers) {
      if (p.tip) continue;
      if (p.id !== 'mouse' && p.id !== 'demo' && !INPUT.hands.length) touchers.push({ id: 'c' + p.id, p: p.origin.clone().applyMatrix4(inv) });
      // pointing: sweep across the curtains while pressing, or tap one
      const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
      // where the ray meets the arc
      const b = o.x * d.x + o.z * d.z, a2 = d.x * d.x + d.z * d.z, cc = o.x * o.x + o.z * o.z - ARC_R * ARC_R;
      const disc = b * b - a2 * cc;
      if (a2 < 1e-6 || disc < 0) continue;
      const k = (-b + Math.sqrt(disc)) / a2;
      if (k <= 0) continue;
      const q = o.addScaledVector(d, k);
      const ang = Math.atan2(q.x, -q.z), up = (q.y - BOTTOM) / (TOP - BOTTOM);
      if (up < -0.05 || up > 1.05 || Math.abs(ang) > SPREAD * 5) continue;
      over.add(p.id);
      const pressing = INPUT.presses.includes(p.id) || p.press || INPUT.held.has(p.id) || p.held;
      const ci = Math.round(ang / SPREAD + (PARTIALS.length - 1) / 2);
      const c = this.curtains[ci];
      if (!c) continue;
      const last = this.rayLast?.get(p.id);
      (this.rayLast ||= new Map()).set(p.id, ci);
      if (pressing && (last !== ci || INPUT.presses.includes(p.id) || p.press)) this._excite(c, 0.7, up);
    }
    for (const tch of touchers) {
      for (const c of this.curtains) {
        const r = this._rel(c, tch.p);
        const prev = c.side.get(tch.id);
        c.side.set(tch.id, r);
        if (!prev) continue;
        if (r.across < -0.1 || r.across > 1.1 || r.up < -0.05 || r.up > 1.05) continue;
        // crossing through the curtain, or brushing along it
        if (Math.sign(prev.side) !== Math.sign(r.side) && Math.abs(r.side) < 0.12) {
          const sp = Math.abs(r.side - prev.side) / Math.max(dt, 1e-3);
          this._excite(c, Math.min(1, 0.35 + sp * 0.5), r.up);
        }
        if (Math.abs(r.side) < 0.1) over.add(tch.id);
      }
    }

    // sustain, sympathy and the sky
    let total = 0;
    for (const c of this.curtains) total += c.e;
    const sky = this.skyU.uGlow;
    sky.value += (Math.min(1, total / 3) - sky.value) * Math.min(1, dt * 1.2);
    for (const c of this.curtains) {
      c.e *= Math.exp(-dt / 7);   // a long, slow fade
      c.hum += (Math.min(0.5, (total - c.e) * 0.12) - c.hum) * Math.min(1, dt * 0.8);   // the others hum in sympathy
      c.u.uE.value = c.e;
      c.u.uHum.value = c.hum;
      const level = c.e * 0.1 + c.hum * 0.03;
      const N = level > 0.0008 ? this._voice(c) : c.node;
      if (N) {
        N.out.gain.setTargetAtTime(level * this.fade * (c.n > 8 ? 0.7 : 1), N.ctx.currentTime, 0.25);   // a slow, bowed swell
        N.quiet = level > 0.0008 ? 0 : N.quiet + dt;
        if (N.quiet > 2) this._silence(c);
      }
    }
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.2);
    this.hint.material.uniforms.uA.value = (0.25 + 0.35 * Math.min(1, t * 0.5)) * this.hintA;
  }

  // for previews: a slow sweep back and forth through the curtains
  _demoPointers(t) {
    const ang = Math.sin(t * 0.45) * SPREAD * 4.4;
    const q = new THREE.Vector3(Math.sin(ang) * ARC_R, 0.1 + Math.sin(t * 0.9) * 0.3, -Math.cos(ang) * ARC_R).applyMatrix4(this.rig.matrixWorld);
    const o = new THREE.Vector3(0, 0, 0).applyMatrix4(this.rig.matrixWorld);
    return [{ id: 'demo', origin: o, dir: q.sub(o).normalize(), tip: null, held: true }];
  }

  silence() { for (const c of this.curtains || []) this._silence(c); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) for (const c of this.curtains || []) this._silence(c); }
  dispose() { for (const c of this.curtains || []) this._silence(c); super.dispose(); }
}
