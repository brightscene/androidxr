import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT, damp } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Singing bowls
// A chakra set of seven singing bowls on a low table in front of you. Circle a
// bowl's rim with the mallet (your fingertip, or point and move around the rim)
// and it slowly builds into its singing tone, as a real bowl does; tap or pinch
// on a bowl to strike it. Tibetan: hammered bronze bowls on cushions, water
// rippling inside as they sing. Crystal: frosted quartz bowls that glow their
// chakra colour.

const CHAKRAS = [
  ['Root', 'C', 130.81, '#e0413a'], ['Sacral', 'D', 146.83, '#ff8a2a'], ['Solar plexus', 'E', 164.81, '#ffd23a'],
  ['Heart', 'F', 174.61, '#45d17a'], ['Throat', 'G', 196.0, '#3aa8ff'], ['Third eye', 'A', 220.0, '#6a62ff'], ['Crown', 'B', 246.94, '#b46aff'],
];

// partials: [ratio, weight when rubbed, weight when struck, beat rate (Hz)]
const VOICES = {
  tibetan: { partials: [[1, 1, 0.9, 0.7], [2.76, 0.32, 0.75, 1.3], [5.4, 0.1, 0.45, 2.1], [8.93, 0.03, 0.25, 3.1]], ring: 7, octave: 1 },
  crystal: { partials: [[1, 1, 0.85, 0.25], [2.0, 0.05, 0.18, 0.5], [3.0, 0.025, 0.1, 0.8], [4.0, 0, 0.05, 1.1]], ring: 12, octave: 2 },
};

const TABLE_Y = -0.36;   // table top, relative to your eyes (m)

function bowlProfile(r, crystal) {
  const h = crystal ? 0.78 * r : 0.56 * r;
  const pts = crystal
    ? [[0, 0], [0.9, 0.0], [0.99, 0.08], [1.0, 0.3], [1.0, 1.0], [0.955, 1.0], [0.955, 0.3], [0.94, 0.12], [0, 0.07]]
    : [[0, 0], [0.5, 0.0], [0.8, 0.12], [0.96, 0.42], [1.0, 0.8], [0.975, 1.0], [0.935, 0.99], [0.94, 0.78], [0.88, 0.42], [0.66, 0.18], [0, 0.11]];
  return { h, pts: pts.map(([x, y]) => new THREE.Vector2(Math.max(0.0005, x * r), y * h)) };
}

