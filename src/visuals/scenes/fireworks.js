import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SFX } from '../common.js';

// ===================================================================== Fireworks
// A fireworks display over a still lake at night. Rockets streak up into the
// stars trailing sparks and burst into peonies, chrysanthemums with glittering
// tails, drooping golden willows, rings and palms, crackling as they fade, all
// mirrored in the water. Every so often a Catherine wheel lights up straight
// ahead and spins, throwing out a whirl of sparks.
const MAX = 9000;
const TRAIL = new THREE.Color('#ffb070'), GOLD = new THREE.Color('#ffc760'), WHEEL_A = new THREE.Color('#ffd27a'), WHEEL_B = new THREE.Color('#7ff0ff'), WHEEL_C = new THREE.Color('#ff6fd0'), ROCKET = new THREE.Color('#ffd9a0');
const TMP = new THREE.Color();
const COLS = ['#ff3b4f', '#ffb22e', '#ffe36b', '#3bd16f', '#3fa8ff', '#b46bff', '#ff6fd0', '#ffffff', '#5ff0ff'].map((c) => new THREE.Color(c));

export class FireworksScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: { ...U, uFlash: { value: new THREE.Vector3() } },
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; uniform vec3 uFlash; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(vec3(0.02, 0.025, 0.06), vec3(0.003, 0.004, 0.015), smoothstep(0.0, 0.6, abs(h)));
          vec2 st = starDot(d, 260.0, 0.99);
          c += vec3(0.85, 0.9, 1.0) * st.x * (0.6 + 0.4 * sin(uTime * (1.0 + st.y * 3.0) + st.y * 40.0)) * smoothstep(0.02, 0.2, h) * 0.7;
          c += uFlash * 0.06 * smoothstep(-0.1, 0.5, h);                  // the sky lights up with each burst
          // dark hills on the far shore, and the still lake mirroring the sky
          float hills = 0.015 + 0.03 * fbm(vec3(atan(d.z, d.x) * 5.0, 0.0, 3.0));
          c = mix(c, vec3(0.006, 0.007, 0.012) + uFlash * 0.02, smoothstep(hills + 0.003, hills - 0.003, h) * step(-0.004, h));
          if (h < -0.004) c = vec3(0.004, 0.006, 0.015) + uFlash * 0.03 + vec3(0.02) * fbm(vec3(d.x * 40.0 / (-h + 0.02), d.z * 4.0 / (-h + 0.02), uTime * 0.2)) * 0.3;
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.sky = sky;
    this.group.add(sky);

    // one big pool of sparks, updated each frame
    this.p = new Float32Array(MAX * 3); this.v = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3); this.a = new Float32Array(MAX); this.sz = new Float32Array(MAX);
    this.life = new Float32Array(MAX); this.age = new Float32Array(MAX); this.kind = new Uint8Array(MAX);   // 0 free, 1 spark, 2 rocket, 3 trail spark
    this.drag = new Float32Array(MAX); this.grav = new Float32Array(MAX); this.plan = new Array(MAX);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aA', new THREE.BufferAttribute(this.a, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(this.sz, 1));
    const mat = (k) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uK: { value: k } },
      vertexShader: /* glsl */ `attribute vec3 aCol; attribute float aA; attribute float aS; uniform float uViewH; varying vec3 vC; varying float vA; ${POINT_SIZE}
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = pointPx(aS, mv); vC = aCol; vA = aA; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade, uK; varying vec3 vC; varying float vA;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q);
          float core = exp(-r * 40.0), halo = exp(-r * 9.0) * 0.4;
          gl_FragColor = vec4((vC * (core + halo) + vec3(1.0) * core * 0.5) * vA * uK * uFade, 1.0); }`,
    });
    this.points = new THREE.Points(g, mat(1));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    const refl = new THREE.Points(g, mat(0.28));
    refl.scale.y = -1; refl.position.y = -0.6; refl.frustumCulled = false;
    this.group.add(refl);
    this.free = []; for (let i = MAX - 1; i >= 0; i--) this.free.push(i);
    this.next = 0.5; this.wheelNext = 25; this.wheel = null; this.flash = new THREE.Vector3(); this.sounds = [];
  }

  _spawn(x, y, z, vx, vy, vz, c, life, size, kind, drag = 1.2, grav = 4, plan = null) {
    const i = this.free.pop(); if (i === undefined) return -1;
    this.p.set([x, y, z], i * 3); this.v.set([vx, vy, vz], i * 3); this.col.set([c.r, c.g, c.b], i * 3);
    this.life[i] = life; this.age[i] = 0; this.sz[i] = size; this.a[i] = 1; this.kind[i] = kind; this.drag[i] = drag; this.grav[i] = grav; this.plan[i] = plan;
    return i;
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }

  _launch() {
    const x = (Math.random() - 0.5) * 90, z = -55 - Math.random() * 40;
    const styles = ['peony', 'chrysanthemum', 'willow', 'ring', 'palm', 'peony', 'crackle'];
    const style = styles[Math.floor(Math.random() * styles.length)];
    const c1 = COLS[Math.floor(Math.random() * COLS.length)], c2 = Math.random() < 0.4 ? COLS[Math.floor(Math.random() * COLS.length)] : c1;
    const vy = 30 + Math.random() * 10;
    this._spawn(x, 0, z, (Math.random() - 0.5) * 4, vy, (Math.random() - 0.5) * 3, ROCKET, 1.4 + Math.random() * 0.5, 0.9, 2, 0.15, 9.8, { style, c1, c2 });
    this._sfx('whoosh', { pan: Math.max(-0.9, Math.min(0.9, x / 70)), dur: 1.4, gain: 0.25 });
  }

  _burst(i) {
    const x = this.p[i * 3], y = this.p[i * 3 + 1], z = this.p[i * 3 + 2];
    const { style, c1, c2 } = this.plan[i];
    const n = style === 'ring' ? 140 : style === 'palm' ? 90 : style === 'crackle' ? 160 : 230;
    const speed = style === 'willow' ? 14 : style === 'palm' ? 20 : 24 + Math.random() * 8;
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 1.2 - 0.6, Math.random() * 6, Math.random() * 1.2 - 0.6));
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      if (style === 'ring') { const a = (k / n) * Math.PI * 2; v.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(tilt); }
      else if (style === 'palm') { v.randomDirection(); v.y = Math.abs(v.y) * 0.6 + 0.4; v.normalize(); }
      else v.randomDirection();
      const sp = speed * (style === 'ring' ? 1 : 0.75 + Math.random() * 0.35);
      const c = k % 2 ? c1 : c2;
      const willow = style === 'willow';
      this._spawn(x, y, z, v.x * sp, v.y * sp, v.z * sp, willow ? GOLD : c, willow ? 4.5 + Math.random() : 2.2 + Math.random() * 1.2, willow ? 0.7 : 0.9,
        style === 'chrysanthemum' || willow ? 3 : 1, willow ? 0.9 : 1.6, willow ? 3.5 : 5, style === 'crackle' ? { crackle: true } : null);
    }
    this.flash.set(c1.r, c1.g, c1.b).multiplyScalar(1.4);
    // the boom reaches you a moment after the light
    const dist = Math.hypot(x, y, z);
    this.sounds.push({ at: dist / 340, pan: Math.max(-0.9, Math.min(0.9, x / 80)), crackle: style === 'crackle' || style === 'willow' });
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    // launches: singles, sometimes a volley
    this.next -= dt;
    if (this.next <= 0) {
      const volley = Math.random() < 0.18 ? 4 + Math.floor(Math.random() * 4) : 1;
      for (let k = 0; k < volley; k++) setTimeout(() => this._launch(), k * 180);
      this.next = volley > 1 ? 4 + Math.random() * 2 : 0.6 + Math.random() * 1.6;
    }
    // the Catherine wheel, straight ahead and close, now and then
    this.wheelNext -= dt;
    if (this.wheelNext <= 0 && !this.wheel) { this.wheel = { t: 0, ang: 0 }; this.wheelNext = 45 + Math.random() * 25; this._sfx('hiss', { pan: 0, gain: 0.4, dur: 12, freq: 3000 }); }
    if (this.wheel) {
      const w = this.wheel; w.t += dt;
      const spin = Math.min(1, w.t / 1.5) * (w.t > 11 ? Math.max(0, 1 - (w.t - 11) / 2) : 1);
      w.ang += dt * 9 * spin;
      const cx = 0, cy = 7, cz = -20, R = 3;
      for (let k = 0; k < 6; k++) {
        const a = w.ang + (k / 6) * Math.PI * 2;
        const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
        // sparks thrown out along the rim, as the wheel turns
        for (let m = 0; m < 3; m++) {
          const ta = a + Math.PI / 2 + (Math.random() - 0.5) * 0.4, sp = 6 + Math.random() * 5;
          const c = k % 2 ? WHEEL_A : w.t > 6 ? WHEEL_C : WHEEL_B;
          this._spawn(px, py, cz, Math.cos(ta) * sp * spin, Math.sin(ta) * sp * spin, (Math.random() - 0.5) * 2, c, 0.8 + Math.random() * 0.5, 0.45, 1, 2.2, 3);
        }
      }
      if (w.t > 13) this.wheel = null;
    }
    // delayed booms
    for (let k = this.sounds.length - 1; k >= 0; k--) {
      const s = this.sounds[k]; s.at -= dt;
      if (s.at <= 0) { this._sfx('thud', { pan: s.pan, gain: 0.9, decay: 1.1 }); if (s.crackle) setTimeout(() => this._sfx('crackle', { pan: s.pan, gain: 0.35 }), 600); this.sounds.splice(k, 1); }
    }
    // move every spark
    for (let i = 0; i < MAX; i++) {
      const kd = this.kind[i]; if (!kd) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        if (kd === 2 && this.plan[i]) this._burst(i);
        this.kind[i] = 0; this.a[i] = 0; this.free.push(i); continue;
      }
      const j = i * 3, f = Math.exp(-this.drag[i] * dt);
      this.v[j] *= f; this.v[j + 1] = this.v[j + 1] * f - this.grav[i] * dt; this.v[j + 2] *= f;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (kd === 2) {
        this.a[i] = 1;
        if (Math.random() < 0.7) this._spawn(this.p[j], this.p[j + 1], this.p[j + 2], (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, TRAIL, 0.5, 0.3, 1, 2, 2);
      } else {
        let alpha = (1 - t) * (1 - t);
        if (this.plan[i] && this.plan[i].crackle && t > 0.5) alpha *= Math.random() < 0.5 ? 1.6 : 0.1;   // crackling glitter
        else if (t > 0.6) alpha *= 0.75 + 0.25 * Math.random();                                         // twinkle as they fade
        this.a[i] = alpha;
        if (kd === 3 && Math.random() < 0.25) this._spawn(this.p[j], this.p[j + 1], this.p[j + 2], 0, -0.5, 0, TMP.setRGB(this.col[j] * 0.7, this.col[j + 1] * 0.7, this.col[j + 2] * 0.7), 0.7, 0.25, 1, 2, 1.5);
      }
    }
    const at = this.points.geometry.attributes;
    at.position.needsUpdate = true; at.aCol.needsUpdate = true; at.aA.needsUpdate = true; at.aS.needsUpdate = true;
    this.flash.multiplyScalar(Math.exp(-dt * 3));
    this.sky.material.uniforms.uFlash.value.copy(this.flash);
  }
}
