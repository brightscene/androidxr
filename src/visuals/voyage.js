import * as THREE from 'three';
import { U, NOISE, POINT_SIZE, SOFT_DOT, additive, damp, easeInOut } from './common.js';

// The voyage: you drift slowly forward through a deep star field. When the
// music launches a dive, speed swells, stars stretch into streaks, and a soft
// comfort vignette closes in, then everything eases back to a drift.
export class Voyage {
  constructor(scene, camera) {
    this.travel = 0;
    this.speed = 0.4;
    this.cruise = 0.4;
    this.comfort = 0.5; // 0 off, 0.5 gentle, 1 full
    this.dive = null;

    const N = 4200, L = 140;
    this.L = L;
    const pos = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.pow(Math.random(), 0.7) * 45;
      pos.set([Math.cos(a) * r, 1.6 + Math.sin(a) * r * 0.75, -Math.random() * L], i * 3);
      seed[i] = Math.random();
    }
    const uniforms = { ...U, uL: { value: L } };
    const head = /* glsl */ `
      attribute float aSeed; uniform float uTravel, uL; varying float vA;
      vec3 travelPos(vec3 p){ p.z = mod(p.z + uTravel, uL) - uL + 8.0; return p; }
      float travelFade(float z){ return smoothstep(-uL + 8.0, -uL + 40.0, z) * smoothstep(8.0, 1.0, z); }`;

    // star heads
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.stars = new THREE.Points(g, additive({
      uniforms,
      vertexShader: /* glsl */ `${head} uniform float uViewH, uTime; ${POINT_SIZE}
        void main(){
          vec3 p = travelPos(position);
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vA = travelFade(p.z) * (0.5 + 0.5 * sin(uTime * (0.5 + aSeed * 2.0) + aSeed * 30.0));
          gl_PointSize = max(1.0, pointPx(0.05 + aSeed * 0.09, mv));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uC2; varying float vA; ${SOFT_DOT}
        void main(){ gl_FragColor = vec4(mix(vec3(1.0), uC2, 0.35) * softDot() * vA, 1.0); }`,
    }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // streaks: two vertices per star, the tail trails back along the motion
    const sp = new Float32Array(N * 6), ss = new Float32Array(N * 2), se = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      sp.set([pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]], i * 6);
      ss[i * 2] = ss[i * 2 + 1] = seed[i];
      se[i * 2 + 1] = 1;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 1));
    sg.setAttribute('aEnd', new THREE.BufferAttribute(se, 1));
    this.streaks = new THREE.LineSegments(sg, additive({
      uniforms,
      vertexShader: /* glsl */ `${head} attribute float aEnd; uniform float uSpeed;
        void main(){
          vec3 p = travelPos(position);
          float len = clamp(uSpeed * 0.16, 0.0, 9.0) * (0.6 + aSeed * 0.8);
          p.z -= aEnd * len;
          vA = travelFade(p.z) * smoothstep(1.5, 6.0, uSpeed) * (1.0 - aEnd * 0.9);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uC2; varying float vA;
        void main(){ gl_FragColor = vec4(mix(vec3(1.0), uC2, 0.5) * vA * 0.9, 1.0); }`,
    }));
    this.streaks.frustumCulled = false;
    scene.add(this.streaks);

    // comfort vignette, head-locked
    this.vig = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uVig: U.uDive, uAmt: { value: 0.6 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uVig, uAmt; varying vec2 vUv;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = smoothstep(0.35, 0.95, d) * uVig * uAmt; gl_FragColor = vec4(0.0, 0.0, 0.02, a); }`,
    }));
    this.vig.position.z = -0.25;
    this.vig.renderOrder = 900;
    this.vig.frustumCulled = false;
    camera.add(this.vig);
  }

  // Begin a dive lasting `duration` seconds at 0..1 intensity.
  startDive(duration, intensity) {
    if (this.comfort <= 0) return;
    this.dive = { t: 0, duration: Math.max(6, duration), intensity };
  }

  update(dt) {
    let env = 0;
    if (this.dive) {
      const d = this.dive;
      d.t += dt;
      const atk = 3, rel = Math.min(6, d.duration * 0.45);
      if (d.t < atk) env = easeInOut(d.t / atk);
      else if (d.t < d.duration - rel) env = 1;
      else if (d.t < d.duration) env = 1 - easeInOut((d.t - (d.duration - rel)) / rel);
      else this.dive = null;
      env *= d.intensity;
    }
    const peak = this.comfort >= 1 ? 32 : 11;
    const target = this.cruise + env * peak;
    this.speed = damp(this.speed, target, 2, dt);
    this.travel += this.speed * dt;
    U.uTravel.value = this.travel;
    U.uSpeed.value = this.speed;
    U.uDive.value = damp(U.uDive.value, env, 3, dt);
    this.vig.material.uniforms.uAmt.value = this.comfort >= 1 ? 0.45 : 0.75;
  }
}