export class SingingBowlsScene extends BaseScene {
  constructor(kind = 'tibetan') {
    super();
    this.wantsPointer = true;
    this.kind = kind;
    const crystal = kind === 'crystal';
    this.voice = VOICES[kind];
    const U = this.uniforms;

    // the room
    const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          float n = fbm(d * 2.2 + vec3(0.0, uTime * 0.008, 0.0));
          ${crystal
    ? `vec3 c = mix(vec3(0.01, 0.012, 0.04), vec3(0.05, 0.05, 0.13), n);
          c += vec3(0.22, 0.2, 0.5) * exp(-pow(d.y * 3.0 + 0.2, 2.0)) * 0.25 * (0.6 + 0.4 * fbm(d * 4.0 + uTime * 0.02));
          vec3 sp = d * 160.0; float st = step(0.996, fract(sin(dot(floor(sp), vec3(12.9, 78.2, 37.7))) * 43758.5));
          c += vec3(st) * smoothstep(-0.1, 0.4, d.y) * 0.6;`
    : `vec3 c = mix(vec3(0.03, 0.012, 0.008), vec3(0.1, 0.045, 0.02), n);
          // warm candle glows low around the room
          float az = atan(d.x, -d.z);
          float candles = pow(0.5 + 0.5 * cos(az * 5.0), 18.0) * exp(-pow((d.y + 0.05) * 7.0, 2.0));
          c += vec3(1.0, 0.55, 0.2) * candles * (0.35 + 0.08 * sin(uTime * 3.1 + az * 7.0));
          c += vec3(0.25, 0.1, 0.04) * exp(-pow(d.y * 2.5, 2.0)) * 0.3;`}
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    dome.renderOrder = -5;
    this.group.add(dome);
    this.group.add(particles(U, crystal
      ? { count: 500, min: [-5, -1, -6], max: [5, 3, 3], vel: [0, 0.03, 0], sway: 0.3, size: [0.006, 0.016], colors: ['#dfe6ff', '#c8b8ff'], alpha: 0.5 }
      : { count: 450, min: [-5, -1, -6], max: [5, 3, 3], vel: [0, 0.02, 0], sway: 0.3, size: [0.006, 0.014], colors: ['#ffd9a0', '#ffe8c8'], alpha: 0.45 }));

    // everything else hangs off a rig placed where you are
    this.rig = new THREE.Group();
    this.rig.position.set(0, 1.6, 0);
    this.group.add(this.rig);

    // the table
    const table = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec2 vP; ${NOISE}
        void main(){ float r = length(vP) / 0.62;
          ${crystal
    ? `vec3 c = vec3(0.07, 0.07, 0.14) + vec3(0.35, 0.35, 0.7) * smoothstep(0.93, 1.0, r) * 0.6;
          float a = 0.85 * smoothstep(1.0, 0.97, r);`
    : `float grain = fbm(vec3(r * 40.0, atan(vP.y, vP.x) * 1.5, 1.0));
          vec3 c = mix(vec3(0.09, 0.045, 0.022), vec3(0.17, 0.09, 0.045), grain) * (0.75 + 0.25 * smoothstep(1.0, 0.3, r));
          c += vec3(0.25, 0.13, 0.05) * smoothstep(0.95, 1.0, r) * 0.5;
          float a = smoothstep(1.0, 0.985, r);`}
          gl_FragColor = vec4(c, a * uFade); }`,
    }));
    table.rotation.x = -Math.PI / 2;
    table.position.set(0, TABLE_Y, -0.74);
    table.renderOrder = -2;
    this.rig.add(table);

    // the bowls: four larger in front, three smaller behind
    const scale = crystal ? 1.08 : 1;
    const radii = [0.1, 0.093, 0.086, 0.08, 0.074, 0.069, 0.065].map((r) => r * scale);
    const rows = [{ ids: [0, 1, 2, 3], D: 0.64 }, { ids: [4, 5, 6], D: 0.92 }];
    this.bowls = [];
    for (const row of rows) {
      const widths = row.ids.map((i) => radii[i] * 2 + 0.035);
      const total = widths.reduce((a, b) => a + b, 0);
      let s = -total / 2;
      row.ids.forEach((i, k) => {
        const ang = (s + widths[k] / 2) / row.D;   // along the arc, left to right
        s += widths[k];
        this.bowls[i] = this._bowl(i, radii[i], crystal, new THREE.Vector3(Math.sin(ang) * row.D, TABLE_Y, -Math.cos(ang) * row.D), ang);
      });
    }

    // the mallet
    this.mallet = this._mallet(crystal);
    this.rig.add(this.mallet);

    this.hint = textPlane(U, 0.9, 0.07);
    this.hint.position.set(0, TABLE_Y + 0.4, -1.05);
    this.hint.userData.set('Circle a rim with the mallet to make it sing · tap to strike');
    this.rig.add(this.hint);
    this.hintA = 1;

    this.touch = new Map();     // pointer id -> { bowl, angle }
    this.placeNext = true;
    this.audio = null;
  }

  _bowl(i, r, crystal, pos, ang) {
    const [name, note, f0, col] = CHAKRAS[i];
    const { h, pts } = bowlProfile(r, crystal);
    const g = new THREE.Group();
    g.position.copy(pos);
    this.rig.add(g);
    const lift = crystal ? 0.004 : 0.03;   // Tibetan bowls sit on cushions
    const colour = new THREE.Color(col);
    const u = { ...this.uniforms, uSing: { value: 0 }, uStrike: { value: 0 }, uCol: { value: colour }, uR: { value: r }, uH: { value: h } };

    const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 72), new THREE.ShaderMaterial({
      side: THREE.DoubleSide, transparent: crystal, depthWrite: !crystal, uniforms: u,
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP;
        void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: crystal
        ? /* glsl */ `uniform float uTime, uFade, uSing, uStrike, uR, uH; uniform vec3 uCol; varying vec3 vN; varying vec3 vV; varying vec3 vP;
          void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
            float fr = pow(1.0 - abs(dot(n, normalize(vV))), 2.2);
            float hgt = vP.y / uH;
            vec3 frost = vec3(0.86, 0.88, 0.95);
            float glow = uSing * (0.6 + 0.4 * sin(uTime * 6.0 - hgt * 9.0)) + uStrike;
            vec3 c = frost * (0.16 + fr * 0.9) + uCol * glow * (0.5 + fr) * 1.2;
            c += vec3(1.0) * smoothstep(0.96, 1.0, hgt) * (0.35 + glow * 0.6);
            float a = 0.38 + fr * 0.5 + glow * 0.25;
            gl_FragColor = vec4(c * uFade, min(1.0, a) * uFade); }`
        : /* glsl */ `uniform float uTime, uFade, uSing, uStrike, uR, uH; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
          void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
            vec3 L = normalize(vec3(-0.4, 0.8, 0.45));
            float dif = 0.35 + 0.65 * max(dot(n, L), 0.0);
            float hgt = vP.y / uH;
            float hammer = fbm(vP * 260.0);
            vec3 bronze = mix(vec3(0.42, 0.26, 0.11), vec3(0.78, 0.55, 0.26), hammer);
            bronze *= gl_FrontFacing ? 1.0 : 0.6;   // the inside is darker
            vec3 R = reflect(-normalize(vV), n);
            float spec = pow(max(dot(R, L), 0.0), 24.0);
            float fr = pow(1.0 - abs(dot(n, normalize(vV))), 3.0);
            vec3 c = bronze * dif + vec3(1.0, 0.85, 0.6) * (spec * 0.7 + fr * 0.25);
            // engraved bands near the rim
            c *= 1.0 - 0.25 * smoothstep(0.02, 0.0, abs(hgt - 0.86)) - 0.2 * smoothstep(0.015, 0.0, abs(hgt - 0.78));
            // singing: a golden shimmer runs round the rim
            float az = atan(vP.z, vP.x);
            float shimmer = (uSing * (0.55 + 0.45 * sin(az * 4.0 - uTime * 9.0)) + uStrike) * smoothstep(0.55, 1.0, hgt);
            c += vec3(1.0, 0.75, 0.35) * shimmer * 0.9;
            gl_FragColor = vec4(c * uFade, 1.0); }`,
    }));
    body.position.y = lift;
    body.renderOrder = crystal ? 5 : 0;
    g.add(body);

    // inside: water that ripples (Tibetan), or a column of coloured light (crystal)
    let inner;
    if (!crystal) {
      inner = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 48), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: u,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uTime, uFade, uSing, uStrike, uR; varying vec2 vP;
          void main(){ float r = length(vP) / (uR * 0.8);
            float e = uSing + uStrike * 0.7;
            float rip = sin(r * 38.0 - uTime * 14.0) * 0.5 + 0.5;
            float star = pow(abs(sin(atan(vP.y, vP.x) * 4.0 + uTime * 0.5)), 6.0);   // the standing-wave pattern
            vec3 c = vec3(0.05, 0.07, 0.08) + vec3(1.0, 0.82, 0.5) * rip * e * (0.35 + 0.4 * star) * smoothstep(1.0, 0.6, r);
            c += vec3(0.5, 0.6, 0.65) * smoothstep(0.85, 1.0, r) * 0.15;
            gl_FragColor = vec4(c * uFade, 0.85 * smoothstep(1.0, 0.95, r) * uFade); }`,
      }));
      inner.rotation.x = -Math.PI / 2;
      inner.position.y = lift + h * 0.5;
      inner.renderOrder = 2;
      // a cushion beneath
      const cushion = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.018, 12, 40), new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform float uFade; varying vec3 vN; void main(){ float l = 0.4 + 0.6 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.9, 0.3))), 0.0); gl_FragColor = vec4(vec3(0.36, 0.06, 0.07) * l * uFade, 1.0); }',
      }));
      cushion.rotation.x = -Math.PI / 2;
      cushion.position.y = 0.018;
      g.add(cushion);
    } else {
      inner = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.75, r * 0.9, 0.22, 40, 1, true), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: u,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uTime, uFade, uSing, uStrike; uniform vec3 uCol; varying vec2 vUv;
          void main(){ float e = uSing + uStrike;
            float a = e * e * pow(1.0 - vUv.y, 2.5) * (0.6 + 0.4 * sin(vUv.x * 40.0 + uTime * 2.0 - vUv.y * 12.0));
            gl_FragColor = vec4(uCol * a * 0.32 * uFade, 1.0); }`,
      }));
      inner.position.y = h + 0.11;
      inner.renderOrder = 6;
    }
    g.add(inner);

    // a small label in front: chakra and note
    const label = textPlane(this.uniforms, 0.2, 0.03);
    label.userData.set(`${name} · ${note}`);
    label.position.set(-Math.sin(ang) * (r + 0.05), 0.012, Math.cos(ang) * (r + 0.05));
    label.rotation.set(-0.9, -ang, 0, 'YXZ');
    label.material.uniforms.uA.value = 0.45;
    g.add(label);

    return { i, name, note, f: f0 * this.voice.octave, r, h, lift, g, u, ang, level: 0, strike: 0, rub: 0, nodes: null };
  }

  _mallet(crystal) {
    const m = new THREE.Group();
    const shade = (col) => new THREE.ShaderMaterial({
      uniforms: { uFade: this.uniforms.uFade, uCol: { value: new THREE.Color(col) } },
      vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uFade; uniform vec3 uCol; varying vec3 vN; void main(){ float l = 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.8, 0.5))), 0.0); gl_FragColor = vec4(uCol * l * uFade, 1.0); }',
    });
    // the head (suede for Tibetan, rubber-tipped for crystal) at the origin, handle along +y
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.06, 20), shade(crystal ? '#d9d6de' : '#7a5a3a'));
    head.position.y = 0.03;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.01, 0.2, 16), shade(crystal ? '#efeef3' : '#5a3418'));
    handle.position.y = 0.16;
    m.add(head, handle);
    m.visible = false;
    return m;
  }

  // place the set in front of you, at a comfortable height
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

  // ---- sound: each bowl's partials, two slightly detuned oscillators each so they beat
  _sound(b) {
    if (b.nodes) return b.nodes;
    const A = SFX.audio();
    if (!A) return null;
    const { ctx } = A;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.max(-0.8, Math.min(0.8, Math.sin(b.ang) * 1.6));
    out.connect(pan).connect(A.out);
    const send = ctx.createGain(); send.gain.value = 0.45; pan.connect(send).connect(A.reverb);
    const partials = this.voice.partials.map(([ratio, , , beat]) => {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(out);
      const oscs = [-0.5, 0.5].map((d) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = b.f * ratio + d * beat; o.connect(g); o.start(); return o; });
      return { g, oscs };
    });
    // the soft hiss of the mallet on the rim
    let hiss = null;
    if (A.noise) {
      const n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = b.f * 6; bp.Q.value = 3;
      const hg = ctx.createGain(); hg.gain.value = 0;
      n.connect(bp).connect(hg).connect(out); n.start();
      hiss = { n, g: hg };
    }
    b.nodes = { ctx, out, pan, send, partials, hiss, quiet: 0 };
    return b.nodes;
  }

  _silence(b) {
    const N = b.nodes;
    if (!N) return;
    const stopAt = N.ctx.currentTime + 0.3;
    N.out.gain.setTargetAtTime(0, N.ctx.currentTime, 0.08);
    for (const p of N.partials) for (const o of p.oscs) { try { o.stop(stopAt); } catch (_) {} }
    if (N.hiss) try { N.hiss.n.stop(stopAt); } catch (_) {}
    setTimeout(() => { try { N.pan.disconnect(); N.send.disconnect(); } catch (_) {} }, 600);
    b.nodes = null;
  }

  // where a pointer touches a bowl's rim: the bowl and the angle round it
  _contact(p) {
    let best = null;
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const o = p.origin.clone().applyMatrix4(inv), d = p.dir.clone().transformDirection(inv);
    const tip = p.tip ? p.tip.clone().applyMatrix4(inv) : null;
    for (const b of this.bowls) {
      const rimY = b.g.position.y + b.lift + b.h;
      let q = null;
      if (tip && Math.abs(tip.y - rimY) < 0.06) q = tip;   // a fingertip near the rim
      else if (Math.abs(d.y) > 1e-3) { const k = (rimY - o.y) / d.y; if (k > 0) q = o.clone().addScaledVector(d, k); }
      if (!q) continue;
      const dx = q.x - b.g.position.x, dz = q.z - b.g.position.z;
      const off = Math.abs(Math.hypot(dx, dz) - b.r);
      const tol = p.id === 'mouse' ? 0.035 : 0.045;
      if (off < tol && (!best || off < best.off)) best = { b, angle: Math.atan2(dz, dx), off, rimY };
      // pointing into the bowl counts for a strike
      if (!best && Math.hypot(dx, dz) < b.r) best = { b, angle: Math.atan2(dz, dx), off: 1, rimY, inside: true };
    }
    return best;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const V = this.voice;
    const seen = new Set();
    let malletAt = null;

    const pointers = this.demo ? this._demoPointers(t) : INPUT.pointers;
    for (const p of pointers) {
      const c = this._contact(p);
      if (!c) { this.touch.delete(p.id); continue; }
      const b = c.b;
      // strike: a pinch, trigger or click on a bowl
      if (INPUT.presses.includes(p.id) || p.press) { b.strike = 1; b.level = Math.max(b.level, 0.55); this.hintA = Math.min(this.hintA, 0.99); }
      if (c.inside) { this.touch.delete(p.id); continue; }
      // rubbing: how fast you're going round the rim
      const prev = this.touch.get(p.id);
      if (prev && prev.b === b) {
        let da = c.angle - prev.angle;
        da = Math.atan2(Math.sin(da), Math.cos(da));
        const speed = Math.abs(da) * b.r / Math.max(dt, 1e-3);   // m/s along the rim
        b.rub = Math.max(b.rub, damp(prev.speed || 0, speed, 6, dt));
        prev.speed = damp(prev.speed || 0, speed, 6, dt);
        prev.angle = c.angle;
      } else this.touch.set(p.id, { b, angle: c.angle, speed: 0 });
      seen.add(b);
      if (!malletAt || p.id !== 'mouse') malletAt = c;
    }

    for (const b of this.bowls) {
      if (!seen.has(b)) b.rub = 0;
      const rubbing = b.rub > 0.04;
      if (rubbing) {
        // a bowl builds slowly while you keep circling, faster for a steadier, quicker stroke
        const target = Math.min(1, 0.3 + b.rub * 2.4);
        b.level += (target - b.level) * (1 - Math.exp(-dt / 1.6));
        this.hintA = Math.min(this.hintA, 0.99);
      } else b.level *= Math.exp(-dt / V.ring);
      b.strike *= Math.exp(-dt / 0.7);
      b.u.uSing.value = Math.min(1, b.level * 1.1);
      b.u.uStrike.value = b.strike * 0.8;
      b.rub *= 0.5;

      // sound
      const active = b.level > 0.002 || b.strike > 0.01;
      const N = active ? this._sound(b) : b.nodes;
      if (N) {
        const now = N.ctx.currentTime;
        N.out.gain.setTargetAtTime(0.16 * this.fade, now, 0.05);
        V.partials.forEach(([, wRub, wStrike], k) => {
          N.partials[k].g.gain.setTargetAtTime(b.level * wRub + b.strike * wStrike * 0.8, now, 0.06);
        });
        if (N.hiss) N.hiss.g.gain.setTargetAtTime(rubbing ? Math.min(0.05, b.rub * 0.12) : 0, now, 0.05);
        N.quiet = active ? 0 : N.quiet + dt;
        if (N.quiet > 1.5) this._silence(b);
      }
    }

    // the mallet sits against the rim where you're playing, handle angled up towards you
    if (malletAt) {
      const b = malletAt.b;
      const radial = new THREE.Vector3(Math.cos(malletAt.angle), 0, Math.sin(malletAt.angle));
      const at = b.g.position.clone().addScaledVector(radial, b.r + 0.013);
      at.y = malletAt.rimY - 0.02;
      this.mallet.position.copy(at);
      const toYou = new THREE.Vector3(-b.g.position.x, 0, -b.g.position.z).normalize();
      const axis = radial.clone().multiplyScalar(0.55).add(new THREE.Vector3(0, 1, 0)).addScaledVector(toYou, 0.35).normalize();
      this.mallet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      this.mallet.visible = true;
    } else this.mallet.visible = false;

    // the hint fades once you've played
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.25);
    this.hint.material.uniforms.uA.value = (0.25 + 0.4 * Math.min(1, t * 0.5)) * this.hintA;
  }

  // for previews: an invisible player circles one bowl after another
  _demoPointers(t) {
    const k = Math.floor(t / 5) % this.bowls.length, b = this.bowls[k];
    const a = t * 4.2;
    const rimY = b.g.position.y + b.lift + b.h;
    const local = new THREE.Vector3(b.g.position.x + Math.cos(a) * b.r, rimY, b.g.position.z + Math.sin(a) * b.r);
    const world = local.applyMatrix4(this.rig.matrixWorld);
    return [{ id: 'demo', origin: world.clone().add(new THREE.Vector3(0, 0.3, 0)), dir: new THREE.Vector3(0, -1, 0), tip: world }];
  }

  setFade(f) {
    super.setFade(f);
    if (f < 0.01) for (const b of this.bowls || []) this._silence(b);
  }

  dispose() {
    for (const b of this.bowls) this._silence(b);
    super.dispose();
  }
}

export class CrystalBowlsScene extends SingingBowlsScene {
  constructor() { super('crystal'); }
}
