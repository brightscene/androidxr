import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, SFX, INPUT, damp } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// Star gate: an ancient ring of stone stands on an alien world. Its inner ring
// of glyphs turns and stops, and one by one seven amber locks light with a
// heavy thud. The gate bursts open into a shimmering blue pool of light; you
// glide through it, ride a blue-white wormhole, and arrive on another world
// where the gate waits to be dialled again.

const WORLDS = [
  { sky: [[0.05, 0.03, 0.09], [0.55, 0.22, 0.12], [0.95, 0.55, 0.25]], ground: [0.32, 0.2, 0.12], moons: 2 },   // desert dusk
  { sky: [[0.01, 0.02, 0.05], [0.04, 0.16, 0.2], [0.2, 0.6, 0.55]], ground: [0.06, 0.08, 0.1], moons: 1 },        // aurora night
  { sky: [[0.12, 0.16, 0.25], [0.45, 0.58, 0.72], [0.85, 0.9, 0.95]], ground: [0.62, 0.68, 0.75], moons: 1 },     // ice world
  { sky: [[0.02, 0.05, 0.04], [0.1, 0.25, 0.2], [0.45, 0.6, 0.45]], ground: [0.08, 0.14, 0.08], moons: 0 },       // jungle mist
];
const GATE = new THREE.Vector3(0, 3.1, -11);
const R = 3.0;

