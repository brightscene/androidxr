import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Wind chimes
// A row of chimes hangs in front of you. Sweep your hand (or point and sweep)
// through them: each one you touch swings away and rings, and as they swing
// they knock against their neighbours, so a single sweep sets off a cascade.
// A gentle breeze stirs them now and then. Tuned to a pentatonic scale, so
// every combination sounds sweet.
//   metal: long silver tubes with shimmering tails, under a blue-hour sky
//   wood:  bamboo with a warm, hollow knock, in a golden bamboo grove

// C major pentatonic, low to high
const METAL_NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
const WOOD_NOTES = [196.0, 220.0, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
const D = 0.56;          // how far in front of you the chimes hang (m)
const TOP = 0.3;         // the bar they hang from, above your eyes (m)
const G = 9.8;

export class WindChimesScene extends BaseScene {
  constructor(kind = 'metal') {
    super();
    this.wantsPointer = true;
    this.wantsHands = true;   // your own hands brush the chimes; no pointer beams
    this.kind = kind;
    const wood = kind === 'wood';
    this.wood = wood;
    const U = this.uniforms;

    // the sky
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir); float y = d.y; float az = atan(d.x, -d.z);
          ${wood
    ? `// golden hour in a bamboo grove: warm light behind tall dark stems
          vec3 c = mix(vec3(0.95, 0.62, 0.3), vec3(0.32, 0.22, 0.3), smoothstep(-0.05, 0.6, y));
          c += vec3(1.0, 0.75, 0.4) * exp(-pow(length(vec2(az - 0.5, (y - 0.08) * 2.0)) * 2.2, 2.0)) * 0.6;   // the low sun
          float stems = smoothstep(0.62, 0.7, fbm(vec3(az * 18.0, 0.0, 1.0))) + smoothstep(0.66, 0.72, fbm(vec3(az * 31.0, 3.0, 2.0)));
          float leaves = smoothstep(0.5, 0.7, fbm(vec3(az * 10.0, y * 6.0 - uTime * 0.02, 4.0))) * smoothstep(0.25, 0.6, y);
          c = mix(c, vec3(0.06, 0.07, 0.03), clamp(stems, 0.0, 1.0) * 0.9);
          c = mix(c, vec3(0.08, 0.12, 0.04), leaves * 0.85);
          c = mix(c, vec3(0.05, 0.04, 0.02), smoothstep(0.02, -0.12, y));`
    : `// blue hour: deep blue overhead, a last rose glow on the horizon, soft clouds drifting
          vec3 c = mix(vec3(0.85, 0.55, 0.55), vec3(0.18, 0.25, 0.52), smoothstep(-0.02, 0.35, y));
          c = mix(c, vec3(0.04, 0.06, 0.2), smoothstep(0.3, 0.9, y));
          float cl = smoothstep(0.5, 0.8, fbm(vec3(d.x * 2.5 + uTime * 0.01, y * 6.0, d.z * 2.5)));
          c = mix(c, vec3(0.55, 0.5, 0.65), cl * smoothstep(0.02, 0.2, y) * 0.35);
          float hills = 0.02 + 0.05 * fbm(vec3(az * 2.0, 1.0, 1.0));
          c = mix(c, vec3(0.04, 0.05, 0.1), smoothstep(hills + 0.004, hills - 0.004, y));`}
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    dome.renderOrder = -5;
    this.group.add(dome);
    this.group.add(particles(U, wood
      ? { count: 160, min: [-5, -1, -5], max: [5, 3, 2], vel: [0.12, -0.05, 0], sway: 0.5, size: [0.02, 0.04], colors: ['#7a8a2a', '#a8a040'], alpha: 0.7, shape: 'leaf' }
      : { count: 300, min: [-5, -1, -5], max: [5, 3, 2], vel: [0.05, 0.02, 0], sway: 0.4, size: [0.006, 0.014], colors: ['#ffe8d8', '#d8e4ff'], alpha: 0.5 }));

    this.rig = new THREE.Group();
    this.rig.position.set(0, 1.6, 0);
    this.group.add(this.rig);

    // the chimes, spaced so they nearly touch along a gentle arc
    const notes = wood ? WOOD_NOTES : METAL_NOTES;
    const radius = (i) => (wood ? 0.019 - i * 0.0008 : 0.012 - i * 0.00035);
    const length = (f) => (wood ? 0.62 : 0.7) * Math.sqrt(notes[0] / f);
    let s = 0;
    const specs = notes.map((f, i) => { const r = radius(i); const spec = { f, r, L: length(f), s: 0 }; return spec; });
    specs.forEach((c, i) => { if (i) s += specs[i - 1].r + c.r + (wood ? 0.016 : 0.014); c.s = s; });
    const mid = s / 2;
    const tubeMat = this._tubeMaterial(wood);
    this.chimes = specs.map((c, i) => {
      const phi = (c.s - mid) / D;   // angle round the arc
      const pivot = new THREE.Vector3(Math.sin(phi) * D, TOP, -Math.cos(phi) * D);
      const g = new THREE.Group();
      g.position.copy(pivot);
      g.rotation.order = 'YXZ';
      this.rig.add(g);
      const hang = 0.05 + (i % 2) * 0.02;   // the string
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(c.r, c.r, c.L, wood ? 14 : 20, wood ? 3 : 1, true), tubeMat);
      tube.position.y = -hang - c.L / 2;
      g.add(tube);
      if (wood) {   // bamboo nodes
        for (const k of [0.3, 0.72]) {
          const node = new THREE.Mesh(new THREE.TorusGeometry(c.r * 1.02, c.r * 0.12, 6, 16), tubeMat);
          node.rotation.x = Math.PI / 2; node.position.y = -hang - c.L * k;
          g.add(node);
        }
      }
      const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, hang, 4), new THREE.MeshBasicMaterial({ color: wood ? 0x6a5030 : 0xb8b8c8 }));
      string.position.y = -hang / 2;
      g.add(string);
      return { ...c, i, phi, pivot, g, hang, at: 0, ar: 0, wt: 0, wr: 0, last: -9 };
    });
    this.span = s;

    // the bar they hang from
    const bar = new THREE.Mesh(new THREE.TorusGeometry(D, wood ? 0.016 : 0.011, 10, 64, (s + 0.12) / D), new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uFade; varying vec3 vN; void main(){ float l = 0.4 + 0.6 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.8, 0.5))), 0.0); gl_FragColor = vec4(${wood ? 'vec3(0.36, 0.22, 0.1)' : 'vec3(0.3, 0.2, 0.14)'} * l * uFade, 1.0); }`,
    }));
    bar.rotation.set(Math.PI / 2, 0, -Math.PI / 2 - (s + 0.12) / D / 2);
    bar.position.y = TOP;
    this.rig.add(bar);

    this.probes = new Map();   // pointer id -> last probe point
    this.placeNext = true;
    this.nextBreeze = 2;
    this.voices = 0;
  }

  _tubeMaterial(wood) {
    return new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: wood
        ? /* glsl */ `uniform float uFade; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
          void main(){ vec3 n = normalize(vN); float l = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.5, 0.6, 0.6))), 0.0);
            float streak = 0.8 + 0.2 * fbm(vec3(atan(vP.z, vP.x) * 8.0, vP.y * 4.0, 1.0));
            vec3 c = mix(vec3(0.62, 0.48, 0.2), vec3(0.8, 0.66, 0.32), streak) * l;
            c += vec3(1.0, 0.8, 0.5) * pow(1.0 - abs(dot(n, normalize(vV))), 3.0) * 0.25;
            gl_FragColor = vec4(c * uFade, 1.0); }`
        : /* glsl */ `uniform float uFade, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ vec3 n = normalize(vN), v = normalize(vV);
            // brushed silver reflecting the dusk sky
            vec3 r = reflect(-v, n);
            vec3 env = mix(vec3(0.85, 0.6, 0.6), vec3(0.3, 0.38, 0.7), smoothstep(-0.2, 0.6, r.y));
            float spec = pow(max(dot(r, normalize(vec3(-0.2, 0.3, 0.9))), 0.0), 40.0);
            vec3 c = env * 0.75 + vec3(1.0, 0.92, 0.88) * spec * 1.2 + vec3(0.9, 0.9, 1.0) * pow(1.0 - abs(dot(n, v)), 4.0) * 0.4;
            gl_FragColor = vec4(c * uFade, 1.0); }`,
    });
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

  // ---- sound: one ring of a chime
  _ring(c, strength) {
    if (this.muted || this.fade < 0.12 || this.voices > 28) return;
    const A = SFX.audio();
    if (!A) return;
    const { ctx } = A, t = ctx.currentTime + 0.005;
    const out = ctx.createGain(); out.gain.value = Math.min(1, strength) * 0.22 * this.fade;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-0.9, Math.min(0.9, Math.sin(c.phi) * 2.2));
    out.connect(pan).connect(A.out);
    const send = ctx.createGain(); send.gain.value = this.wood ? 0.3 : 0.55; pan.connect(send).connect(A.reverb);
    const nodes = [out, pan, send];
    // partials of a free-hanging tube: [ratio, level, decay seconds]
    const parts = this.wood
      ? [[1, 1, 0.55], [2.42, 0.32, 0.22], [4.1, 0.12, 0.1]]
      : [[1, 0.8, 7.5], [2.756, 0.6, 4.2], [5.404, 0.32, 2.2], [8.933, 0.14, 1.1]];
    let longest = 0;
    for (const [ratio, level, decay] of parts) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = c.f * ratio * (1 + (Math.random() - 0.5) * 0.0015);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay * (0.85 + strength * 0.3));
      o.connect(g).connect(out);
      o.start(t); o.stop(t + decay * 1.2 + 0.05);
      nodes.push(o, g);
      longest = Math.max(longest, decay * 1.2);
    }
    // the moment of contact: a bright tick for metal, a hollow knock for bamboo
    if (A.noise) {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = A.noise;
      bp.type = 'bandpass'; bp.frequency.value = this.wood ? c.f * 3 : 6500; bp.Q.value = this.wood ? 2.5 : 1.2;
      g.gain.setValueAtTime(this.wood ? 0.9 : 0.25, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (this.wood ? 0.05 : 0.02));
      n.connect(bp).connect(g).connect(out);
      n.start(t, Math.random() * 2); n.stop(t + 0.08);
      nodes.push(n, bp, g);
    }
    this.voices++;
    setTimeout(() => { this.voices--; nodes.forEach((x) => { try { x.disconnect(); } catch (_) {} }); }, (longest + 0.3) * 1000);
  }

  // a chime gets a push (m/s along the arc, and towards/away from you)
  _push(c, vt, vr, t) {
    const k = 0.55 / (c.L * 0.66);
    c.wt += vt * k; c.wr += vr * k;
    const speed = Math.hypot(vt, vr);
    if (t - c.last > 0.09 && speed > 0.05) { this._ring(c, 0.25 + speed * 0.9); c.last = t; }
  }

  // the point where a pointer passes through the curtain of chimes
  _probe(p) {
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    if (p.tip) return p.tip.clone().applyMatrix4(inv);
    const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
    // the ray against the arc's cylinder (radius D round you)
    const a = d.x * d.x + d.z * d.z, b = 2 * (o.x * d.x + o.z * d.z), cc = o.x * o.x + o.z * o.z - D * D;
    const disc = b * b - 4 * a * cc;
    if (a < 1e-6 || disc < 0) return null;
    const t = (-b + Math.sqrt(disc)) / (2 * a);
    return t > 0 ? o.addScaledVector(d, t) : null;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    dt = Math.min(dt, 0.05);

    // hands and pointers sweeping through
    let pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    // in the headset: hide the beams; controllers brush with their own position,
    // tracked hands with every fingertip
    if (INPUT.xr && !this.demo) {
      const over = (this.hideRays ||= new Set());
      over.clear();
      for (const p of INPUT.pointers) over.add(p.id);
      pointers = INPUT.pointers.map((p) => (p.tip ? p : { ...p, tip: p.origin }));
      for (const h of INPUT.hands) for (const j of [14, 19, 24]) if (h.joints[j]) pointers.push({ id: `${h.side}-${j}`, tip: h.joints[j], origin: h.joints[j], dir: new THREE.Vector3(0, 0, -1) });
    }
    const live = new Set();
    for (const p of pointers) {
      const q = this._probe(p);
      if (!q) continue;
      live.add(p.id);
      const prev = this.probes.get(p.id);
      this.probes.set(p.id, q);
      if (!prev) continue;
      const v = q.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
      if (v.length() > 6) continue;   // a jump (pointer appeared elsewhere), not a sweep
      // check the whole path the hand moved along this frame, so a quick sweep can't skip a chime
      const steps = Math.min(12, Math.max(1, Math.ceil(q.distanceTo(prev) / 0.008)));
      const hit = new Set();
      for (let k = 1; k <= steps; k++) {
        const qs = prev.clone().lerp(q, k / steps);
        for (const c of this.chimes) if (!hit.has(c) && this._touches(c, qs, p.tip ? 0.018 : 0.026)) hit.add(c);
      }
      for (const c of hit) {
        const tang = new THREE.Vector3(Math.cos(c.phi), 0, Math.sin(c.phi)), rad = new THREE.Vector3(Math.sin(c.phi), 0, -Math.cos(c.phi));
        this._push(c, v.dot(tang), v.dot(rad), t);
      }
    }
    for (const id of [...this.probes.keys()]) if (!live.has(id)) this.probes.delete(id);
    this._swing(dt, t);
  }

  // is this point touching a chime where it hangs right now?
  _touches(c, q, tol) {
    const bottomY = TOP - c.hang - c.L * Math.cos(c.at) * Math.cos(c.ar);
    if (q.y > TOP - c.hang + 0.01 || q.y < bottomY - 0.01) return false;
    const depth = (TOP - c.hang - q.y) / (c.L + c.hang);
    const tang = new THREE.Vector3(Math.cos(c.phi), 0, Math.sin(c.phi)), rad = new THREE.Vector3(Math.sin(c.phi), 0, -Math.cos(c.phi));
    const axis = c.pivot.clone().addScaledVector(tang, Math.sin(c.at) * c.L * depth).addScaledVector(rad, Math.sin(c.ar) * c.L * depth);
    return Math.hypot(q.x - axis.x, q.z - axis.z) < c.r + tol;
  }

  _swing(dt, t) {
    // a breeze now and then
    this.nextBreeze -= dt;
    if (this.nextBreeze <= 0) {
      this.nextBreeze = 4 + Math.random() * 7;
      const k = Math.floor(Math.random() * this.chimes.length);
      for (let j = Math.max(0, k - 1); j <= Math.min(this.chimes.length - 1, k + 1); j++) this._push(this.chimes[j], (Math.random() - 0.3) * 0.25, (Math.random() - 0.5) * 0.12, t);
    }

    // swinging, and knocking into neighbours along the arc
    for (const c of this.chimes) {
      const w0 = Math.sqrt(G / (c.L * 0.66 + c.hang));
      c.wt += (-w0 * w0 * Math.sin(c.at) - c.wt * 0.35) * dt;
      c.wr += (-w0 * w0 * Math.sin(c.ar) - c.wr * 0.35) * dt;
      c.at += c.wt * dt; c.ar += c.wr * dt;
      if (Math.abs(c.at) > 0.6) { c.at = Math.sign(c.at) * 0.6; c.wt *= -0.3; }
      if (Math.abs(c.ar) > 0.6) { c.ar = Math.sign(c.ar) * 0.6; c.wr *= -0.3; }
    }
    for (let i = 0; i < this.chimes.length - 1; i++) {
      const a = this.chimes[i], b = this.chimes[i + 1];
      const L = Math.min(a.L, b.L) * 0.9;
      const gap = (b.s - a.s) + L * (Math.sin(b.at) - Math.sin(a.at)) - (a.r + b.r);
      const closing = (a.wt - b.wt) * L;
      if (gap < 0 && closing > 0) {
        // an elastic knock: they swap their swing along the arc, both ring
        const avg = (a.wt + b.wt) / 2;
        a.wt = avg - (a.wt - avg) * 0.85; b.wt = avg - (b.wt - avg) * 0.85;
        if (t - a.last > 0.07) { this._ring(a, 0.15 + closing * 1.4); a.last = t; }
        if (t - b.last > 0.07) { this._ring(b, 0.15 + closing * 1.4); b.last = t; }
      }
    }
    for (const c of this.chimes) c.g.rotation.set(c.ar, -c.phi, c.at);
  }

  // for previews: an invisible hand sweeps slowly back and forth through the chimes
  _demoPointers(t) {
    const x = Math.sin(t * 0.55) * (this.span / 2 + 0.06) / D;
    const local = new THREE.Vector3(Math.sin(x) * D, TOP - 0.25 + Math.sin(t * 1.3) * 0.06, -Math.cos(x) * D);
    const world = local.applyMatrix4(this.rig.matrixWorld);
    return [{ id: 'demo', origin: world, dir: new THREE.Vector3(0, 0, -1), tip: world }];
  }
}

WindChimesScene.prototype.silence = function () { this.muted = true; };

export class WoodenChimesScene extends WindChimesScene {
  constructor() { super('wood'); }
}
