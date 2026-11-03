import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, damp } from '../common.js';

// ===================================================================== Sleep
// A deep, calm blue to drift off in. Soft veils of light move very slowly
// overhead, blurred orbs of blue and teal sink gently downward like settling
// into sleep, and a slow wave of light washes down the sky with each long
// breath, the breath lengthening over time. Faint stars, a mist below, and
// the whole scene dims little by little over twenty minutes.
export class SleepScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uWave: { value: 0 }, uDim: { value: 1 } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uWave, uDim; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          // navy deep overhead, softer periwinkle toward the horizon, misty blue below
          vec3 c = mix(vec3(0.05, 0.08, 0.2), vec3(0.01, 0.015, 0.06), smoothstep(-0.05, 0.75, h));
          // slow veils of blue light
          float v1 = fbm(vec3(d.xz * 1.4 / (abs(h) + 0.6), uTime * 0.006));
          float v2 = fbm(vec3(d * 2.6 + vec3(uTime * 0.004, 0.0, 0.0)));
          c += vec3(0.08, 0.16, 0.38) * smoothstep(0.45, 0.85, v1) * smoothstep(-0.1, 0.4, h) * 0.8;
          c += vec3(0.06, 0.22, 0.3) * smoothstep(0.55, 0.9, v2) * 0.35;
          // a soft wave of light washing slowly down the sky with each breath
          float band = exp(-pow((h - mix(0.9, -0.2, uWave)) * 5.0, 2.0));
          c += vec3(0.12, 0.2, 0.42) * band * 0.35 * sin(uWave * 3.14159);
          // faint, slowly twinkling stars
          vec2 st = starDot(d, 240.0, 0.993);
          c += vec3(0.7, 0.8, 1.0) * st.x * (0.4 + 0.3 * sin(uTime * (0.3 + st.y) + st.y * 50.0)) * smoothstep(0.1, 0.5, h) * 0.6;
          // a low mist below
          float mist = smoothstep(0.05, -0.25, h);
          c = mix(c, vec3(0.06, 0.1, 0.22) * (0.8 + 0.3 * fbm(vec3(d.xz * 3.0, uTime * 0.01))), mist * 0.85);
          gl_FragColor = vec4(grade(c * uDim), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    // soft orbs drifting slowly downward, out of focus
    const n = 140, pos = new Float32Array(n * 3), seed = new Float32Array(n), col = new Float32Array(n * 3);
    const cols = ['#4a7dff', '#3fc6d8', '#7a8cff', '#2f5fd0', '#9ab8ff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 30, Math.random() * 16, -2 - Math.random() * 22], i * 3);
      seed[i] = Math.random();
      const c = cols[i % cols.length]; col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
    const orbs = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute float aSeed; attribute vec3 aCol; uniform float uTime, uViewH; varying vec3 vC; varying float vA; ${POINT_SIZE}
        void main(){ vec3 p = position;
          p.y = mod(p.y - uTime * (0.05 + aSeed * 0.06), 16.0) - 2.0;
          p.x += sin(uTime * 0.05 + aSeed * 30.0) * 0.8;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = pointPx(0.35 + aSeed * 0.6, mv);
          vC = aCol;
          vA = smoothstep(-2.0, 1.0, p.y) * smoothstep(14.0, 10.0, p.y) * (0.6 + 0.4 * sin(uTime * 0.2 + aSeed * 20.0));
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform float uFade, uDim; varying vec3 vC; varying float vA; ${'varying float vPtA;'}
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0;
          // a soft bokeh disc with a slightly brighter rim
          float disc = smoothstep(1.0, 0.75, r) * (0.55 + 0.45 * smoothstep(0.5, 0.95, r));
          gl_FragColor = vec4(vC * disc * vA * 0.22 * uDim * uFade, 1.0); }`,
    }));
    orbs.frustumCulled = false;
    this.group.add(orbs);
    this.t = 0; this.breathPh = 0;
  }
  update(dt) {
    const U = this.uniforms;
    this.t += dt;
    // breathing slows from about 10 to 14 seconds per breath over the first quarter hour
    const period = 10 + 4 * Math.min(1, this.t / 900);
    this.breathPh = (this.breathPh + dt / period) % 1;
    U.uWave.value = this.breathPh;
    // dim gently to a third of the brightness over twenty minutes
    U.uDim.value = damp(U.uDim.value, 1 - 0.65 * Math.min(1, this.t / 1200), 0.2, dt);
  }
}
