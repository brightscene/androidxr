import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SFX, damp } from '../common.js';

// ===================================================================== Drone light show
// Over a still night lake, a swarm of glowing drones glides from one formation
// to the next like a murmuration of light: a slowly turning globe, a heart, the words "You Matter", "Amazing" and "You are Enough", and a
// spiral galaxy, each mirrored in the water below.
const N = 1400;
const CY = 22, CZ = -42;          // centre of the show in the sky

function textTargets(text, width) {
  const cv = document.createElement('canvas');
  cv.width = 1400; cv.height = 300;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 210;
  c.font = `700 ${size}px Jost, "Segoe UI", system-ui, sans-serif`;
  while (c.measureText(text).width > 1340 && size > 60) { size -= 6; c.font = `700 ${size}px Jost, "Segoe UI", system-ui, sans-serif`; }
  c.fillText(text, 700, 155);
  const d = c.getImageData(0, 0, 1400, 300).data;
  const pts = [];
  for (let y = 0; y < 300; y += 4) for (let x = 0; x < 1400; x += 4) if (d[(y * 1400 + x) * 4 + 3] > 128) pts.push([x, y]);
  const k = width / 1400;
  return pick(pts.map(([x, y]) => [(x - 700) * k, (150 - y) * k, (Math.random() - 0.5) * 0.6]));
}
function heartTargets() {
  const pts = [];
  while (pts.length < N * 3) {
    const x = Math.random() * 2.6 - 1.3, y = Math.random() * 2.6 - 1.4;
    if (Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y < 0) pts.push([x * 15, y * 15 + 2, (Math.random() - 0.5) * 3]);
  }
  return pick(pts);
}
function sphereTargets() {
  return Array.from({ length: N }, (_, i) => {
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    return [Math.cos(a) * r * 13, y * 13, Math.sin(a) * r * 13];
  });
}
function spiralTargets() {
  return Array.from({ length: N }, (_, i) => {
    const arm = i % 3, t = Math.random();
    const a = t * 7 + arm * 2.094, r = 2 + t * 17;
    return [Math.cos(a) * r + (Math.random() - 0.5) * 1.5, Math.sin(a) * r * 0.55 + (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 3];
  });
}
// choose exactly N points (repeating with a little jitter if there are too few)
function pick(src) {
  const out = [];
  const sh = src.slice().sort(() => Math.random() - 0.5);
  for (let i = 0; i < N; i++) { const p = sh[i % sh.length]; out.push(i < sh.length ? p : [p[0] + (Math.random() - 0.5) * 0.3, p[1] + (Math.random() - 0.5) * 0.3, p[2]]); }
  // sort left to right so drones fly to nearby places rather than criss-crossing
  return out;
}

const SHOW = [
  { kind: 'sphere', hold: 16, cols: ['#6fd3ff', '#a493ff', '#ffffff'], spin: 0.15 },
  { kind: 'heart', hold: 18, cols: ['#ff3b6b', '#ff6f91', '#ffb3c6'], spin: 0.05 },
  { kind: 'text', text: 'You Matter', hold: 14, cols: ['#ffffff', '#ffe6b0', '#ffd27a'] },
  { kind: 'heart', hold: 12, cols: ['#ff3b6b', '#ff8fb4', '#ffffff'] },
  { kind: 'text', text: 'Amazing', hold: 14, cols: ['#7ff0ff', '#b8a9ff', '#ffffff'] },
  { kind: 'spiral', hold: 16, cols: ['#a493ff', '#f29bd0', '#5ed6d0'], spin: 0.08 },
  { kind: 'text', text: 'You are Enough', hold: 16, cols: ['#ffd27a', '#ffffff', '#ffb36b'] },
];

export class DroneShowScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    // night sky over hills, with the lake below
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(vec3(0.03, 0.035, 0.08), vec3(0.004, 0.006, 0.02), smoothstep(0.0, 0.6, h));
          vec2 st = starDot(d, 260.0, 0.994); c += vec3(0.8, 0.85, 1.0) * st.x * smoothstep(0.05, 0.3, h) * 0.5;
          float hills = 0.03 + 0.035 * fbm(vec3(atan(d.z, d.x) * 6.0, 0.0, 1.0));
          c = mix(c, vec3(0.008, 0.01, 0.02), smoothstep(hills + 0.003, hills - 0.003, h) * step(-0.01, h));
          c = mix(c, vec3(0.006, 0.008, 0.018), step(h, -0.01));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    this.pos = new Float32Array(N * 3);
    this.col = new Float32Array(N * 3);
    this.bri = new Float32Array(N).fill(1);
    this.mid = Array.from({ length: N }, () => [0, 0, 0]);
    this.dur = Array.from({ length: N }, () => 3.5 + Math.random() * 1.5);
    const seed = new Float32Array(N).map(() => Math.random());
    this.from = sphereTargets(); this.to = this.from; this.delay = Array.from({ length: N }, () => Math.random() * 1.6);
    this.cFrom = this._cols(SHOW[0].cols); this.cTo = this.cFrom;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aBri', new THREE.BufferAttribute(this.bri, 1));
    const mat = (alpha) => new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uA: { value: alpha } },
      vertexShader: /* glsl */ `attribute vec3 aCol; attribute float aSeed; attribute float aBri; uniform float uTime, uViewH; varying vec3 vC; varying float vT; ${POINT_SIZE}
        void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = pointPx(0.4 * (0.7 + 0.3 * min(aBri, 1.5)), mv);
          vC = aCol; vT = aBri * (0.9 + 0.1 * sin(uTime * (1.0 + aSeed * 2.0) + aSeed * 40.0));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade, uA; varying vec3 vC; varying float vT;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = dot(q, q);
          float core = exp(-r * 60.0), halo = exp(-r * 10.0) * 0.35;
          gl_FragColor = vec4((vC * (core * 1.3 + halo) + vec3(1.0) * core * 0.4) * vT * uA * uFade, 1.0); }`,
    });
    this.drones = new THREE.Points(g, mat(1));
    this.drones.frustumCulled = false;
    this.group.add(this.drones);
    // their reflection in the lake
    const refl = new THREE.Points(g, mat(0.22));
    refl.scale.y = -1; refl.position.y = -1;
    refl.frustumCulled = false;
    this.group.add(refl);

    this.step = 0; this.t = 0; this.state = 'hold'; this.cur = SHOW[0]; this.spin = 0;
    this.mid = this.from.map((p) => p.slice());
    this._place(99);
  }

  _cols(list) {
    const cs = list.map((h) => new THREE.Color(h));
    return Array.from({ length: N }, (_, i) => cs[(i * 7 + (i >> 3)) % cs.length]);
  }
  _targets(f) {
    if (f.kind === 'heart') return heartTargets();
    if (f.kind === 'text') return textTargets(f.text, f.text.length > 10 ? 62 : 48);
    if (f.kind === 'spiral') return spiralTargets();
    return sphereTargets();
  }
  // order target points to roughly match where each drone is now, so they glide sideways
  _match(targets) {
    const idx = Array.from({ length: N }, (_, i) => i).sort((a, b) => (this.from[a][0] - this.from[b][0]) || (this.from[a][1] - this.from[b][1]));
    const tg = targets.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const out = new Array(N);
    idx.forEach((d, k) => { out[d] = tg[k]; });
    return out;
  }
  // k: seconds since the transition began (or 99 when holding)
  _place(k) {
    const cs = Math.cos(this.spin), sn = Math.sin(this.spin);
    const nav = 0.12;
    for (let i = 0; i < N; i++) {
      const a = this.from[i], b = this.to[i], m = this.mid[i];
      const local = (k - this.delay[i]) / this.dur[i];
      const e0 = Math.min(1, Math.max(0, local));
      const e = e0 * e0 * (3 - 2 * e0);
      // a smooth curved flight: out through the loose cloud and in to the new place
      const u1 = 1 - e;
      let x = u1 * u1 * a[0] + 2 * u1 * e * m[0] + e * e * b[0];
      let y = u1 * u1 * a[1] + 2 * u1 * e * m[1] + e * e * b[1];
      let z = u1 * u1 * a[2] + 2 * u1 * e * m[2] + e * e * b[2];
      const xr = x * cs + z * sn, zr = -x * sn + z * cs;
      this.pos[i * 3] = xr; this.pos[i * 3 + 1] = CY + y; this.pos[i * 3 + 2] = CZ + zr;
      // lights: dim to a soft navigation light on leaving, flare on arriving, then settle
      const after = (local - 1) * this.dur[i];             // seconds since this drone arrived
      let br, cc;
      if (local <= 0) { br = 1; cc = this.cFrom[i]; }
      else if (local < 1) { br = Math.max(nav, 1 - local * 6); cc = local < 0.2 ? this.cFrom[i] : null; }
      else { br = after < 0.15 ? nav + (1.7 - nav) * after / 0.15 : 1 + 0.7 * Math.exp(-(after - 0.15) * 5); cc = this.cTo[i]; }
      if (local > 0 && local < 1 && local >= 0.2) { this.col[i * 3] = 0.9; this.col[i * 3 + 1] = 0.93; this.col[i * 3 + 2] = 1.0; }
      else { const c = cc || this.cTo[i]; this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b; }
      this.bri[i] = br;
    }
    const at = this.drones.geometry.attributes;
    at.position.needsUpdate = true; at.aCol.needsUpdate = true; at.aBri.needsUpdate = true;
  }
  update(dt) {
    this.t += dt;
    const f = this.cur;
    if (f.spin) this.spin += dt * f.spin; else this.spin = damp(this.spin, Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2, 1.2, dt);
    if (this.state === 'hold' && this.t > f.hold) {
      // on to the next formation
      this.from = Array.from({ length: N }, (_, i) => [this.pos[i * 3] / 1, this.pos[i * 3 + 1] - CY, this.pos[i * 3 + 2] - CZ]);
      this.spin = 0;
      this.step = (this.step + 1) % SHOW.length;
      this.cur = SHOW[this.step];
      this.cFrom = this.cTo === this.cFrom ? this.cFrom : this.cTo;
      this.cFrom = Array.from({ length: N }, (_, i) => new THREE.Color(this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]));
      this.to = this._match(this._targets(this.cur));
      this.cTo = this._cols(this.cur.cols);
      for (let i = 0; i < N; i++) {
        const a = this.from[i], b = this.to[i];
        this.mid[i] = [(a[0] + b[0]) / 2 + (Math.random() - 0.5) * 16, (a[1] + b[1]) / 2 + 3 + Math.random() * 9, (a[2] + b[2]) / 2 + (Math.random() - 0.5) * 14];
        this.delay[i] = Math.random() * 1.8;
        this.dur[i] = 3.5 + Math.random() * 1.8;
      }
      this.state = 'move'; this.t = 0;
      if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 5, gain: 0.25 });
    }
    if (this.state === 'move') {
      this._place(this.t);
      if (this.t > 8.5) { this.state = 'hold'; this.t = 0; if (this.fade > 0.5) SFX.play('chime', { note: [0, 4, 7, 12][this.step % 4], pan: 0, gain: 0.3 }); }
    } else this._place(99);
  }
}
