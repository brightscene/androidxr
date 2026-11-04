import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SOFT_DOT, SFX, damp } from '../common.js';

const smoothstep01 = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
import { particles } from './kit.js';

// Quantum field: a glowing atom hangs before you in teal smoke and soft
// bokeh light: a boiling cloud of golden particles at its heart, ribbons of
// orbital light with electrons racing round them. Every so often the field
// erupts: ice-clear crystals burst outward around a blinding core, rings of
// measuring dials turn, light streaks fly past, then it all settles back.

const C = new THREE.Vector3(0, 1.7, -4.2);
const VERT_UV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';

export class QuantumScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uPulse: { value: 0 }, uBurst: { value: 0 }, uSpinQ: { value: 0 } });
    // teal smoke and darkness, warmer toward the atom
    const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uBurst, uPulse; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir);
          vec3 toC = normalize(vec3(0.0, 0.0, -1.0));
          float ahead = max(dot(d, toC), 0.0);
          float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.012, 0.0));
          float wisp = smoothstep(0.08, 0.0, abs(fbm(d * 3.5 + n * 1.8 + vec3(uTime * 0.02)) - 0.5));
          vec3 c = vec3(0.01, 0.03, 0.045) + vec3(0.02, 0.16, 0.2) * smoothstep(0.35, 0.85, n) * 0.6;
          c += vec3(0.1, 0.45, 0.5) * wisp * 0.22;
          c += vec3(0.6, 0.22, 0.08) * pow(ahead, 6.0) * (0.25 + uPulse * 0.1 + uBurst * 0.5);
          vec2 st = starDot(d, 260.0, 0.99); c += mix(vec3(1.0, 0.7, 0.45), vec3(0.7, 0.95, 1.0), st.y) * st.x * 0.8;
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    dome.renderOrder = -5;
    this.group.add(dome);

    this.atom = new THREE.Group();
    this.atom.position.copy(C);
    this.group.add(this.atom);
    // the nucleus: a boiling cloud of fine golden particles
    const NP = 4000, np = new Float32Array(NP * 3), ns = new Float32Array(NP);
    for (let i = 0; i < NP; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(Math.pow(Math.random(), 0.6) * 0.62);
      np.set([v.x, v.y, v.z], i * 3); ns[i] = Math.random();
    }
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.BufferAttribute(np, 3));
    ng.setAttribute('aSeed', new THREE.BufferAttribute(ns, 1));
    const nucleus = new THREE.Points(ng, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uViewH, uPulse, uBurst; varying float vA; varying float vR; ${NOISE} ${POINT_SIZE}
        void main(){ vec3 p = position;
          float boil = fbm(p * 3.0 + vec3(uTime * 0.25)) - 0.5;
          p *= 1.0 + boil * 0.5 + uPulse * 0.08 + uBurst * 0.25;
          vR = length(position) / 0.62;
          vA = 0.35 + 0.65 * smoothstep(0.2, 0.7, fbm(p * 5.0 + uTime * 0.4));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = pointPx(0.012 + aSeed * 0.012, mv);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vA; varying float vR; ${SOFT_DOT}
        void main(){ vec3 c = mix(vec3(1.0, 0.85, 0.5), vec3(0.95, 0.35, 0.12), smoothstep(0.1, 0.9, vR));
          gl_FragColor = vec4(c * softDot() * vA * 0.75 * uFade, 1.0); }`,
    }));
    this.atom.add(nucleus);
    const core = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: VERT_UV,
      fragmentShader: /* glsl */ `uniform float uFade, uPulse, uBurst, uTime; varying vec2 vUv;
        void main(){ vec2 p = (vUv - 0.5) * 2.0; float r = length(p);
          float rays = pow(abs(sin(atan(p.y, p.x) * 6.0 + uTime * 0.2)), 30.0) * exp(-r * 3.0) * uBurst;
          vec3 c = vec3(1.0, 0.75, 0.4) * (exp(-r * r * 22.0) * (0.9 + uPulse * 0.5 + uBurst * 2.0) + exp(-r * 3.5) * 0.25) + vec3(1.0, 0.9, 0.7) * rays;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    }));
    this.core = core;
    this.atom.add(core);

    // orbitals: bundles of fine glowing ellipses, each with an electron and its trail
    this.orbits = [];
    const orbitMat = () => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uE: { value: 0 } },
      vertexShader: 'attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uE, uPulse; varying float vA;
        void main(){ float d = mod(uE - vA, 6.28318);                   // how far behind the electron
          float trail = exp(-d * 1.4);
          vec3 c = vec3(1.0, 0.55, 0.3) * (0.35 + uPulse * 0.2) + vec3(1.0, 0.85, 0.65) * trail * 1.4;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    });
    const tilts = [[0.4, 0.2, 0], [-0.9, 0.9, 0.4], [1.2, -0.6, 1.0], [0.1, 1.4, -0.7]];
    tilts.forEach((tilt, k) => {
      const grp = new THREE.Group();
      grp.rotation.set(...tilt);
      const mat = orbitMat();
      for (let s = 0; s < 3; s++) {
        const pts = [], aa = [];
        const a = 1.55 + s * 0.035 + k * 0.08, b = 0.62 + s * 0.02;
        for (let i = 0; i <= 256; i++) { const t = (i / 256) * Math.PI * 2; pts.push(Math.cos(t) * a, Math.sin(t) * b, 0); aa.push(t); }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        g.setAttribute('aA', new THREE.Float32BufferAttribute(aa, 1));
        grp.add(new THREE.Line(g, mat));
      }
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U, vertexShader: VERT_UV,
        fragmentShader: 'uniform float uFade; varying vec2 vUv; void main(){ float r = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(vec3(1.0, 0.6, 0.3) * exp(-r * r * 9.0) * uFade, 1.0); }',
      }));
      e.add(halo);
      grp.add(e);
      this.atom.add(grp);
      this.orbits.push({ grp, mat, e, halo, a: 1.6 + k * 0.08, b: 0.64, ang: Math.random() * 6.28, speed: 0.8 + k * 0.22 });
    });

    // the explosion: a flash, a shockwave shell, a turbulent fireball cooling as it
    // swells, a glowing ring in its plane and a spray of sparks slowing as they fly
    this.boom = new THREE.Group();
    this.atom.parent ? this.atom.parent.add(this.boom) : this.group.add(this.boom);
    this.boom.position.copy(this.atom.position);
    const BU = { ...U, uBT: { value: 99 } };
    this.BU = BU;
    const VV = 'varying vec3 vN; varying vec3 vV; varying vec3 vP;';
    this.fireball = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: BU,
      vertexShader: /* glsl */ `uniform float uBT; ${VV} ${NOISE}
        void main(){ vec3 p = position;
          float n = vnoise(p * 3.5 + uBT * 0.6) * 0.55 + vnoise(p * 8.0 - uBT * 0.9) * 0.3 + vnoise(p * 16.0 + uBT) * 0.15;
          p *= 0.82 + n * 0.36;                                   // billowing, turbulent edge
          vP = position; vN = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uBT, uFade; ${VV} ${NOISE}
        void main(){ float f = abs(dot(normalize(vN), normalize(vV)));
          float n = vnoise(vP * 4.0 + uBT * 0.7) * 0.5 + vnoise(vP * 10.0 - uBT * 1.3) * 0.35 + vnoise(vP * 22.0) * 0.15;
          // white-hot to gold to orange to deep red-violet as it cools
          float heat = clamp(1.4 - uBT * 0.32 + (n - 0.5) * 0.8 + f * 0.5, 0.0, 1.4);
          vec3 c = heat > 1.0 ? mix(vec3(1.0, 0.75, 0.4), vec3(1.0, 0.97, 0.9), heat - 1.0)
                 : heat > 0.55 ? mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.75, 0.4), (heat - 0.55) / 0.45)
                 : mix(vec3(0.25, 0.03, 0.12), vec3(1.0, 0.35, 0.08), heat / 0.55);
          float body = pow(f, 1.5) * (0.6 + 0.8 * n);              // dense at the heart, wispy at the rim
          float life = exp(-uBT * 0.6) * smoothstep(0.0, 0.15, uBT);
          gl_FragColor = vec4(c * body * life * 1.4 * uFade, 1.0); }`,
    }));
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: BU,
      vertexShader: `${VV} void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uBT, uFade; ${VV}
        void main(){ float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 5.0);
          float life = exp(-uBT * 1.6);
          gl_FragColor = vec4(vec3(0.75, 0.88, 1.0) * rim * life * 1.6 * uFade, 1.0); }`,
    }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.0, 160, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: BU,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uBT, uFade; varying vec2 vP; ${NOISE}
        void main(){ float r = length(vP), a = atan(vP.y, vP.x);
          float band = smoothstep(0.85, 0.97, r) * smoothstep(1.0, 0.97, r);
          float n = vnoise(vec3(a * 6.0, r * 4.0, uBT));
          gl_FragColor = vec4(mix(vec3(1.0, 0.5, 0.15), vec3(0.6, 0.8, 1.0), n) * band * (0.5 + n) * exp(-uBT * 0.7) * uFade, 1.0); }`,
    }));
    this.ring.rotation.x = -1.2;
    const SN = 1200, sd = new Float32Array(SN * 3), ss = new Float32Array(SN);
    for (let i = 0; i < SN; i++) { const v = new THREE.Vector3().randomDirection(); sd.set([v.x, v.y, v.z], i * 3); ss[i] = Math.random(); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sd, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    this.sparks = new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: BU,
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uBT, uViewH; varying float vA; varying float vH; ${POINT_SIZE}
        void main(){ float v = 4.0 + aSeed * 12.0, k = 0.9 + aSeed * 0.8;
          float dist = v * (1.0 - exp(-uBT * k)) / k;             // fly out, slowed by drag
          vec3 p = position * dist + vec3(0.0, -0.25, 0.0) * uBT * uBT * aSeed;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = pointPx(0.035 + aSeed * 0.04, mv);
          vH = clamp(1.0 - uBT * 0.35 * (0.6 + aSeed), 0.0, 1.0);
          vA = smoothstep(0.0, 0.05, uBT) * vH;
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vA; varying float vH; ${SOFT_DOT}
        void main(){ vec3 c = mix(vec3(1.0, 0.3, 0.06), vec3(1.0, 0.95, 0.8), vH);
          gl_FragColor = vec4(c * softDot() * vA * 1.6 * uFade, 1.0); }`,
    }));
    for (const m of [this.fireball, this.shell, this.ring, this.sparks]) { m.frustumCulled = false; m.visible = false; this.boom.add(m); }

    // soft bokeh lights and fine dust drifting all around
    this.group.add(particles(U, { count: 140, min: [-9, -1, -14], max: [9, 6, 3], vel: [0.03, 0.04, 0], sway: 0.5, size: [0.15, 0.45], colors: ['#ff8a50', '#ff6a3a', '#5fd0d8', '#ffb070'], alpha: 0.22 }));
    this.group.add(particles(U, { count: 900, min: [-10, -1, -14], max: [10, 7, 4], vel: [0.02, 0.03, 0.02], sway: 0.3, size: [0.008, 0.02], colors: ['#ffd0a0', '#c8f4ff', '#ffffff'], alpha: 0.75 }));

    this.burstT = 0;
    this.nextBurst = 25;
    this.bursting = null;
  }

  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'section' && e.index > 0 && !this.bursting) this.bursting = { t: 0 };
  }

  // as the field expands: a harmonic drone blooms and slowly settles, the
  // harmonic series of a low A stacking in one by one, with a soft shimmer
  _bloom() {
    if (this.muted) return;
    const A = SFX.audio();
    if (!A) return;
    const { ctx } = A, now = ctx.currentTime;
    const out = ctx.createGain(); out.gain.value = 0.9 * this.fade;
    out.connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.9; out.connect(send).connect(A.reverb);
    const f0 = 55, oscs = [];
    [[1, 0.5], [2, 0.35], [3, 0.22], [4, 0.14], [5, 0.1], [6, 0.08], [8, 0.05], [10, 0.03]].forEach(([h, w], i) => {
      for (const det of [-0.4, 0.4]) {
        const o = ctx.createOscillator(); o.type = 'sine';
        o.frequency.value = f0 * h + det * (0.3 + i * 0.15);
        const g = ctx.createGain();
        const at = now + i * 0.35;                       // each harmonic joins a little later
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(w * 0.05, at + 1.6);
        g.gain.setTargetAtTime(0, at + 3.5, 2.6);
        o.connect(g).connect(out);
        o.start(now); o.stop(now + 16);
        oscs.push(o);
      }
    });
    this.bloomNodes = { out, send, oscs, ctx };
    setTimeout(() => { try { out.disconnect(); send.disconnect(); } catch (_) {} }, 16500);
  }

  silence() { const B = this.bloomNodes; if (B) { B.out.gain.setTargetAtTime(0, B.ctx.currentTime, 0.1); } this.muted = true; }

  update(dt, t, s) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.4);
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && !this.bursting) this.bursting = { t: 0 };
    // the explosion, then the atom slowly re-forms
    let flash = 0, hide = 0;
    const BT = this.bursting ? (this.bursting.t += dt) : 99;
    if (this.bursting && BT > 12) { this.bursting = null; this.nextBurst = 45 + Math.random() * 25; }
    if (this.bursting && BT < 0.02 && this.fade > 0.5 && !this.bloomed) { this.bloomed = true; this._bloom(); SFX.play('whoosh', { pan: 0, dur: 6, gain: 0.25 }); }
    if (!this.bursting) this.bloomed = false;
    if (BT < 12) {
      flash = Math.exp(-BT * 5) * smoothstep01(BT / 0.06);
      hide = smoothstep01(BT / 0.15) * (1 - smoothstep01((BT - 7) / 4));
    }
    this.BU.uBT.value = BT;
    const live = BT < 12;
    this.fireball.visible = live; this.shell.visible = BT < 3.5; this.ring.visible = BT < 6; this.sparks.visible = BT < 5;
    if (live) {
      this.fireball.scale.setScalar(0.2 + 2.5 * (1 - Math.exp(-BT * 0.9)));
      this.shell.scale.setScalar(0.3 + 13 * (1 - Math.exp(-BT * 1.4)));
      this.ring.scale.setScalar(0.3 + 9 * (1 - Math.exp(-BT * 0.8)));
      this.boom.rotation.y += dt * 0.05;
    }
    U.uBurst.value = flash * 1.5 + hide * 0.15;
    for (const o of this.orbits) o.grp.scale.setScalar(Math.max(0.001, 1 - hide));
    this.core.scale.setScalar(Math.max(0.001, 1 - hide * 0.9));
    // electrons race round their orbits, faster on the beat
    for (const o of this.orbits) {
      o.ang += dt * o.speed;
      o.e.position.set(Math.cos(o.ang) * o.a, Math.sin(o.ang) * o.b, 0);
      o.mat.uniforms.uE.value = o.ang % (Math.PI * 2);
      o.halo.quaternion.copy(o.grp.getWorldQuaternion(new THREE.Quaternion()).invert());
      o.grp.rotation.y += dt * 0.05;
    }
    this.atom.rotation.y = Math.sin(t * 0.05) * 0.3;
    this.core.rotation.y = -this.atom.rotation.y;
    this.atom.scale.setScalar(1 + (s?.breath || 0) * 0.04);
  }
}
