import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Recovery capsule
// A healing scanner in orbit (it began as the "Space MRI machine"). You begin in a quiet white bay high above the
// Earth, the great ring of the machine ahead of you, and glide slowly into its
// bore. Inside, the walls come alive: soft rings of light sweep past you one
// after another, a holographic hex lattice shimmers across the walls, a double
// helix of light spirals round you, golden motes of healing light stream in,
// and now and then the walls open out into the stars before closing again.
// Colours drift from teal to gold to violet; a soft hum pulses with each scan,
// and a gentle chime marks each pass.

const BORE = 0.85, LEN = 7, EYE = 1.6;
const ENTER = 16;   // seconds to glide in

export class MriScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    this.mu = { ...U, uScan: { value: -9 }, uScan2: { value: -9 }, uOpen: { value: 0 }, uHue: { value: 0 }, uGrid: { value: 0 }, uIn: { value: 0 } };

    // the bay in orbit: deep space, the Earth's glowing limb below, a soft white floor
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.mu,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.005, 0.008, 0.02), vec3(0.04, 0.03, 0.08), fbm(d * 2.0));
          vec3 p = d * 220.0, cell = floor(p);
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          if (h > 0.986) c += vec3(0.9) * smoothstep(0.3, 0.0, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 60.0));
          // the Earth below: a blue, cloud-streaked curve with a thin bright atmosphere
          float e = d.y + 0.32 + 0.06 * d.x * d.x;
          if (e < 0.0) {
            float cl = fbm(vec3(d.xz * 6.0, uTime * 0.005));
            c = mix(vec3(0.02, 0.08, 0.2), vec3(0.05, 0.25, 0.4), fbm(vec3(d.xz * 3.0, 1.0)));
            c = mix(c, vec3(0.85, 0.9, 0.95), smoothstep(0.55, 0.75, cl) * 0.8);
            c *= 0.6 + 0.4 * smoothstep(-0.4, 0.0, e);
          }
          c += vec3(0.3, 0.6, 1.0) * exp(-abs(e) * 40.0) * 0.9 + vec3(0.2, 0.4, 0.9) * exp(-abs(e) * 8.0) * 0.15;
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));
    const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: this.mu,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uFade, uIn; varying vec2 vP; void main(){ float r = length(vP) / 4.0; float grid = smoothstep(0.03, 0.0, abs(fract(vP.x * 2.0) - 0.5) - 0.47) + smoothstep(0.03, 0.0, abs(fract(vP.y * 2.0) - 0.5) - 0.47);
        vec3 c = vec3(0.75, 0.8, 0.85) * (0.35 + 0.1 * grid) + vec3(0.2, 0.6, 0.8) * grid * 0.15; gl_FragColor = vec4(c * uFade, smoothstep(1.0, 0.6, r) * 0.9 * uFade * (1.0 - uIn)); }`,
    }));
    floor.rotation.x = -Math.PI / 2;
    this.group.add(floor);

    // the machine glides towards you: its housing, and the bore you end up inside
    this.machine = new THREE.Group();
    this.machine.position.set(0, EYE, -LEN / 2 - 4.5);
    this.group.add(this.machine);
    // housing: a deep white ring with a glowing teal band round the opening
    const white = new THREE.ShaderMaterial({
      uniforms: this.mu,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uFade; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN); float l = 0.45 + 0.55 * max(dot(n, normalize(vec3(-0.3, 0.7, 0.6))), 0.0);
        float spec = pow(max(dot(reflect(-normalize(vV), n), normalize(vec3(-0.3, 0.7, 0.6))), 0.0), 40.0);
        gl_FragColor = vec4((vec3(0.9, 0.92, 0.95) * l + spec * 0.5) * uFade, 1.0); }`,
    });
    const front = new THREE.Mesh(new THREE.RingGeometry(BORE, 2.1, 96), white);
    front.position.z = LEN / 2;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.6, 96, 1, true).rotateX(Math.PI / 2), white);
    shell.position.z = LEN / 2 - 0.8;
    const band = new THREE.Mesh(new THREE.TorusGeometry(BORE + 0.08, 0.025, 12, 96), new THREE.ShaderMaterial({
      uniforms: this.mu,
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uFade, uTime, uHue; vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ gl_FragColor = vec4(mix(vec3(0.3, 0.95, 1.0), hue(0.5 + uHue), 0.5) * (1.2 + 0.3 * sin(uTime * 2.0)) * uFade, 1.0); }`,
    }));
    band.position.z = LEN / 2 + 0.01;
    this.machine.add(front, shell, band);

    // the bore: a tunnel of soft light panels that comes alive
    const bore = new THREE.Mesh(new THREE.CylinderGeometry(BORE, BORE, LEN, 96, 40, true).rotateX(Math.PI / 2), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, uniforms: this.mu,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uScan, uScan2, uOpen, uHue, uGrid; varying vec3 vP; ${NOISE} ${GRADE}
        vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){
          float a = atan(vP.y, vP.x), z = vP.z;
          vec3 tint = mix(vec3(0.35, 0.95, 1.0), hue(0.5 + uHue), 0.55);
          // soft white panels with fine seams
          float seam = smoothstep(0.02, 0.0, abs(fract(a / 6.28318 * 16.0) - 0.5) - 0.48) + smoothstep(0.02, 0.0, abs(fract(z * 0.8) - 0.5) - 0.48);
          vec3 c = mix(vec3(0.1, 0.13, 0.2), vec3(0.32, 0.38, 0.48), 0.5 + 0.5 * sin(a * 2.0 + uTime * 0.1)) * (0.8 + 0.25 * seam);   // deep, pearly panels
          // energy flowing along the walls, like aurora
          float flow = fbm(vec3(a * 2.0, z * 0.6 - uTime * 0.35, uTime * 0.05));
          c += tint * smoothstep(0.42, 0.8, flow) * 0.9;
          c += mix(tint, vec3(1.0, 0.8, 0.5), 0.5) * pow(fbm(vec3(a * 6.0, z * 2.0 - uTime * 0.8, 3.0)), 4.0) * 1.2;   // fine filaments of light
          // the holographic lattice
          vec2 hp = vec2(a * ${(BORE * 7).toFixed(2)}, z * 7.0);
          vec2 hq = vec2(hp.x + hp.y * 0.5, hp.y * 0.866);
          vec2 hf = fract(hq) - 0.5;
          float hex = smoothstep(0.05, 0.0, abs(max(abs(hf.x), abs(hf.y)) - 0.45));
          c += tint * hex * uGrid * (0.5 + 0.5 * sin(uTime * 3.0 + z * 2.0));
          // the scan rings sweeping past you
          float s1 = exp(-pow((z - uScan) * 5.0, 2.0)), s2 = exp(-pow((z - uScan2) * 5.0, 2.0));
          c += tint * (s1 + s2) * 2.2 + vec3(1.0) * (exp(-pow((z - uScan) * 22.0, 2.0)) + exp(-pow((z - uScan2) * 22.0, 2.0))) * 1.2;
          // the far end glows like a doorway of light
          c += mix(vec3(1.0, 0.95, 0.85), tint, 0.3) * smoothstep(${(-LEN / 2 + 1.5).toFixed(1)}, ${(-LEN / 2).toFixed(1)}, z) * 1.2;
          // the walls open out into the stars
          float open = uOpen * smoothstep(0.2, 0.8, fbm(vec3(a * 1.5, z * 0.3, uTime * 0.1)) + uOpen * 0.5);
          gl_FragColor = vec4(grade(c), (1.0 - open) * uFade); }`,
    }));
    this.machine.add(bore);
    // the far end: a radiant doorway of light
    const door = new THREE.Mesh(new THREE.CircleGeometry(BORE, 64), new THREE.ShaderMaterial({
      uniforms: this.mu,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uFade, uTime, uHue; varying vec2 vP;
        vec3 hue(float h){ return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ float r = length(vP) / ${BORE.toFixed(2)};
          vec3 tint = mix(vec3(0.35, 0.95, 1.0), hue(0.5 + uHue), 0.55);
          vec3 c = mix(vec3(1.0, 0.97, 0.9) * 1.6, tint, smoothstep(0.0, 0.9, r));
          c += tint * 0.5 * (0.5 + 0.5 * sin(r * 30.0 - uTime * 2.0)) * smoothstep(0.2, 0.9, r);
          gl_FragColor = vec4(c * (0.85 + 0.15 * sin(uTime * 0.7)) * uFade, 1.0); }`,
    }));
    door.position.z = -LEN / 2 + 0.01;
    this.machine.add(door);

    // inside: a slowly turning double helix of light, and golden motes streaming in
    const N = 900;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const strand = i % 3, k = Math.floor(i / 3) / (N / 3);
      const z = LEN / 2 - k * LEN, a = k * Math.PI * 14 + (strand === 1 ? Math.PI : 0);
      const r = strand === 2 ? (Math.random() * 2 - 1) * 0.55 : 0.55;   // the third: rungs between the strands
      pos.set([Math.cos(a) * r, Math.sin(a) * r, z], i * 3);
      const c = new THREE.Color().setHSL(strand === 2 ? 0.12 : 0.48 + strand * 0.25, 0.9, 0.65);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    hg.setAttribute('aCol', new THREE.Float32BufferAttribute(col, 3));
    this.helix = new THREE.Points(hg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...this.mu, uHA: { value: 0 } },
      vertexShader: `attribute vec3 aCol; uniform float uViewH, uTime; varying vec3 vC; void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 0.025 * projectionMatrix[1][1] * uViewH / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: 'uniform float uFade, uHA; varying vec3 vC; void main(){ float r = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(vC * exp(-r * r * 4.0) * uHA * uFade, 1.0); }',
    }));
    this.helix.frustumCulled = false;
    this.machine.add(this.helix);
    this.motes = particles(this.mu, { count: 500, min: [-0.7, -0.7, -LEN / 2], max: [0.7, 0.7, LEN / 2], vel: [0, 0, 0.6], sway: 0.15, size: [0.008, 0.02], colors: ['#ffe2a8', '#fff3d8', '#9affe8'], alpha: 0 });
    this.machine.add(this.motes);

    this.t = 0; this.scanT = 0; this.nextOpen = 50; this.openT = -1;
  }

  // a soft hum under each scan pass: a low tone breathing with the sweep
  _hum() {
    if (this.hum || this.muted) return this.hum;
    const A = SFX.audio();
    if (!A) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0; out.connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.7; out.connect(send).connect(A.reverb);
    const oscs = [[85.5, 0.6], [128.25, 0.25], [171, 0.15]].map(([f, w]) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = w; o.connect(g).connect(out); o.start(); return o; });
    this.hum = { ctx, out, send, oscs };
    return this.hum;
  }

  update(dt, t) {
    const M = this.mu;
    this.t += dt;
    // gliding in: the machine slides over you, easing to a stop with you at its centre
    const g = Math.min(1, this.t / ENTER), e = g * g * (3 - 2 * g);
    this.machine.position.z = (-LEN / 2 - 4.5) * (1 - e) + 0.2 * e;
    M.uIn.value = e;
    const inside = this.t > ENTER * 0.85;
    // scans: rings of light sweeping along the bore, from the far end towards you and past
    this.scanT += dt;
    const period = 9;
    const s = (this.scanT % period) / period;
    M.uScan.value = -LEN / 2 + s * LEN;
    M.uScan2.value = -LEN / 2 + ((s + 0.5) % 1) * LEN;
    if (inside && Math.floor(this.scanT / period) !== this.lastScan) { this.lastScan = Math.floor(this.scanT / period); if (this.fade > 0.5) SFX.play('chime', { gain: 0.22, dur: 5, note: [1, 1.25, 1.5, 2][this.lastScan % 4], pan: 0 }); }
    M.uGrid.value += ((inside ? 0.35 + 0.25 * Math.sin(t * 0.2) : 0) - M.uGrid.value) * Math.min(1, dt);
    M.uHue.value = (t * 0.008) % 1;
    this.helix.material.uniforms.uHA.value += ((inside ? 0.9 : 0) - this.helix.material.uniforms.uHA.value) * Math.min(1, dt * 0.4);
    this.helix.rotation.z += dt * 0.08;
    this.motes.userData.u.uAlpha.value = inside ? 0.8 : 0;
    // now and then the walls open to the stars, then close again
    this.nextOpen -= dt;
    if (this.nextOpen <= 0 && this.openT < 0 && inside) { this.openT = 0; this.nextOpen = 60 + Math.random() * 30; }
    if (this.openT >= 0) { this.openT += dt; M.uOpen.value = Math.sin(Math.PI * Math.min(1, this.openT / 18)); if (this.openT > 18) { this.openT = -1; M.uOpen.value = 0; } }
    // the hum breathes with the nearer scan ring
    const H = inside ? this._hum() : this.hum;
    if (H) {
      const near = Math.max(Math.exp(-((M.uScan.value - 0.2) ** 2) * 2), Math.exp(-((M.uScan2.value - 0.2) ** 2) * 2));
      H.out.gain.setTargetAtTime((inside ? 0.012 + near * 0.03 : 0) * this.fade, H.ctx.currentTime, 0.2);
    }
  }

  _stop() {
    const H = this.hum;
    if (!H) return;
    const end = H.ctx.currentTime + 0.6;
    H.out.gain.setTargetAtTime(0, H.ctx.currentTime, 0.1);
    for (const o of H.oscs) try { o.stop(end); } catch (_) {}
    setTimeout(() => { try { H.out.disconnect(); H.send.disconnect(); } catch (_) {} }, 900);
    this.hum = null;
  }
  silence() { this._stop(); this.muted = true; }
  setFade(f) { super.setFade(f); if (f < 0.01) this._stop(); }
  dispose() { this._stop(); super.dispose(); }
}
