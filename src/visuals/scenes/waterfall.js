import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Waterfall
// Morning in a mossy gorge. A tall waterfall pours from the cliff ahead into a
// green plunge pool; mist billows from its foot and drifts up through shafts of
// light, with a faint rainbow in the spray. You stand on a mossy ledge at the
// water's edge. Its roar (and birdsong now and then) is made live, so it never loops.

const FALL_Z = -13.2, TOP = 27.5, WIDTH = 4.2;   // the falls pour over the very top of the cliff

export class WaterfallScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;

    // sky through the trees
    this.group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir); float y = d.y;
          vec3 c = mix(vec3(0.75, 0.86, 0.85), vec3(0.32, 0.55, 0.75), smoothstep(0.0, 0.8, y));
          float leaves = smoothstep(0.45, 0.65, fbm(vec3(d * 5.0 + vec3(uTime * 0.01, 0.0, 0.0))));
          c = mix(c, vec3(0.05, 0.12, 0.05), leaves * smoothstep(0.1, 0.5, y) * 0.9);
          c = mix(c, vec3(0.05, 0.08, 0.04), smoothstep(0.08, -0.05, y));
          gl_FragColor = vec4(grade(c), uFade); }`,
    })), { renderOrder: -10 }));

    // the gorge: a curved wall of wet, mossy rock round the front and sides
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 30, 96, 24, true, Math.PI * 0.32, Math.PI * 1.36), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: U,
      vertexShader: /* glsl */ `varying vec3 vW; varying vec3 vN; ${NOISE}
        void main(){ vec3 p = position;
          // rough, overhanging rock
          float r = fbm(vec3(p.x * 0.25, p.y * 0.18, p.z * 0.25)) - 0.5;
          p.xz *= 1.0 + r * 0.22;
          vW = (modelMatrix * vec4(p, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vW; varying vec3 vN; ${NOISE} ${GRADE}
        void main(){
          float strata = fbm(vec3(vW.x * 0.6, vW.y * 2.2, vW.z * 0.6));
          float crack = smoothstep(0.62, 0.72, fbm(vec3(vW.x * 1.4, vW.y * 0.5, vW.z * 1.4)));
          vec3 rock = mix(vec3(0.13, 0.12, 0.11), vec3(0.28, 0.26, 0.23), strata);
          float moss = smoothstep(0.42, 0.62, fbm(vec3(vW * 0.7 + 3.0))) * smoothstep(22.0, 2.0, vW.y);
          vec3 c = mix(rock, vec3(0.12, 0.3, 0.08) * (0.7 + 0.5 * strata), moss);
          c *= 1.0 - crack * 0.6;
          // wet and dark beside the falls, and hanging ferns
          float nearFall = exp(-pow(vW.x / 6.0, 2.0)) * smoothstep(-6.0, -12.0, vW.z);
          c *= 1.0 - nearFall * 0.45;
          float fern = smoothstep(0.7, 0.8, fbm(vec3(vW.x * 3.0, vW.y * 1.2, vW.z * 3.0))) * smoothstep(16.0, 6.0, vW.y);
          c = mix(c, vec3(0.15, 0.4, 0.1), fern * 0.7);
          // morning light from the upper left
          float light = 0.55 + 0.45 * smoothstep(0.0, 22.0, vW.y) + 0.25 * smoothstep(5.0, -10.0, vW.x);
          c *= light;
          c = mix(c, vec3(0.6, 0.72, 0.72), smoothstep(10.0, 22.0, length(vW.xz)) * 0.3);   // a little haze
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    wall.position.set(0, 13, -1);
    wall.renderOrder = -6;
    this.group.add(wall);

    // the waterfall: a veil of streaming white water, and a softer outer sheet
    const fallMat = (soft) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { ...U, uSoft: { value: soft } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; vec3 p = position; p.z += sin(uv.y * 3.0) * 0.4; gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uSoft; varying vec2 vUv; ${NOISE}
        void main(){
          float x = vUv.x, fall = 1.0 - vUv.y;                // 0 at the lip, 1 at the pool
          float speed = 1.2 + fall * 2.2;                     // faster as it falls
          float streaks = fbm(vec3(x * (uSoft > 0.5 ? 14.0 : 34.0), vUv.y * 2.0 + uTime * speed, 1.0));
          float fine = fbm(vec3(x * 80.0, vUv.y * 5.0 + uTime * speed * 1.4, 4.0));
          float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
          float a = (0.35 + streaks * 0.8 + fine * 0.3) * edge;
          a *= uSoft > 0.5 ? 0.35 : 0.9;
          a *= smoothstep(1.0, 0.86, fall + (fine - 0.5) * 0.15) * 0.6 + 0.4;   // breaking into spray at the foot
          vec3 c = mix(vec3(0.78, 0.88, 0.9), vec3(1.0), streaks);
          c *= 0.8 + 0.2 * smoothstep(0.0, 0.3, fall);
          gl_FragColor = vec4(c * uFade, clamp(a, 0.0, 1.0) * uFade); }`,
    });
    for (const [w, z, soft] of [[WIDTH * 1.5, FALL_Z + 0.4, 1], [WIDTH, FALL_Z + 0.7, 0]]) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, TOP, 1, 40), fallMat(soft));
      f.position.set(0, TOP / 2, z);
      f.renderOrder = 4;
      this.group.add(f);
    }
    this.fallTop = TOP;

    // the plunge pool
    const pool = new THREE.Mesh(new THREE.CircleGeometry(13, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){
          vec2 p = vW.xz - vec2(0.0, ${FALL_Z.toFixed(1)});
          float r = length(p);
          float rip = sin(r * 3.2 - uTime * 4.0) * 0.5 + 0.5;
          float n = fbm(vec3(vW.xz * 0.8, uTime * 0.4));
          vec3 deep = vec3(0.02, 0.12, 0.1), shallow = vec3(0.08, 0.28, 0.2);
          vec3 c = mix(deep, shallow, smoothstep(12.0, 3.0, length(vW.xz - vec2(0.0, -2.0))) * 0.6 + n * 0.25);
          // reflections of the bright sky and falls, broken by ripples
          c += vec3(0.5, 0.62, 0.62) * (0.1 + 0.15 * n) * (0.6 + 0.4 * rip) * smoothstep(1.0, 9.0, r);
          // white foam where the water lands, spreading in rings
          float foam = smoothstep(4.5, 0.5, r + (n - 0.5) * 2.0) + smoothstep(0.55, 0.85, fbm(vec3(p * 1.4 - uTime * 0.3, 2.0))) * smoothstep(8.0, 2.0, r) * 0.6;
          foam += exp(-pow(fract(r * 0.35 - uTime * 0.25) - 0.5, 2.0) * 60.0) * smoothstep(9.0, 3.0, r) * 0.25;
          c = mix(c, vec3(0.88, 0.94, 0.93), clamp(foam, 0.0, 1.0) * 0.85);
          gl_FragColor = vec4(grade(c) * uFade, uFade); }`,
    }));
    pool.position.set(0, 0.02, -5);
    pool.renderOrder = -3;
    this.group.add(pool);

    // the mossy ledge you stand on, and a few wet boulders at the water's edge
    const rockMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vN; varying vec3 vW; ${NOISE}
        void main(){ vec3 n = normalize(vN); float l = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.5, 0.8, 0.3))), 0.0);
          float moss = smoothstep(0.35, 0.65, n.y + (fbm(vW * 3.0) - 0.5) * 0.8);
          vec3 c = mix(vec3(0.16, 0.15, 0.13) * (0.7 + 0.4 * fbm(vW * 6.0)), vec3(0.14, 0.32, 0.08), moss) * l;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    });
    const ledge = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.6, 24, 1), rockMat);
    ledge.position.set(0, -0.25, 0.6);
    this.group.add(ledge);
    for (const [x, z, s] of [[-2.4, -1.6, 0.7], [1.9, -2.2, 0.55], [-4.5, -4.0, 1.1], [4.2, -5.0, 0.9], [-1.0, -3.4, 0.4], [6.5, -9.0, 1.4], [-6.8, -8.5, 1.6]]) {
      const b = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 1), rockMat);
      b.scale.y = 0.6; b.position.set(x, s * 0.2, z); b.rotation.set(Math.random(), Math.random() * 6, 0);
      this.group.add(b);
    }

    // mist billowing from the foot of the falls, spray, and light through it
    this.mist = new THREE.Mesh(new THREE.PlaneGeometry(16, 9), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec2 vUv; ${NOISE}
        void main(){ vec2 p = vUv - vec2(0.5, 0.0);
          float n = fbm(vec3(p.x * 3.0, vUv.y * 2.0 - uTime * 0.12, uTime * 0.05));
          float shape = exp(-p.x * p.x * 7.0) * smoothstep(1.0, 0.05, vUv.y) * smoothstep(0.0, 0.1, vUv.y) * smoothstep(0.5, 0.36, abs(p.x));
          // a faint rainbow arcing through the spray
          float rr = length(vec2(p.x * 1.6, vUv.y - 0.05));
          float band = smoothstep(0.62, 0.66, rr) * smoothstep(0.78, 0.74, rr);
          vec3 rain = 0.5 + 0.5 * cos(6.28318 * ((rr - 0.62) / 0.16) + vec3(0.0, 2.1, 4.2));
          // only the left-hand part of the arc shows, where the sun catches the spray
          band *= smoothstep(0.1, -0.25, p.x) * smoothstep(0.02, 0.2, vUv.y);
          float a = shape * (0.22 + n * 0.5);
          vec3 c = mix(vec3(0.92, 0.96, 0.97), rain, clamp(band * 0.8, 0.0, 1.0));
          a = max(a, band * 0.16 * smoothstep(0.0, 0.3, shape + 0.15));
          gl_FragColor = vec4(c * uFade, clamp(a, 0.0, 0.85) * uFade); }`,
    }));
    this.mist.position.set(0, 3.5, FALL_Z + 2.2);
    this.mist.renderOrder = 6;
    this.group.add(this.mist);
    this.group.add(particles(U, { count: 700, min: [-4, 0, FALL_Z - 1], max: [4, 7, FALL_Z + 4], vel: [0, 0.7, 0.35], sway: 0.8, size: [0.03, 0.08], colors: ['#ffffff', '#e8f4f4'], alpha: 0.55 }));
    this.group.add(particles(U, { count: 260, min: [-8, 0.5, -10], max: [8, 9, 2], vel: [0.03, 0.05, 0], sway: 0.4, size: [0.015, 0.03], colors: ['#fff6c8', '#e8ffd0'], alpha: 0.6 }));   // motes in the light
    const rays = new THREE.Mesh(new THREE.PlaneGeometry(10, 26), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec2 vUv; ${NOISE}
        void main(){ float beams = pow(fbm(vec3(vUv.x * 9.0 + vUv.y * 2.0, uTime * 0.03, 1.0)), 3.0) * 2.5;
          float a = beams * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y) * sin(vUv.x * 3.14159);
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * a * 0.22 * uFade, 1.0); }`,
    }));
    rays.position.set(-4.5, 11, -6.5);
    rays.rotation.set(0, 0.4, 0.38);
    this.group.add(rays);

    this.nextBird = 3;
  }

  // ---- sound: the roar of the falls (layered filtered noise that surges gently) and birdsong
  _sound() {
    if (this.snd) return this.snd;
    if (this.muted) return null;
    const A = SFX.audio();
    if (!A || !A.noise || this.fade < 0.05) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.25; out.connect(send).connect(A.reverb);
    const layers = [];
    // [filter type, frequency, Q, level, pan]: the deep roar, the body of the water, the hiss of spray
    for (const [type, f, q, level, pan] of [['lowpass', 380, 0.7, 0.55, 0], ['bandpass', 900, 0.5, 0.32, -0.25], ['bandpass', 1400, 0.6, 0.26, 0.25], ['highpass', 4200, 0.5, 0.09, 0]]) {
      const n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = level;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      n.connect(fl).connect(g).connect(p).connect(out);
      n.start(0, Math.random() * 3);
      layers.push({ n, fl, g, level, f });
    }
    this.snd = { ctx, A, out, send, layers };
    return this.snd;
  }

  _bird() {
    const S = this.snd;
    if (!S) return;
    const { ctx, A } = S, t0 = ctx.currentTime + 0.05;
    const pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 1.6;
    const g = ctx.createGain(); g.gain.value = 0.05 * this.fade;
    g.connect(pan).connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.6; pan.connect(send).connect(A.reverb);
    const base = 2400 + Math.random() * 1800, notes = 3 + Math.floor(Math.random() * 5);
    let t = t0;
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator(), e = ctx.createGain();
      const f = base * (1 + (Math.random() - 0.3) * 0.35), dur = 0.06 + Math.random() * 0.1;
      o.type = 'sine';
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * (Math.random() < 0.5 ? 1.35 : 0.75), t + dur);
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(1, t + 0.012); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(e).connect(g); o.start(t); o.stop(t + dur + 0.02);
      t += dur + 0.04 + Math.random() * 0.08;
    }
    setTimeout(() => { try { g.disconnect(); pan.disconnect(); send.disconnect(); } catch (_) {} }, (t - t0 + 1) * 1000);
  }

  update(dt) {
    const S = this._sound();
    if (S) {
      const now = S.ctx.currentTime;
      S.out.gain.setTargetAtTime(0.32 * this.fade, now, 0.4);
      // the falls surge and ease, never quite the same
      for (const L of S.layers) {
        if (Math.random() < dt * 0.6) L.g.gain.setTargetAtTime(L.level * (0.75 + Math.random() * 0.5), now, 0.8);
        if (Math.random() < dt * 0.3) L.fl.frequency.setTargetAtTime(L.f * (0.85 + Math.random() * 0.3), now, 1.2);
      }
      this.nextBird -= dt;
      if (this.nextBird <= 0) { this.nextBird = 5 + Math.random() * 9; this._bird(); }
    }
  }

  _stop() {
    const S = this.snd;
    if (!S) return;
    S.out.gain.setTargetAtTime(0, S.ctx.currentTime, 0.15);
    for (const L of S.layers) try { L.n.stop(S.ctx.currentTime + 0.8); } catch (_) {}
    setTimeout(() => { try { S.out.disconnect(); S.send.disconnect(); } catch (_) {} }, 1200);
    this.snd = null;
  }

  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
