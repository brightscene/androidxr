import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Space waterfall
// Deep space. A rocky mountain island floats ahead of you among the stars and a
// glowing nebula, and over the rim of its plateau pours a waterfall of glowing
// space water: dense streams of luminous orbs in icy blue, violet and rose,
// falling past the mountain's roots and on forever into the void. You stand on
// a small floating rock; little rocks drift slowly round you. Its sound, a soft
// distant rush with a shimmering pad and the odd crystal sparkle, is made live.

const ISLE = new THREE.Vector3(0, 7, -18);      // the mountain's heart
const LIP = new THREE.Vector3(0, 5.75, -9.6);  // where the falls pour over the front rim of its plateau

export class WaterfallScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;

    // space: stars, a nebula and a distant ringed planet
    this.group.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(80, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        float sdHash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
        float stars(vec3 d, float s, float th){ vec3 p = d * s, c = floor(p); float r = sdHash(c); if (r < th) return 0.0;
          return smoothstep(0.42, 0.05, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (0.7 + r * 3.0) + r * 50.0)); }
        void main(){ vec3 d = normalize(vDir);
          vec3 c = vec3(0.004, 0.006, 0.02);
          // a nebula sweeping across the sky behind the mountain
          float n = fbm(d * 2.2 + vec3(0.0, 0.0, uTime * 0.004)), n2 = fbm(d * 4.5 + 3.0);
          float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.55, -0.8))) * 2.4, 2.0));
          c += mix(vec3(0.12, 0.03, 0.22), vec3(0.03, 0.18, 0.24), n2) * smoothstep(0.35, 0.8, n) * (0.4 + band);
          c += vec3(0.45, 0.12, 0.35) * smoothstep(0.62, 0.85, n2) * band * 0.25;
          c += vec3(stars(d, 240.0, 0.988)) * 0.9 + vec3(0.8, 0.85, 1.0) * stars(d, 90.0, 0.997) * 1.2;
          // a planet low on the left, lit from one side, with a soft haze
          vec3 pc = normalize(vec3(-0.75, 0.2, -0.6));
          vec3 right = normalize(cross(pc, vec3(0.0, 1.0, 0.0))), up = cross(right, pc);
          vec2 q = vec2(dot(d, right), dot(d, up)) / 0.14;
          float r2 = dot(q, q);
          if (dot(d, pc) > 0.0) {
            if (r2 < 1.0) {
              vec3 n = normalize(right * q.x + up * q.y - pc * sqrt(1.0 - r2));
              float lit = max(dot(n, normalize(vec3(0.8, 0.4, 0.4))), 0.0);
              float bands = 0.85 + 0.15 * sin(q.y * 14.0 + fbm(vec3(q * 3.0, 1.0)) * 4.0);
              c = mix(vec3(0.03, 0.02, 0.05), vec3(0.7, 0.5, 0.8) * bands, lit) + vec3(0.25, 0.2, 0.5) * pow(r2, 4.0) * 0.4;
            } else c += vec3(0.45, 0.35, 0.85) * exp(-(sqrt(r2) - 1.0) * 9.0) * 0.18;
          }
          gl_FragColor = vec4(grade(c), uFade); }`,
    })), { renderOrder: -10 }));

    // the floating mountain: a craggy peak above, roots tapering away below
    const rock = (glow) => new THREE.ShaderMaterial({
      uniforms: { ...U, uGlow: { value: glow } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vW; varying vec3 vP; ${NOISE}
        void main(){ vec3 p = position;
          float r = fbm(p * 0.35 + 2.0) - 0.5, r2 = fbm(p * 1.1 + 7.0) - 0.5;
          p += normalize(p) * (r * 2.2 + r2 * 0.6) * length(p) * 0.18;
          vP = p; vW = (modelMatrix * vec4(p, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uGlow; varying vec3 vN; varying vec3 vW; varying vec3 vP; ${NOISE}
        void main(){
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
          float key = max(dot(n, normalize(vec3(0.7, 0.3, 0.6))), 0.0);                 // starlight from the planet's side
          float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
          float strata = fbm(vec3(vW.x * 0.5, vW.y * 1.6, vW.z * 0.5));
          vec3 c = mix(vec3(0.05, 0.045, 0.07), vec3(0.2, 0.17, 0.24), strata) * (0.25 + key * 0.9);
          c += vec3(0.25, 0.4, 0.7) * rim * 0.35;
          // glowing crystal veins
          float vein = smoothstep(0.016, 0.0, abs(fbm(vW * 0.6 + 4.0) - 0.5)) * uGlow * smoothstep(0.4, 0.7, fbm(vW * 0.2 + 9.0));
          c += mix(vec3(0.2, 1.0, 0.7), vec3(0.8, 0.3, 1.0), fbm(vW * 0.3)) * vein * 0.6 * (0.6 + 0.4 * sin(uTime * 0.8 + vW.y));
          // the falls light the rock beside them
          c += vec3(0.2, 0.8, 0.6) * exp(-pow((vW.x) / 3.0, 2.0)) * smoothstep(-6.0, -11.0, vW.z) * 0.18;
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    });
    const peak = new THREE.Mesh(new THREE.ConeGeometry(8, 9, 48, 12), rock(1));
    peak.position.set(ISLE.x, ISLE.y + 3.0, ISLE.z);
    const body = new THREE.Mesh(new THREE.SphereGeometry(8, 64, 32, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), rock(1));
    body.scale.set(1, 1.35, 1);
    body.position.set(ISLE.x, ISLE.y - 1.5, ISLE.z);
    this.group.add(peak, body);

    // the falls: dense streams of glowing space-water orbs pouring off the lip and
    // falling forever into the void, each orb on its own arc, the stream widening as it goes
    const N = 26000;
    const seed = new Float32Array(N * 4), col = new Float32Array(N * 3);
    const pal = ['#9fe4ff', '#7ab8ff', '#a690ff', '#d78cff', '#ff9ad8', '#ffffff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;   // most water in the middle of the stream
      seed.set([g * 1.9, Math.random(), 0.09 + Math.random() * 0.06, 0.03 + Math.random() * 0.07], i * 4);
      const c = pal[Math.floor(Math.random() * pal.length)];
      col.set([c.r, c.g, c.b], i * 3);
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    fg.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 4));
    fg.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    const fall = new THREE.Points(fg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute vec4 aSeed; attribute vec3 aCol; uniform float uTime, uViewH; varying vec3 vC; varying float vA, vBig;
        void main(){
          float lane = aSeed.x, rate = aSeed.z, size = aSeed.w;
          float f = fract(aSeed.y + uTime * rate * 0.35);         // 0 at the lip, 1 far below
          float drop = 150.0 * pow(f, 1.7);                         // gathering speed as it falls
          vec3 p = vec3(${LIP.x.toFixed(2)}, ${LIP.y.toFixed(2)}, ${LIP.z.toFixed(2)});
          p.x += lane * (1.0 + f * 6.0) + sin(uTime * 0.8 + aSeed.y * 40.0) * 0.12 * (0.2 + f * 4.0);
          p.z += 2.2 * (1.0 - exp(-f * 9.0)) + cos(uTime * 0.6 + aSeed.y * 30.0) * 0.1 * f * 6.0;
          p.y -= drop;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float wob = 1.0 + 0.15 * sin(uTime * 5.0 + aSeed.y * 90.0);
          gl_PointSize = size * wob * (1.0 + f * 1.5) * projectionMatrix[1][1] * uViewH / -mv.z;
          gl_Position = projectionMatrix * mv;
          // colours drift like aurora as the orbs fall; dimming slowly far below, never cut off
          vC = mix(aCol, vec3(0.75, 0.6, 1.0), smoothstep(0.2, 1.0, f) * 0.4);
          vA = smoothstep(0.0, 0.015, f) * (1.0 - 0.75 * smoothstep(0.3, 1.0, f)) * (1.0 - smoothstep(0.96, 1.0, f));
          vBig = step(0.2, size);
        }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vC; varying float vA, vBig;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
          float core = exp(-r * r * 10.0), halo = exp(-r * r * 2.5) * 0.35;
          vec3 c = vC * halo + mix(vC, vec3(1.0), 0.6) * core;
          gl_FragColor = vec4(c * vA * uFade, 1.0); }`,
    }));
    fall.frustumCulled = false;
    fall.renderOrder = 5;
    this.group.add(fall);
    // glowing spray around the lip, and a soft luminous haze down the column, deep into the void
    this.group.add(particles(U, { count: 600, min: [-3, LIP.y - 6, LIP.z - 0.5], max: [3, LIP.y + 0.6, LIP.z + 3.5], vel: [0, -0.8, 0.15], sway: 0.6, size: [0.04, 0.1], colors: ['#bfeaff', '#a690ff', '#ff9ad8'], alpha: 0.7 }));
    this.group.add(particles(U, { count: 900, min: [-14, -140, LIP.z - 6], max: [14, LIP.y - 6, LIP.z + 10], vel: [0, -2.5, 0], sway: 1.5, size: [0.2, 0.6], colors: ['#7ab8ff', '#a690ff', '#ff9ad8'], alpha: 0.25 }));

    // the rock you stand on, and little rocks drifting round
    const ledge = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), rock(0.4));
    ledge.scale.set(1, 0.32, 1);
    ledge.rotation.x = Math.PI;
    ledge.position.set(0, -0.02, 0.4);
    this.group.add(ledge);
    this.drifters = [];
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25 + Math.random() * 0.7, 2), rock(0.6));
      const a = Math.random() * Math.PI * 2, R = 6 + Math.random() * 10;
      m.position.set(Math.cos(a) * R, -3 + Math.random() * 12, -6 - Math.abs(Math.sin(a)) * R);
      this.group.add(m);
      this.drifters.push({ m, sp: 0.05 + Math.random() * 0.1, bob: Math.random() * 6 });
    }

    this.nextSpark = 2;
  }

  // ---- sound: a soft distant rush, a shimmering pad, and the odd crystal sparkle
  _sound() {
    if (this.snd) return this.snd;
    if (this.muted) return null;
    const A = SFX.audio();
    if (!A || !A.noise || this.fade < 0.05) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0;
    out.connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.5; out.connect(send).connect(A.reverb);
    const layers = [];
    for (const [type, f, q, level, pan] of [['lowpass', 320, 0.7, 0.3, 0], ['bandpass', 800, 0.5, 0.14, -0.3], ['bandpass', 1300, 0.6, 0.1, 0.3]]) {
      const n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true;
      const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = ctx.createGain(); g.gain.value = level;
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      n.connect(fl).connect(g).connect(p).connect(out);
      n.start(0, Math.random() * 3);
      layers.push({ n, fl, g, level, f });
    }
    // the pad: a slow, shimmering chord (A minor pentatonic), each note breathing on its own
    const pad = [220, 261.63, 329.63, 392, 440, 523.25].map((f, i) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 1.003;
      const g = ctx.createGain(); g.gain.value = 0;
      const p = ctx.createStereoPanner(); p.pan.value = (i % 2 ? 0.5 : -0.5) * (i / 6);
      o.connect(g); o2.connect(g); g.connect(p).connect(out);
      o.start(); o2.start();
      return { o, o2, g, ph: Math.random() * 6, rate: 0.05 + Math.random() * 0.06 };
    });
    this.snd = { ctx, A, out, send, layers, pad };
    return this.snd;
  }

  _spark() {
    const S = this.snd;
    if (!S) return;
    const { ctx, A } = S, t = ctx.currentTime + 0.02;
    const notes = [880, 1046.5, 1318.5, 1568, 1760, 2093];
    const f = notes[Math.floor(Math.random() * notes.length)];
    const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner();
    o.type = 'sine'; o.frequency.value = f;
    p.pan.value = (Math.random() - 0.5) * 1.4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 * this.fade, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.5);
    o.connect(g).connect(p).connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.9; p.connect(send).connect(A.reverb);
    o.start(t); o.stop(t + 3.6);
    setTimeout(() => { try { g.disconnect(); p.disconnect(); send.disconnect(); } catch (_) {} }, 4000);
  }

  update(dt, t) {
    for (const d of this.drifters) {
      d.m.rotation.x += dt * d.sp; d.m.rotation.y += dt * d.sp * 0.7;
      d.m.position.y += Math.sin(t * 0.3 + d.bob) * dt * 0.08;
    }
    const S = this._sound();
    if (!S) return;
    const now = S.ctx.currentTime;
    S.out.gain.setTargetAtTime(0.36 * this.fade, now, 0.4);
    for (const L of S.layers) {
      if (Math.random() < dt * 0.5) L.g.gain.setTargetAtTime(L.level * (0.75 + Math.random() * 0.5), now, 0.9);
    }
    for (const P of S.pad) P.g.gain.setTargetAtTime(0.018 * (0.5 + 0.5 * Math.sin(t * P.rate * 6.28 + P.ph)), now, 0.5);
    this.nextSpark -= dt;
    if (this.nextSpark <= 0) { this.nextSpark = 2.5 + Math.random() * 5; this._spark(); }
  }

  _stop() {
    const S = this.snd;
    if (!S) return;
    const end = S.ctx.currentTime + 0.8;
    S.out.gain.setTargetAtTime(0, S.ctx.currentTime, 0.15);
    for (const L of S.layers) try { L.n.stop(end); } catch (_) {}
    for (const P of S.pad) try { P.o.stop(end); P.o2.stop(end); } catch (_) {}
    setTimeout(() => { try { S.out.disconnect(); S.send.disconnect(); } catch (_) {} }, 1200);
    this.snd = null;
  }

  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
