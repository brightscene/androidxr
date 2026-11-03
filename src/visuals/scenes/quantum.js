import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SOFT_DOT, damp } from '../common.js';
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

    // the burst: ice-clear crystals, dial rings and light streaks
    this.crystals = [];
    const crystalMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: U,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: /* glsl */ `uniform float uFade, uBurst; varying vec3 vN; varying vec3 vV;
        void main(){ float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
          vec3 c = mix(vec3(0.55, 0.75, 1.0), vec3(1.0), pow(f, 3.0)) * (0.12 + pow(f, 2.0) * 0.9);
          gl_FragColor = vec4(c * uBurst * uFade, 1.0); }`,
    });
    for (let i = 0; i < 34; i++) {
      const len = 0.5 + Math.random() * 0.9;
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.09 + Math.random() * 0.06, len * 0.5, 0.09 + Math.random() * 0.06);
      g.translate(0, len * 0.5, 0);
      const m = new THREE.Mesh(g, crystalMat);
      const dir = new THREE.Vector3().randomDirection();
      dir.z = dir.z * 0.4 + 0.3;    // mostly facing you, like a flower of ice
      dir.normalize();
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      m.userData = { dir, dist: 0.35 + Math.random() * 0.3 };
      this.atom.add(m);
      this.crystals.push(m);
    }
    this.dials = [2.2, 2.9].map((R, i) => {
      const m = new THREE.Mesh(new THREE.RingGeometry(R, R + 0.1, 192, 1), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { ...U, uR: { value: R } },
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uFade, uBurst, uR; varying vec2 vP;
          void main(){ float a = atan(vP.y, vP.x), r = length(vP) - uR;
            float ticks = smoothstep(0.25, 0.0, abs(fract(a / 6.28318 * 120.0) - 0.5) - 0.2) * step(0.06, r);
            float major = smoothstep(0.3, 0.0, abs(fract(a / 6.28318 * 12.0) - 0.5) - 0.46);
            float line = smoothstep(0.012, 0.0, abs(r - 0.03));
            float k = max(max(ticks * 0.6, major), line);
            gl_FragColor = vec4(vec3(0.7, 0.85, 1.0) * k * 0.32 * uBurst * uFade, 1.0); }`,
      }));
      m.rotation.x = -0.25 + i * 0.12;
      this.atom.add(m);
      return m;
    });
    // streaks flying out from the core during a burst
    const SN = 600, sp = new Float32Array(SN * 3), ss = new Float32Array(SN);
    for (let i = 0; i < SN; i++) { const v = new THREE.Vector3().randomDirection(); sp.set([v.x, v.y, v.z], i * 3); ss[i] = Math.random(); }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    this.atom.add(new THREE.Points(sg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uViewH, uBurst; varying float vA; ${POINT_SIZE}
        void main(){ float k = fract(uTime * (0.25 + aSeed * 0.35) + aSeed * 7.0);
          vec3 p = position * (0.4 + k * 9.0);
          vA = (1.0 - k) * uBurst;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = pointPx(0.03 + aSeed * 0.03, mv);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vA; ${SOFT_DOT}
        void main(){ gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * softDot() * vA * uFade, 1.0); }`,
    })));

    // soft bokeh lights and fine dust drifting all around
    this.group.add(particles(U, { count: 140, min: [-9, -1, -14], max: [9, 6, 3], vel: [0.03, 0.04, 0], sway: 0.5, size: [0.15, 0.45], colors: ['#ff8a50', '#ff6a3a', '#5fd0d8', '#ffb070'], alpha: 0.22 }));
    this.group.add(particles(U, { count: 900, min: [-10, -1, -14], max: [10, 7, 4], vel: [0.02, 0.03, 0.02], sway: 0.3, size: [0.008, 0.02], colors: ['#ffd0a0', '#c8f4ff', '#ffffff'], alpha: 0.75 }));

    this.burstT = 0;
    this.nextBurst = 25;
    this.bursting = null;
  }

  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'beat') U.uPulse.value = Math.min(1, U.uPulse.value + (e.accent ? 0.6 : 0.2));
    if (e.type === 'section' && e.index > 0 && !this.bursting) this.bursting = { t: 0 };
  }

  update(dt, t, s) {
    const U = this.uniforms;
    U.uPulse.value *= Math.exp(-dt * 2.4);
    this.nextBurst -= dt;
    if (this.nextBurst <= 0 && !this.bursting) this.bursting = { t: 0 };
    // a burst: crystals spring out, hold, and draw back in
    let burst = 0;
    if (this.bursting) {
      const b = this.bursting; b.t += dt;
      burst = b.t < 1.2 ? 1 - Math.pow(1 - b.t / 1.2, 3) : b.t < 7 ? 1 : Math.max(0, 1 - (b.t - 7) / 3);
      if (b.t > 10) { this.bursting = null; this.nextBurst = 40 + Math.random() * 25; }
    }
    U.uBurst.value = burst;
    this.crystals.forEach((m, i) => {
      const d = m.userData;
      const k = burst * (0.6 + 0.4 * Math.sin(t * 0.5 + i));
      m.position.copy(d.dir).multiplyScalar(d.dist * k);
      m.scale.setScalar(Math.max(0.001, k));
      m.visible = burst > 0.01;
    });
    this.dials[0].rotation.z += dt * 0.15; this.dials[1].rotation.z -= dt * 0.09;
    this.dials.forEach((m) => (m.visible = burst > 0.01));
    // electrons race round their orbits, faster on the beat
    for (const o of this.orbits) {
      o.ang += dt * (o.speed + U.uPulse.value * 1.2);
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