export class StarGateScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const w0 = WORLDS[0];
    Object.assign(U, {
      uSkyA: { value: new THREE.Color(...w0.sky[0]) }, uSkyB: { value: new THREE.Color(...w0.sky[1]) }, uSkyC: { value: new THREE.Color(...w0.sky[2]) },
      uGround: { value: new THREE.Color(...w0.ground) }, uMoons: { value: w0.moons },
      uSpin: { value: 0 }, uLocks: { value: 0 }, uLockFlash: { value: 0 }, uHorizon: { value: 0 }, uWoosh: { value: 0 },
      uWorm: { value: 0 }, uWormT: { value: 0 }, uFlash: { value: 0 }, uRipple: { value: 0 },
    });
    // --- the world's sky and ground
    const sky = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uSkyA, uSkyB, uSkyC; uniform float uTime, uFade, uMoons, uWorm; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir);
          float h = d.y;
          vec3 c = mix(uSkyC, uSkyB, smoothstep(-0.02, 0.18, h));
          c = mix(c, uSkyA, smoothstep(0.15, 0.7, h));
          c += uSkyC * 0.15 * fbm(vec3(d.xz * 3.0 / (h + 0.3), uTime * 0.01)) * smoothstep(0.0, 0.4, h);
          vec2 st = starDot(d, 240.0, 0.992); c += vec3(0.9) * st.x * smoothstep(0.1, 0.5, h) * (1.0 - dot(uSkyA, vec3(0.33)) * 3.0);
          // moons
          for (int i = 0; i < 2; i++) {
            if (float(i) >= uMoons) break;
            vec3 md = normalize(i == 0 ? vec3(-0.45, 0.35, -0.8) : vec3(0.55, 0.22, -0.8));
            float rr = i == 0 ? 0.9993 : 0.99975;
            float disc = smoothstep(rr - 0.00012, rr, dot(d, md));
            c = mix(c, vec3(0.92, 0.88, 0.82) * (0.7 + 0.3 * fbm(d * 60.0)), disc);
            c += vec3(0.6, 0.55, 0.5) * pow(max(dot(d, md), 0.0), 600.0) * 0.4;
          }
          c = mix(c, uSkyB * 0.5, smoothstep(0.0, -0.08, h));
          gl_FragColor = vec4(grade(c), uFade * (1.0 - uWorm)); }`,
    }));
    sky.renderOrder = -6;
    this.group.add(sky);
    this.sky = sky;
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uGround, uSkyB, uSkyC; uniform float uFade, uHorizon, uWorm; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){
          float n = fbm(vec3(vW.xz * 0.25, 0.0)) * 0.6 + fbm(vec3(vW.xz * 1.5, 1.0)) * 0.4;
          vec3 c = uGround * (0.45 + 0.6 * n);
          // a stone platform and steps before the gate
          vec2 q = vW.xz - vec2(0.0, -11.0);
          float pad = step(abs(q.x), 4.2) * step(abs(q.y), 2.2);
          float steps = step(abs(vW.x), 1.6) * step(-8.8, vW.z) * step(vW.z, -5.0);
          c = mix(c, vec3(0.32, 0.3, 0.28) * (0.7 + 0.3 * n), max(pad, steps) * 0.85);
          // blue light from the open gate spilling across the ground
          float glow = exp(-length(q) * 0.25) * uHorizon;
          c += vec3(0.25, 0.55, 1.0) * glow * 0.6;
          c = mix(c, uSkyC * 0.55, smoothstep(18.0, 65.0, length(vW.xz)));
          gl_FragColor = vec4(grade(c), uFade * (1.0 - uWorm)); }`,
    }));
    ground.renderOrder = -5;
    this.group.add(ground);
    this.ground = ground;

    // --- the gate
    this.gate = new THREE.Group();
    this.gate.position.copy(GATE);
    this.group.add(this.gate);
    const stone = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uSkyC; uniform float uFade, uHorizon; varying vec3 vN; varying vec3 vP; ${NOISE}
        void main(){ vec3 n = normalize(vN);
          float a = atan(vP.y, vP.x);
          float seg = smoothstep(0.02, 0.0, abs(fract(a / 6.28318 * 18.0) - 0.5) - 0.47);
          float lit = 0.35 + 0.65 * max(0.0, dot(n, normalize(vec3(-0.3, 0.6, 0.7))));
          vec3 c = vec3(0.24, 0.24, 0.27) * (0.75 + 0.35 * fbm(vP * 4.0)) * lit * (1.0 - seg * 0.5);
          c += uSkyC * 0.12 * max(0.0, n.y);
          c += vec3(0.25, 0.55, 1.0) * uHorizon * 0.35 * max(0.0, n.z);
          gl_FragColor = vec4(c, uFade); }`,
    });
    const outer = new THREE.Mesh(new THREE.TorusGeometry(R, 0.42, 24, 120), stone);
    outer.scale.z = 0.7;
    this.gate.add(outer);
    // the turning inner ring of glyphs
    const inner = new THREE.Mesh(new THREE.RingGeometry(R - 0.42, R - 0.06, 120, 1), new THREE.ShaderMaterial({
      side: THREE.DoubleSide, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uSpin, uHorizon; varying vec2 vP; ${NOISE}
        float h(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        void main(){
          float a = atan(vP.y, vP.x) + uSpin, r = length(vP);
          float cells = 39.0;
          float k = a / 6.28318 * cells;
          float id = floor(k);
          vec2 g = vec2(fract(k) - 0.5, (r - ${(R - 0.24).toFixed(2)}) / 0.32);   // glyph space, about -0.5..0.5
          // an invented glyph: a few strokes picked by the cell number
          float ink = 0.0;
          for (int s = 0; s < 4; s++) {
            vec2 p0 = vec2(h(vec2(id, float(s))), h(vec2(id + 7.0, float(s)))) - 0.5;
            vec2 p1 = vec2(h(vec2(id, float(s) + 3.0)), h(vec2(id + 9.0, float(s) + 1.0))) - 0.5;
            vec2 pa = g - p0 * 0.6, ba = (p1 - p0) * 0.6;
            float t = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            ink = max(ink, smoothstep(0.06, 0.02, length(pa - ba * t)));
          }
          float divider = smoothstep(0.03, 0.0, abs(fract(k) - 0.5) - 0.47);
          vec3 c = vec3(0.19, 0.19, 0.22) * (0.8 + 0.3 * fbm(vec3(vP * 5.0, 0.0)));
          c = mix(c, vec3(0.08, 0.08, 0.1), divider);
          c += vec3(0.5, 0.75, 1.0) * ink * (0.12 + uHorizon * 0.5);
          c = mix(c, vec3(0.1, 0.1, 0.12), ink * (1.0 - uHorizon) * 0.4);
          gl_FragColor = vec4(c, uFade); }`,
    }));
    inner.position.z = 0.05;
    this.gate.add(inner);
    // seven amber locks around the ring (two more at the bottom stay dark)
    this.locks = [];
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 - (i / 9) * Math.PI * 2;
      const g = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), stone);
      const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 3), new THREE.MeshBasicMaterial({ color: 0x3a1a08, transparent: true }));
      lamp.rotation.z = Math.PI; lamp.position.set(0, -0.08, 0.24);
      const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.position.z = 0.3;
      g.add(base, lamp, halo);
      g.position.set(Math.cos(a) * (R + 0.42), Math.sin(a) * (R + 0.42), 0.1);
      g.rotation.z = a - Math.PI / 2;
      this.gate.add(g);
      this.locks.push({ lamp, halo });
    }
    // the event horizon: a shimmering pool of blue light standing in the ring
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(R - 0.42, 96), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: /* glsl */ `uniform float uTime, uWoosh, uRipple; varying vec2 vP; ${NOISE}
        void main(){ vP = position.xy; vec3 p = position; float r = length(p.xy) / ${(R - 0.42).toFixed(2)};
          // the burst as it opens: a surge of light thrown toward you, then drawn back
          p.z += uWoosh * 5.5 * pow(1.0 - r, 1.6) * (0.8 + 0.4 * fbm(vec3(p.xy * 2.0, uTime * 2.0)));
          p.z += sin(r * 14.0 - uTime * 3.0) * 0.03 * (1.0 + uRipple * 3.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uHorizon, uWoosh, uRipple; varying vec2 vP; ${NOISE}
        void main(){ float r = length(vP) / ${(R - 0.42).toFixed(2)};
          float w = fbm(vec3(vP * 1.6, uTime * 0.35)) + fbm(vec3(vP * 4.0 + 3.0, uTime * 0.6)) * 0.5;
          float rings = 0.5 + 0.5 * sin(r * 22.0 - uTime * 2.2 + w * 4.0);
          float caustic = pow(1.0 - abs(sin(w * 9.0)), 6.0);
          vec3 c = mix(vec3(0.05, 0.25, 0.7), vec3(0.35, 0.7, 1.0), w * 0.8) * (0.6 + rings * 0.35);
          c += vec3(0.75, 0.9, 1.0) * caustic * 0.6 + vec3(0.8, 0.92, 1.0) * uRipple * exp(-pow((r - fract(uTime * 0.6)) * 8.0, 2.0)) * 0.6;
          c += vec3(0.9, 0.95, 1.0) * uWoosh;
          gl_FragColor = vec4(c * (1.0 + uWoosh), (uHorizon + uWoosh) * uFade * smoothstep(1.0, 0.97, r)); }`,
    }));
    this.pool.position.z = 0.02;
    this.pool.renderOrder = 3;
    this.gate.add(this.pool);

    // --- the wormhole, all around you while you travel
    this.worm = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uWorm, uWormT, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          float r = max(length(d.xy), 1e-3), z = max(-d.z, -0.5) / r;
          float a = atan(d.y, d.x) + z * 0.05 + uWormT * 0.4;
          vec3 P = vec3(cos(a) * 1.5, sin(a) * 1.5, z * 0.4 + uWormT * 3.0);
          float n = fbm(P), m = fbm(P * 2.3 + n * 2.0);
          float streak = pow(0.5 + 0.5 * sin(a * 18.0 + n * 6.0), 6.0);
          vec3 c = mix(vec3(0.02, 0.08, 0.3), vec3(0.3, 0.6, 1.0), m) * (0.5 + n);
          c += vec3(0.8, 0.9, 1.0) * streak * smoothstep(1.0, 8.0, z) * 0.35;
          c += vec3(0.9, 0.95, 1.0) * exp(-r * r * 60.0) * step(0.0, -d.z) * 1.2;   // the light at the far end
          gl_FragColor = vec4(grade(c), uWorm * uFade); }`,
    }));
    this.worm.renderOrder = 50;
    this.worm.position.y = 1.6;   // centred on your eyes, so the stars stream from the tunnel's heart
    this.group.add(this.worm);
    this.streaks = particles(U, { count: 900, min: [-3, -0.4, -60], max: [3, 3.6, 4], vel: [0, 0, 22], sway: 0.05, size: [0.015, 0.035], colors: ['#ffffff', '#cfe6ff'], alpha: 0 });
    this.streaks.renderOrder = 51;
    this.group.add(this.streaks);
    this.dust = particles(U, { count: 400, min: [-14, 0, -24], max: [14, 6, 4], vel: [0.1, 0.03, 0], sway: 0.4, size: [0.01, 0.03], colors: ['#ffffff', '#ffe8c8'], alpha: 0.4 });
    this.group.add(this.dust);
    // a white flash on arrival
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
    this.flash.renderOrder = 200;
    this.flash.position.set(0, 1.6, 0);
    this.group.add(this.flash);

    this.world = 0;
    this.st = { phase: 'idle', t: 0, lock: 0 };
    this.tunnelOnly = true;   // the gate itself is gone; only the wormhole ride remains
  }

  _sfx(kind, opts) { if (this.fade > 0.5) SFX.play(kind, opts); }

  onEvent(e) {
    if (e.type === 'beat' && this.st.phase === 'open') this.uniforms.uRipple.value = Math.min(1, this.uniforms.uRipple.value + (e.accent ? 0.6 : 0.2));
  }

  _setWorld(i) {
    const w = WORLDS[i % WORLDS.length], U = this.uniforms;
    U.uSkyA.value.setRGB(...w.sky[0]); U.uSkyB.value.setRGB(...w.sky[1]); U.uSkyC.value.setRGB(...w.sky[2]);
    U.uGround.value.setRGB(...w.ground); U.uMoons.value = w.moons;
  }

  update(dt, t) {
    const U = this.uniforms, st = this.st;
    if (this.tunnelOnly) {
      // just the wormhole: ride it endlessly, easing between a glide and a rush,
      // with a surge (and a rush of air) every so often
      this.gate.visible = this.sky.visible = this.ground.visible = this.dust.visible = false;
      this.flash.visible = false;
      U.uWorm.value = 1;
      this.worm.visible = true;
      this.wNext = (this.wNext ?? 8) - dt;
      if (this.wNext <= 0) {
        this.wTarget = [0.6, 1.2, 2.2, 3.5][Math.floor(Math.random() * 4)];
        if (this.wTarget > 2 && this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 3, gain: 0.6 });
        this.wNext = 9 + Math.random() * 9;
      }
      this.wSpeed = damp(this.wSpeed ?? 1.2, this.wTarget ?? 1.2, 0.5, dt);
      U.uWormT.value += dt * this.wSpeed;
      this.streaks.userData.u.uAlpha.value = 0.9;
      this.streaks.userData.u.uBoost.value = Math.max(0, this.wSpeed - 1.2) * 0.6;
      return;
    }
    st.t += dt;
    U.uRipple.value *= Math.exp(-dt * 1.5);
    U.uLockFlash.value *= Math.exp(-dt * 3);
    let gateZ = GATE.z;
    if (st.phase === 'idle') {
      U.uHorizon.value = damp(U.uHorizon.value, 0, 1.2, dt);
      if (st.t > 7) { st.phase = 'spin'; st.t = 0; st.dir = 1; st.lock = 0; this.locks.forEach((l) => (l.on = 0)); }
    } else if (st.phase === 'spin') {
      // the inner ring turns, eases to a stop, and a lock engages
      const dur = 2.6;
      if (st.base === undefined) st.base = U.uSpin.value;
      const k = Math.max(0, Math.min(1, st.t / dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      U.uSpin.value = st.base + st.dir * e * (1.4 + st.lock * 0.15);
      if (st.t >= dur) {
        const order = [0, 1, 2, 3, 6, 7, 8][st.lock];
        this.locks[order].on = 1;
        this._sfx('thud', { pan: Math.sin((order / 9) * Math.PI * 2) * 0.6, decay: 0.7, gain: 2.0 });
        st.lock++; st.base = undefined; st.dir *= -1; st.t = -0.6; U.uSpin.value = U.uSpin.value;   // a short pause on each lock
        if (st.lock >= 7) { st.phase = 'woosh'; st.t = 0; this._sfx('whoosh', { pan: 0, dur: 2.4, gain: 1.2 }); this._sfx('thud', { pan: 0, decay: 1.2, gain: 2.4 }); }
      }
    } else if (st.phase === 'woosh') {
      const k = st.t / 1.6;
      U.uWoosh.value = Math.max(0, Math.sin(Math.min(1, k) * Math.PI)) * (k < 1 ? 1 : 0);
      U.uHorizon.value = Math.min(1, st.t / 1.2);
      if (st.t > 1.8) { st.phase = 'open'; st.t = 0; }
    } else if (st.phase === 'open') {
      U.uWoosh.value = 0; U.uHorizon.value = 1;
      if (st.t > 9) { st.phase = 'enter'; st.t = 0; this._sfx('whoosh', { pan: 0, dur: 3, gain: 0.9 }); }
    } else if (st.phase === 'enter') {
      // glide up to and through the pool of light
      const k = Math.min(1, st.t / 4), e = k * k;
      gateZ = GATE.z + e * (-GATE.z + 0.6);
      U.uWorm.value = Math.max(0, (k - 0.85) / 0.15);
      if (k >= 1) { st.phase = 'worm'; st.t = 0; }
    } else if (st.phase === 'worm') {
      U.uWorm.value = 1;
      U.uWormT.value += dt * (1.2 + Math.sin(st.t * 0.6) * 0.5);
      if (st.t > 11) { st.phase = 'arrive'; st.t = 0; this.world++; this._setWorld(this.world); this._sfx('whoosh', { pan: 0, dur: 1.5, gain: 0.8 }); }
    } else if (st.phase === 'arrive') {
      // a white flash, then you're standing before the gate on a new world as it closes
      U.uFlash.value = Math.max(0, 1 - st.t / 1.8);
      U.uWorm.value = Math.max(0, 1 - st.t / 0.4);
      U.uHorizon.value = Math.max(0, 1 - st.t / 3);
      if (st.t > 3.2) { st.phase = 'idle'; st.t = 0; this.locks.forEach((l) => (l.on = 0)); }
    }
    if (st.phase !== 'arrive') U.uFlash.value = 0;
    this.gate.position.z = gateZ;
    this.gate.visible = U.uWorm.value < 0.99;
    this.worm.visible = U.uWorm.value > 0.001;
    this.sky.visible = this.ground.visible = this.dust.visible = U.uWorm.value < 0.99;   // inside the wormhole there's nothing else
    this.streaks.userData.u.uAlpha.value = U.uWorm.value * 0.9;
    this.flash.material.opacity = U.uFlash.value * this.fade;
    this.flash.visible = U.uFlash.value > 0.001;
    for (const l of this.locks) {
      const on = l.on || 0;
      l.lamp.material.color.setRGB(0.23 + on * 0.77, 0.1 + on * 0.45, 0.03 + on * 0.1);
      l.halo.material.opacity = on * 0.55 * this.fade;
    }
  }
}

// ===================================================================== Wormhole variations
// The wormhole ride on its own, in different colours, speeds and paths: the
// tunnel bends left, right, up and down as you fly, and twists as it goes.
const WORMS = {
  violet: { deep: [0.22, 0.06, 0.5], bright: [1.3, 0.7, 1.5], light: [1.0, 0.85, 1.0], speeds: [0.5, 1.0, 1.6], bend: 0.35, twist: 0.25 },
  gold: { deep: [0.25, 0.08, 0.02], bright: [1.0, 0.72, 0.3], light: [1.0, 0.95, 0.8], speeds: [1.5, 2.6, 4.0], bend: 0.55, twist: 0.9 },
  emerald: { deep: [0.0, 0.08, 0.07], bright: [0.2, 0.75, 0.55], light: [0.9, 1.0, 0.95], speeds: [0.35, 0.7, 1.1], bend: 0.7, twist: 0.12 },
  crimson: { deep: [0.25, 0.01, 0.06], bright: [1.0, 0.35, 0.45], light: [1.0, 0.85, 0.85], speeds: [0.6, 1.2, 2.2, 3.5], bend: 0, twist: 0, classic: true },
};
for (const W of Object.values(WORMS)) { W.speeds = W.speeds.map((v, i, a) => (i === a.length - 1 ? v * 1.4 : v)); W.twist *= 1.3; }
const WORM_ORDER = [['violet', 'Violet drift'], ['emerald', 'Emerald curves'], ['gold', 'Golden twister'], ['crimson', 'Crimson']];

export class WormholeScene extends BaseScene {
  constructor(kind = 'violet', switchable = false) {
    super();
    if (switchable) { try { kind = localStorage.getItem('mindlyte-wormhole') || kind; } catch (_) {} if (!WORMS[kind]) kind = 'violet'; }
    const W = WORMS[kind];
    this.W = { ...W };
    this.kind = kind;
    const U = this.uniforms;
    Object.assign(U, {
      uDeep: { value: new THREE.Color(...W.deep) }, uBright: { value: new THREE.Color(...W.bright) }, uLight: { value: new THREE.Color(...W.light) },
      uWT: { value: 0 }, uTw: { value: 0 }, uTwK: { value: W.twist }, uBend: { value: new THREE.Vector2() }, uSurge: { value: 0 },
    });
    const m = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec3 uDeep, uBright, uLight; uniform vec2 uBend; uniform float uTime, uWT, uTw, uTwK, uSurge, uFade, uBreath; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          // bend the tunnel: the far end swings away, so it curves ahead of you
          float far = smoothstep(0.0, 1.0, -d.z);
          d.xy -= uBend * far * far * 0.7;
          d = normalize(d);
          float r = max(length(d.xy), 1e-3), z = max(-d.z, -0.5) / r;
          float a = atan(d.y, d.x) + z * 0.05 * (1.0 + uTwK * 2.0) + uTw;
          vec3 P = vec3(cos(a) * 1.5, sin(a) * 1.5, z * 0.4 + uWT * 3.0);
          float n = fbm(P), m = fbm(P * 2.3 + n * 2.0);
          float streak = pow(0.5 + 0.5 * sin(a * 18.0 + n * 6.0), 6.0);
          vec3 c = mix(uDeep * 0.5, uBright * 0.55, m * m) * (0.35 + n * 0.8);
          c += uLight * streak * smoothstep(1.0, 8.0, z) * (0.3 + uSurge * 0.3);
          c += uLight * exp(-r * r * 60.0) * step(0.0, -d.z) * (1.0 + uSurge * 0.5);
          gl_FragColor = vec4(grade(c * (0.9 + uBreath * 0.05)), uFade); }`,
    }));
    m.renderOrder = -5;
    // everything hangs from a pivot at your eyes, so the whole tunnel can dive and loop around you
    this.pivot = new THREE.Group();
    this.pivot.position.y = 1.6;
    this.group.add(this.pivot);
    this.pivot.add(m);
    const col = (c) => '#' + new THREE.Color(...c).getHexString();
    this.streaks = particles(U, { count: 900, min: [-3, -2, -60], max: [3, 2, 4], vel: [0, 0, 22], sway: 0.05, size: [0.015, 0.035], colors: ['#ffffff', col(W.light), col(W.bright)], alpha: 0.85 });
    // the stars fly out of the tunnel's centre, wherever the bend has taken it
    this.aim = new THREE.Group();
    this.aim.add(this.streaks);
    this.pivot.add(this.aim);
    this.move = null; this.moveNext = 25 + Math.random() * 10;   // the first dive or loop
    this.speed = W.speeds[1]; this.target = W.speeds[1]; this.next = 6;
    this.bendT = new THREE.Vector2(); this.bendNext = 4;
    this.classicMix = W.classic ? 1 : 0;
    if (switchable) this._palette();
  }

  // ---- one wormhole, four ways: a small palette of orbs to flow between them.
  // In the headset it rises above your left hand (touch an orb with a fingertip,
  // or point and pinch); on a screen it sits low on the left of the view.
  _palette() {
    this.pal = new THREE.Group();
    this.pal.visible = false;
    this.group.add(this.pal);
    this.orbs = WORM_ORDER.map(([k, name], i) => {
      const W = WORMS[k];
      const col = new THREE.Color(...W.bright), deep = new THREE.Color(...W.deep);
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.016, 20, 14), new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, uniforms: { uCol: { value: col }, uDeep: { value: deep }, uSel: { value: 0 }, uHov: { value: 0 }, uA: { value: 1 } },
        vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform vec3 uCol, uDeep; uniform float uSel, uHov, uA; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0); vec3 c = mix(uCol, uDeep * 2.0, f * 0.6) * (0.8 + uHov * 0.5) + vec3(1.0) * f * (0.3 + uSel * 0.9); gl_FragColor = vec4(c, uA); }',
      }));
      m.renderOrder = 999;
      m.position.x = (i - 1.5) * 0.042;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0022, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthTest: false, opacity: 0 }));
      ring.renderOrder = 1000;
      ring.position.copy(m.position);
      this.pal.add(m, ring);
      return { k, name, m, ring };
    });
    this.palLabel = textPlane(this.uniforms, 0.16, 0.02);
    this.palLabel.position.set(0, 0.032, 0);
    this.palLabel.material.depthTest = false;
    this.palLabel.renderOrder = 1000;
    this.pal.add(this.palLabel);
    this._markSel();
  }

  _markSel() {
    for (const o of this.orbs || []) { o.m.material.uniforms.uSel.value = o.k === this.kind ? 1 : 0; o.ring.material.opacity = o.k === this.kind ? 0.8 : 0; }
    this.palLabel?.userData.set(WORM_ORDER.find(([k]) => k === this.kind)?.[1] || '');
  }

  // flow into another style: colours, speeds, bends and twist all glide across
  setKind(kind) {
    if (!WORMS[kind] || kind === this.kind) return;
    this.kind = kind;
    this.to = WORMS[kind];
    this.W.speeds = this.to.speeds;
    this.target = this.to.speeds[1]; this.next = 6;
    this._markSel();
    try { localStorage.setItem('mindlyte-wormhole', kind); } catch (_) {}
    if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 2.5, gain: 0.35 });
  }

  // where the palette's orbs are, for this pointer: the one it points at or touches
  _orbAt(p) {
    if (!this.pal?.visible) return null;
    this.pal.updateMatrixWorld(true);
    let best = null, bd = Infinity;
    for (const o of this.orbs) {
      const c = new THREE.Vector3().setFromMatrixPosition(o.m.matrixWorld);
      let d;
      if (p.tip && INPUT.xr) d = p.tip.distanceTo(c);
      else { const v = c.clone().sub(p.origin); const k = Math.max(0, v.dot(p.dir)); d = v.addScaledVector(p.dir, -k).length(); }
      if (d < 0.026 && d < bd) { bd = d; best = o; }
    }
    return best;
  }
  wantsPointerAt(p) { return !!this._orbAt(p); }

  _updatePalette(dt) {
    if (!this.orbs) return;
    const P = this.pal;
    if (INPUT.xr) {
      // above the left hand, facing you, while the hand is up in view
      const h = INPUT.hands.find((x) => x.side === 'left');
      const ctl = !h && INPUT.pointers.find((p) => p.id === 0 || p.id === 1);
      const at = h?.joints[0] || (ctl ? ctl.origin : null);
      const head = INPUT.head;
      let show = false;
      if (at && head) {
        const to = at.clone().sub(head.pos);
        show = to.length() < 0.8 && to.normalize().dot(head.fwd) > Math.cos(0.75);
        P.position.copy(at).add(new THREE.Vector3(0, 0.15, 0));
        P.lookAt(head.pos);
      }
      this.palA = Math.max(0, Math.min(1, (this.palA || 0) + (show ? dt * 5 : -dt * 4)));
    } else if (INPUT.head) {
      // on a screen: low on the left of the view
      const head = INPUT.head, f = head.fwd.clone(), up = head.up || new THREE.Vector3(0, 1, 0);
      const right = f.clone().cross(up).normalize(), u2 = right.clone().cross(f).normalize();
      P.position.copy(head.pos).addScaledVector(f, 0.5).addScaledVector(right, -0.22).addScaledVector(u2, -0.09);
      P.lookAt(head.pos);
      this.palA = 1;
    }
    P.visible = this.palA > 0.02;
    P.scale.setScalar(0.7 + 0.3 * (this.palA || 0));
    for (const o of this.orbs) o.m.material.uniforms.uA.value = this.palA || 0;
    this.palLabel.material.uniforms.uA.value = 0.6 * (this.palA || 0);
    // choosing
    const pointers = INPUT.pointers;
    for (const o of this.orbs) o.hov = false;
    for (const p of pointers) {
      const o = this._orbAt(p);
      if (!o) { this.touching?.delete(p.id); continue; }
      o.hov = true;
      const poke = p.tip && INPUT.xr && !this.touching?.has(p.id);
      (this.touching ||= new Set()).add(p.id);
      if (poke || INPUT.presses.includes(p.id)) this.setKind(o.k);
    }
    for (const o of this.orbs) o.m.material.uniforms.uHov.value += ((o.hov ? 1 : 0) - o.m.material.uniforms.uHov.value) * Math.min(1, dt * 10);
  }
  onEvent(e) { if (e.type === 'beat' && e.accent) this.uniforms.uSurge.value = Math.min(1, this.uniforms.uSurge.value + 0.4); }
  update(dt) {
    const U = this.uniforms, W = this.W;
    this._updatePalette?.(dt);
    if (this.to) {
      const k = 1 - Math.exp(-dt * 1.3), T = this.to;
      U.uDeep.value.lerp(new THREE.Color(...T.deep), k); U.uBright.value.lerp(new THREE.Color(...T.bright), k); U.uLight.value.lerp(new THREE.Color(...T.light), k);
      W.bend += (T.bend - W.bend) * k; W.twist += (T.twist - W.twist) * k;
      U.uTwK.value += (T.twist - U.uTwK.value) * k;
      this.classicMix += ((T.classic ? 1 : 0) - this.classicMix) * k;
      W.classic = this.classicMix > 0.5;
    }
    this.next -= dt;
    if (this.next <= 0) {
      const t = W.speeds[Math.floor(Math.random() * W.speeds.length)];
      if (t > this.target && t === W.speeds[W.speeds.length - 1] && this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 3, gain: 0.55 });
      this.target = t; this.next = 8 + Math.random() * 8;
    }
    // now and then: a dive down a deep vertical shaft and back up, or a loop-the-loop
    this.moveNext -= dt;
    if (!this.move && this.moveNext <= 0) {
      this.move = { kind: Math.random() < 0.5 ? 'dive' : 'loop', t: 0 };
      this.move.len = this.move.kind === 'dive' ? 15 : 13;
      if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 4, gain: 0.45 });
    }
    let pitch = 0, boost = 1;
    if (this.move) {
      const M = this.move, u = Math.min(1, (M.t += dt) / M.len);
      const ease = (x) => x * x * (3 - 2 * x);
      if (M.kind === 'dive') {
        // tip over into the shaft (4 s), fall (4 s), ease back up and level out (7 s)
        const a = ease(Math.min(1, u / 0.27)), b = ease(Math.max(0, (u - 0.53) / 0.47));
        pitch = -1.45 * (a - b);
        boost = 1 + 1.6 * a * (1 - b) + 0.4 * Math.sin(Math.PI * Math.min(1, u / 0.53));
      } else {
        // a full loop: quick on the way down, slower up and over the top
        const g = u < 0.4 ? ease(u / 0.4) * 0.5 : 0.5 + ease((u - 0.4) / 0.6) * 0.5;
        pitch = -Math.PI * 2 * g;
        boost = u < 0.4 ? 1 + 1.4 * Math.sin(Math.PI * u / 0.4) : 1 - 0.35 * Math.sin(Math.PI * (u - 0.4) / 0.6);
      }
      if (u >= 1) { this.move = null; this.moveNext = 35 + Math.random() * 30; pitch = 0; }
    }
    this.pivot.rotation.x = pitch;
    this.speed = damp(this.speed, this.target * boost, 0.8, dt);
    U.uWT.value += dt * this.speed;
    // a new bend every few seconds: the tunnel curves gently left, right, up or down
    this.bendNext -= dt;
    if (this.bendNext <= 0) { this.bendT.set((Math.random() - 0.5) * 2 * W.bend, (Math.random() - 0.5) * 1.4 * W.bend); this.bendNext = 5 + Math.random() * 6; }
    U.uBend.value.x = damp(U.uBend.value.x, this.bendT.x, 0.35, dt);
    U.uBend.value.y = damp(U.uBend.value.y, this.bendT.y, 0.35, dt);
    if (W.classic) U.uTw.value = U.uWT.value * 0.4;   // the original Wormhole's slow roll as you travel
    else U.uTw.value += dt * W.twist * (0.4 + this.speed * 0.2) * Math.sign(Math.sin(U.uWT.value * 0.05) + 0.001);
    this.aim.rotation.set(Math.atan(0.7 * U.uBend.value.y), -Math.atan(0.7 * U.uBend.value.x), 0, 'YXZ');
    U.uSurge.value *= Math.exp(-dt * 1.5);
    this.streaks.userData.u.uBoost.value = Math.max(0, this.speed - W.speeds[0]) * 0.3 + U.uSurge.value * 0.5;
  }
}
