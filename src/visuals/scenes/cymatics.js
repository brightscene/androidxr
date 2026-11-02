import * as THREE from 'three';
import { BaseScene, POINT_SIZE, SOFT_DOT, additive, damp } from '../common.js';

// Cymatics: thousands of grains on a floating Chladni plate settle onto the
// standing-wave pattern of the current chord. Notes and beats shake the
// plate; each chord change morphs the pattern, the way sand reorganises
// when a plate is driven at a new frequency.
const MODES = [[1, 2], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5], [1, 6], [4, 5], [3, 7], [5, 6]];

export class CymaticsScene extends BaseScene {
  constructor() {
    super();
    this.root = new THREE.Group();
    this.root.position.set(0, 1.2, -2.5);
    this.root.rotation.x = -0.7;
    this.group.add(this.root);
    this.plate = 1.15;

    this.N = 9000;
    this.p = new Float32Array(this.N * 2);
    for (let i = 0; i < this.N * 2; i++) this.p[i] = Math.random() * 2 - 1;
    const pos = new Float32Array(this.N * 3);
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const seed = new Float32Array(this.N).map(() => Math.random());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', this.posAttr);
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.points = new THREE.Points(g, additive({
      uniforms: Object.assign(this.uniforms, { uShake: { value: 0 } }),
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uViewH, uShake; varying float vR; varying float vS;
        ${POINT_SIZE}
        void main(){
          vR = length(position.xy) / 1.6; vS = aSeed;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = pointPx(0.014 + aSeed * 0.012 + uShake * 0.01, mv);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uC1, uC2; uniform float uFade, uEnergy, uShake; varying float vR; varying float vS; ${SOFT_DOT}
        void main(){ vec3 c = mix(uC2, uC1 * 1.5, vR) * (0.6 + vS * 0.6);
          gl_FragColor = vec4(c * softDot() * (0.65 + uEnergy * 0.5 + uShake * 0.4) * uFade, 1.0); }`,
    }));
    this.points.frustumCulled = false;
    this.root.add(this.points);

    // faint plate edge
    const e = this.plate;
    const edge = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-e, -e, 0), new THREE.Vector3(e, -e, 0), new THREE.Vector3(e, e, 0), new THREE.Vector3(-e, e, 0)]),
      new THREE.LineBasicMaterial({ transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.edge = edge;
    this.root.add(edge);

    this.mode = MODES[0];
    this.n = this.mode[0]; this.m = this.mode[1];
    this.shake = 1;
    this.modeI = 0;
  }

  onEvent(ev) {
    if (ev.type === 'chord') {
      this.modeI = (this.modeI + 1 + (ev.index % 2)) % MODES.length;
      this.mode = MODES[this.modeI];
      this.shake = Math.max(this.shake, 0.9);
    }
    if (ev.type === 'note') this.shake = Math.min(1.4, this.shake + ev.vel * 0.25);
    if (ev.type === 'beat' && ev.accent) this.shake = Math.min(1.4, this.shake + 0.12);
    if (ev.type === 'section') this.sectionMul = 0.6 + ev.energy * 0.6;
  }

  update(dt, t, s) {
    // modes glide so the pattern morphs rather than snaps
    this.n = damp(this.n, this.mode[0], 1.2, dt);
    this.m = damp(this.m, this.mode[1], 1.2, dt);
    this.shake *= Math.exp(-dt * 1.4);
    const sh = this.shake * (this.sectionMul || 1);
    this.uniforms.uShake.value = sh;
    const PI = Math.PI, n = this.n, m = this.m;
    const step = Math.min(dt, 0.05) * 6;
    const jit = 0.004 + sh * 0.03 + s.level * 0.02;
    const p = this.p, out = this.posAttr.array, E = this.plate;
    const lift = 0.02 + s.breath * 0.05;
    for (let i = 0; i < this.N; i++) {
      let x = p[i * 2], y = p[i * 2 + 1];
      const cnx = Math.cos(n * PI * x), snx = Math.sin(n * PI * x);
      const cmx = Math.cos(m * PI * x), smx = Math.sin(m * PI * x);
      const cny = Math.cos(n * PI * y), sny = Math.sin(n * PI * y);
      const cmy = Math.cos(m * PI * y), smy = Math.sin(m * PI * y);
      const f = cnx * cmy - cmx * cny;
      const gx = -n * PI * snx * cmy + m * PI * smx * cny;
      const gy = -m * PI * cnx * smy + n * PI * cmx * sny;
      const g2 = gx * gx + gy * gy + 1;
      x -= (step * f * gx) / g2 + (Math.random() - 0.5) * jit * (0.3 + Math.abs(f));
      y -= (step * f * gy) / g2 + (Math.random() - 0.5) * jit * (0.3 + Math.abs(f));
      if (x < -1 || x > 1) x = Math.random() * 2 - 1;
      if (y < -1 || y > 1) y = Math.random() * 2 - 1;
      p[i * 2] = x; p[i * 2 + 1] = y;
      out[i * 3] = x * E;
      out[i * 3 + 1] = y * E;
      out[i * 3 + 2] = Math.abs(f) * sh * 0.08 + lift * (1 - Math.abs(f)) * 0.5;
    }
    this.posAttr.needsUpdate = true;
    this.edge.material.opacity = this.fade * 0.15;
    this.edge.material.color.copy(this.uniforms.uC2.value);
    this.root.rotation.z += dt * 0.03;
    this.root.position.y = 1.2 + Math.sin(t * 0.3) * 0.03;
  }
}
