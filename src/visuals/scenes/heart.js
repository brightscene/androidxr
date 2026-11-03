import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Journey into the heart
// You flow with the blood: from narrow capillaries where cells slip past in
// single file, into a vein, then the great vein, carried a little further
// with each heartbeat, the walls swelling with every pulse and the beat
// growing louder, until you arrive inside the heart itself, its walls
// contracting around you and its valve opening and closing ahead.
const STAGES = [
  { at: 0.0, name: 'Capillaries' },
  { at: 0.22, name: 'Into a vein' },
  { at: 0.48, name: 'The great vein' },
  { at: 0.74, name: 'The beating heart' },
];
const JOURNEY = 240;
const EYE = 1.6;

// a red blood cell: a disc, thicker at the rim, dimpled in the middle
function cellGeometry() {
  const g = new THREE.SphereGeometry(1, 28, 16);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r2 = x * x + z * z;
    p.setY(i, Math.sign(y) * (0.12 + 0.42 * r2) * Math.abs(y) * 0.9 + y * 0.05);
  }
  g.computeVertexNormals();
  return g;
}

export class HeartJourneyScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uProg: { value: 0 }, uTravel: { value: 0 }, uBeat: { value: 0 }, uR: { value: 0.7 }, uDark: { value: 1 }, uValve: { value: 0 } });
    const m = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uProg, uTravel, uBeat, uR, uDark, uValve; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          float heart = smoothstep(0.72, 0.8, uProg);
          // the vessel swells with each beat; inside the heart the walls squeeze hard
          float R = uR * (1.0 + uBeat * mix(0.06, 0.18, heart));
          float r = max(length(d.xy), 1e-3), dz = max(-d.z, -0.4);
          float a = atan(d.y, d.x);
          float ax = R * dz / r;                    // how far along the vessel this wall point is
          float W = ax + uTravel;
          vec3 P = vec3(cos(a) * 1.4, sin(a) * 1.4, W * 0.8 / max(R, 0.5));
          float n = fbm(P * vec3(1.0, 1.0, 1.0)), n2 = fbm(P * 2.7 + n * 1.5);
          // wet tissue: crimson with darker vessels branching through it
          vec3 tissue = mix(vec3(0.35, 0.02, 0.04), vec3(0.75, 0.12, 0.12), n2);
          float vein = smoothstep(0.03, 0.0, abs(fbm(P * 1.8 + vec3(0.0, 0.0, 5.0)) - 0.5));
          tissue = mix(tissue, vec3(0.18, 0.0, 0.08), vein * 0.7);
          // inside the heart: muscle ridges running along the walls
          float ridge = pow(0.5 + 0.5 * sin(a * 9.0 + n * 4.0 + W * 0.15), 3.0);
          tissue = mix(tissue, mix(vec3(0.3, 0.02, 0.05), vec3(0.85, 0.2, 0.18), ridge), heart * 0.7);
          // light: soft glow through the walls, glistening highlights, darkness far ahead
          float lamp = 1.6 / (1.0 + ax * 0.12);
          float wet = pow(smoothstep(0.55, 0.85, n2), 3.0) * (0.6 + 0.4 * sin(uTime * 2.0 + W));
          vec3 c = tissue * lamp + vec3(1.0, 0.75, 0.7) * wet * 0.35 * lamp;
          c += vec3(0.5, 0.02, 0.03) * uBeat * 0.25;
          // the blood ahead: a deep red glow down the vessel
          c = mix(c, vec3(0.25, 0.0, 0.02), smoothstep(6.0, 30.0, ax));
          // the valve ahead in the heart: three leaflets opening and closing
          float ap = mix(0.02, 0.11, uValve);
          float leaf = ap * (0.75 + 0.25 * cos(3.0 * a + 1.0));
          float cent = step(0.0, -d.z) * heart;
          float valve = smoothstep(0.2, 0.17, r) * smoothstep(leaf - 0.004, leaf + 0.004, r);
          c = mix(c, mix(vec3(0.55, 0.15, 0.18), vec3(0.95, 0.65, 0.6), smoothstep(0.2, 0.05, r)) * (0.6 + 0.4 * n), valve * cent);
          c = mix(c, vec3(0.9, 0.2, 0.15) * (0.6 + uValve), step(r, leaf) * cent);
          gl_FragColor = vec4(grade(c * uDark), uFade); }`,
    }));
    m.renderOrder = -5;
    m.position.y = EYE;
    this.group.add(m);

    // the blood cells flowing with you
    this.N = 150;
    this.cells = new THREE.InstancedMesh(cellGeometry(), new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vV = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `uniform float uFade, uDark; varying vec3 vN; varying vec3 vV; ${NOISE} ${GRADE}
        void main(){ vec3 n = normalize(vN); vec3 V = normalize(cameraPosition - vV);
          float f = 1.0 - abs(dot(n, V));
          float dist = length(cameraPosition - vV);
          vec3 c = vec3(0.55, 0.03, 0.05) * (0.45 + 0.55 * abs(dot(n, V))) + vec3(1.0, 0.3, 0.25) * pow(f, 3.0) * 0.6;
          c += vec3(1.0, 0.8, 0.75) * pow(max(dot(reflect(-V, n), normalize(vec3(0.3, 0.8, 0.5))), 0.0), 30.0) * 0.4;
          c = mix(c, vec3(0.25, 0.0, 0.02), smoothstep(5.0, 28.0, dist));
          gl_FragColor = vec4(grade(c * uDark) * uFade, 1.0); }`,
    }), this.N);
    this.cells.frustumCulled = false;
    this.group.add(this.cells);
    this.cell = Array.from({ length: this.N }, () => this._spawn({}, true));
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.E = new THREE.Euler(); this.S = new THREE.Vector3(); this.T = new THREE.Vector3();

    // tiny platelets and specks drifting in the plasma
    this.specks = particles(U, { count: 400, min: [-2, EYE - 2, -30], max: [2, EYE + 2, 3], vel: [0, 0, 2], sway: 0.3, size: [0.01, 0.03], colors: ['#ffb0a0', '#ff8070', '#ffe0d0'], alpha: 0.5 });
    this.group.add(this.specks);

    this.text = textPlane(U, 2.0, 0.3);
    this.text.position.set(0, EYE - 0.65, -3.2);
    this.text.rotation.x = -0.25;
    this.group.add(this.text);

    this.t = 0; this.state = 'go'; this.stage = -1; this.cap = 0;
    this.bpm = 62; this.beatT = 0.5; this.flow = 1.2; this.surge = 0;
  }

  _spawn(c, anywhere) {
    // place a cell somewhere in the vessel ahead (or anywhere, at the start)
    const R = this.uniforms ? this.uniforms.uR.value : 0.7;
    const rr = Math.max(0.25, R * 0.8) * (0.35 + 0.65 * Math.sqrt(Math.random())), th = Math.random() * Math.PI * 2;
    c.x = Math.cos(th) * rr; c.y = Math.sin(th) * rr;
    c.z = anywhere ? -Math.random() * 30 + 2 : -28 - Math.random() * 4;
    c.v = 0.6 + Math.random() * 0.8;                       // its own pace, relative to you
    c.rx = Math.random() * 6; c.ry = Math.random() * 6; c.sp = (Math.random() - 0.5) * 1.5;
    c.s = 0.08 + Math.random() * 0.03;
    return c;
  }

  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }

  update(dt) {
    const U = this.uniforms;
    if (this.state === 'go') {
      this.t += dt;
      U.uProg.value = Math.min(1, this.t / JOURNEY);
      if (this.t > JOURNEY + 40) { this.state = 'fade'; this.t = 0; }
    } else {
      this.t += dt;
      U.uDark.value = Math.max(0, 1 - this.t / 3);
      if (this.t > 5) { this.state = 'go'; this.t = 0; this.stage = -1; U.uProg.value = 0; U.uTravel.value = 0; for (const c of this.cell) this._spawn(c, true); }
    }
    if (this.state === 'go') U.uDark.value = damp(U.uDark.value, 1, 1.2, dt);
    const p = U.uProg.value;
    // the vessel widens as you go: capillary, vein, great vein, heart
    const R = p < 0.22 ? 0.6 : p < 0.48 ? 1.6 : p < 0.74 ? 3.0 : 5.0;
    U.uR.value = damp(U.uR.value, R, 0.25, dt);

    // the heartbeat: a lub-dub that grows louder as you near the heart
    this.bpm = damp(this.bpm, 60 + p * 10, 0.2, dt);
    this.beatT += dt;
    const per = 60 / this.bpm;
    if (this.beatT >= per) {
      this.beatT -= per;
      this.surge = 1;
      this._sfx('heart', { pan: 0, gain: 0.5 + p * 1.1 });
    }
    // each beat swells the walls and pushes you forward
    const ph = this.beatT / per;
    U.uBeat.value = Math.exp(-ph * 7) * (1 - Math.exp(-ph * 60)) * 1.4;
    U.uValve.value = damp(U.uValve.value, ph > 0.08 && ph < 0.45 ? 1 : 0, 9, dt);
    this.surge *= Math.exp(-dt * 3);
    const speed = (p < 0.22 ? 0.9 : p < 0.74 ? 1.6 : 0.8) + this.surge * 2.2;
    this.flow = damp(this.flow, speed, 3, dt);
    U.uTravel.value += this.flow * dt;

    // the cells: drift past at their own pace, tumbling slowly, pulsed by each beat
    const scale = Math.min(1, U.uR.value / 1.6) * 0.6 + 0.4;
    for (let i = 0; i < this.N; i++) {
      const c = this.cell[i];
      c.z += (c.v * 0.6 + this.surge * 1.2) * dt;
      c.rx += c.sp * dt * 0.5; c.ry += c.sp * dt * 0.3;
      if (c.z > 3) this._spawn(c, false);
      const lim = U.uR.value * 0.85;
      const rr = Math.hypot(c.x, c.y);
      if (rr > lim) { c.x *= lim / rr; c.y *= lim / rr; }
      this.E.set(c.rx, c.ry, 0); this.Q.setFromEuler(this.E);
      this.S.setScalar(c.s * scale * 1.6);
      this.T.set(c.x, EYE + c.y, c.z);
      this.M.compose(this.T, this.Q, this.S);
      this.cells.setMatrixAt(i, this.M);
    }
    this.cells.instanceMatrix.needsUpdate = true;
    this.specks.userData.u.uBoost.value = this.surge * 0.6;

    // captions for each part of the journey
    const st = this.state === 'go' ? STAGES.reduce((k, s, i) => (p >= s.at ? i : k), 0) : this.stage;
    if (st !== this.stage) { this.stage = st; this.text.userData.set(STAGES[st].name); this.cap = 0; }
    this.cap += dt;
    this.text.material.uniforms.uA.value = Math.min(1, this.cap / 1.5) * (1 - Math.min(1, Math.max(0, this.cap - 6) / 2));
  }
}
