import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Space waterfall
// Deep space. A rocky mountain island floats ahead of you among the stars and a
// glowing nebula, and from a notch near its peak pours a waterfall made of
// aurora light, rippling green, teal, magenta and violet, falling past the
// mountain's roots and dissolving into the void as glowing spray. You stand on
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

    // the aurora waterfall: ribbons of light pouring off the lip and down into the void
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 34, 1, 60), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: U,
      vertexShader: /* glsl */ `varying vec2 vUv;
        void main(){ vUv = uv; vec3 p = position;
          float f = 1.0 - uv.y;                                  // 0 at the lip
          p.z += 1.6 * sqrt(f) - f * 0.6;                        // arcs out from the lip, then falls
          p.x *= 1.0 + f * 0.9;                                  // spreading as it falls
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec2 vUv; ${NOISE}
        void main(){
          float x = vUv.x, f = 1.0 - vUv.y;
          float speed = 0.6 + f * 1.6;
          float rays = fbm(vec3(x * 22.0, vUv.y * 3.0 + uTime * speed, 1.0));
          float fine = fbm(vec3(x * 70.0, vUv.y * 7.0 + uTime * speed * 1.5, 3.0));
          float edge = smoothstep(0.0, 0.35, x) * smoothstep(1.0, 0.65, x);
          edge *= 0.55 + 0.45 * smoothstep(0.3, 0.7, fbm(vec3(x * 6.0, vUv.y * 0.8 + uTime * 0.3, 8.0)));   // strands, not a sheet
          // aurora colours flowing down and across the falls
          float h = fbm(vec3(x * 2.0, vUv.y * 1.2 + uTime * 0.25, 5.0));
          vec3 col = mix(vec3(0.15, 1.0, 0.5), vec3(0.1, 0.85, 0.95), smoothstep(0.35, 0.6, h));
          col = mix(col, vec3(1.0, 0.25, 0.7), smoothstep(0.58, 0.75, h));
          col = mix(col, vec3(0.6, 0.35, 1.0), smoothstep(0.6, 1.0, f) * 0.6);
          float a = (0.08 + pow(rays, 2.0) * 1.6 + fine * 0.3) * edge;
          a *= smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.55, 1.0, f) * 0.85);   // fading into the void
          gl_FragColor = vec4(col * a * 0.6 * uFade, 1.0); }`,
    }));
    fall.position.set(LIP.x, LIP.y - 17, LIP.z);
    fall.renderOrder = 5;
    this.group.add(fall);
    // a softer veil of light around the falls, and glowing spray where they dissolve
    this.group.add(particles(U, { count: 900, min: [-3.5, -16, LIP.z - 1], max: [3.5, LIP.y - 3, LIP.z + 4], vel: [0, -1.6, 0.1], sway: 0.6, size: [0.05, 0.14], colors: ['#7fffd0', '#5ad8ff', '#ff7ad0', '#b48aff'], alpha: 0.75 }));
    this.group.add(particles(U, { count: 500, min: [-9, -22, LIP.z - 4], max: [9, -6, LIP.z + 6], vel: [0, 0.15, 0], sway: 1.2, size: [0.08, 0.2], colors: ['#7fffd0', '#ff9ae0', '#9ab4ff'], alpha: 0.45 }));

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
