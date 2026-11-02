import * as THREE from 'three';
import { BaseScene, NOISE, POINT_SIZE, SOFT_DOT, additive } from '../common.js';

// A luminous particle sea that surrounds you at floor level.
// Notes drop ripples where their sound was placed; the swell follows your breath.
export class OceanScene extends BaseScene {
  constructor() {
    super();
    const N = 210, size = 44;
    const pos = new Float32Array(N * N * 3);
    const seed = new Float32Array(N * N);
    let k = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = (i / (N - 1) - 0.5) * size + (Math.random() - 0.5) * 0.08;
      const z = (j / (N - 1) - 0.5) * size + (Math.random() - 0.5) * 0.08;
      pos.set([x, 0, z], k * 3);
      seed[k++] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.rip = Array.from({ length: 8 }, () => new THREE.Vector4(0, 0, -999, 0));
    this.ripI = 0;
    Object.assign(this.uniforms, { uRip: { value: this.rip }, uSwell: { value: 0 } });
    const mat = additive({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uViewH, uEnergy, uBreath, uSwell, uBeat, uFade;
        uniform vec4 uRip[8];
        varying float vH; varying float vA;
        ${NOISE}
        ${POINT_SIZE}
        void main(){
          vec3 p = position;
          float d0 = length(p.xz);
          float amp = 0.12 + uEnergy * 0.25 + uSwell * 0.25;
          float h = (fbm(vec3(p.xz * 0.12, uTime * 0.07)) - 0.5) * 2.0 * amp;
          h += sin(p.x * 0.35 + uTime * 0.5) * 0.06 + sin(p.z * 0.27 - uTime * 0.37) * 0.06;
          float rip = 0.0;
          for(int i=0;i<8;i++){
            vec4 r = uRip[i];
            float age = uTime - r.z;
            if(age > 0.0 && age < 9.0){
              float d = distance(p.xz, r.xy);
              float front = age * 2.2;
              rip += r.w * sin((d - front) * 3.5) * exp(-abs(d - front) * 1.1) * exp(-age * 0.35);
            }
          }
          h += rip * 0.35;
          p.y = -0.35 + h + uBreath * 0.12;
          vH = h + rip * 0.6;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vA = smoothstep(21.0, 9.0, d0) * smoothstep(0.4, 1.4, d0) * uFade;
          gl_PointSize = pointPx(0.045 + aSeed * 0.03 + max(0.0, rip) * 0.05, mv);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC1, uC2; uniform float uEnergy;
        varying float vH; varying float vA;
        ${SOFT_DOT}
        void main(){
          float k = clamp(vH * 2.2 + 0.45, 0.0, 1.0);
          vec3 c = mix(uC1 * 0.6, uC2, k);
          gl_FragColor = vec4(c * softDot() * vA * (0.55 + uEnergy * 0.6), 1.0);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.group.add(this.points);
  }

  onEvent(e) {
    if (e.type === 'note') this._ripple(e.pos[0], e.pos[2], 0.5 + e.vel);
    if (e.type === 'chord') this._ripple(0, 0, 0.8);
    if (e.type === 'beat' && e.accent) this.uniforms.uSwell.value = Math.min(1.2, this.uniforms.uSwell.value + 0.35);
  }

  _ripple(x, z, s) {
    this.rip[this.ripI].set(x, z, this.uniforms.uTime.value, s);
    this.ripI = (this.ripI + 1) % this.rip.length;
  }

  update(dt) {
    this.uniforms.uSwell.value *= Math.exp(-dt * 1.2);
  }
}
