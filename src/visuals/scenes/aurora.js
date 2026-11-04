import * as THREE from 'three';
import { BaseScene, NOISE, additive } from '../common.js';

// Aurora curtains arcing overhead. Chords send a wave of light along them,
// beats breathe their brightness, notes light the nearest fold.
export class AuroraScene extends BaseScene {
  constructor() {
    super();
    Object.assign(this.uniforms, {
      uWaveT: { value: -99 },
      uPulse: { value: 0 },
      uHot: { value: new THREE.Vector3(0, 0, -99) }, // azimuth, unused, time
    });
    const curtains = [
      // one curtain in each part of the sky, meeting at their faded ends, so none stack up overhead
      { r: 10, a0: -1.55, a1: 0.5, y: 3.4, h: 7.5, ph: 0 },
      { r: 12, a0: 0.4, a1: 2.35, y: 4.0, h: 8, ph: 1.7 },
      { r: 15, a0: 2.25, a1: 4.0, y: 4.5, h: 9, ph: 3.1 },
      { r: 11, a0: 3.9, a1: 4.85, y: 3.6, h: 7, ph: 4.4 },
    ];
    for (const c of curtains) {
      const g = new THREE.PlaneGeometry(1, 1, 220, 1);
      const u = { ...this.uniforms, uR: { value: c.r }, uA0: { value: c.a0 }, uA1: { value: c.a1 }, uY: { value: c.y }, uH: { value: c.h }, uPh: { value: c.ph } };
      const m = new THREE.Mesh(g, additive({
        uniforms: u,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTime, uR, uA0, uA1, uY, uH, uPh, uEnergy;
          varying vec2 vUv; varying float vAz;
          ${NOISE}
          void main(){
            vUv = uv;
            float a = mix(uA0, uA1, uv.x);
            vAz = a;
            float wob = (fbm(vec3(uv.x * 4.0 + uPh, uTime * 0.06, uPh)) - 0.5) * 4.0;
            float r = uR + wob + sin(uv.x * 12.0 + uTime * 0.3 + uPh) * 0.4;
            float y = uY + uv.y * uH + sin(uv.x * 7.0 + uTime * 0.2) * 0.4 * uv.y;
            vec3 p = vec3(sin(a) * r, y, -cos(a) * r);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uC1, uC2; uniform float uTime, uFade, uEnergy, uBreath, uWaveT, uPulse, uPh;
          uniform vec3 uHot;
          varying vec2 vUv; varying float vAz;
          ${NOISE}
          void main(){
            float streak = fbm(vec3(vUv.x * 40.0, uTime * 0.15, uPh));
            streak = pow(streak, 2.0) * 2.2;
            float base = smoothstep(0.0, 0.06, vUv.y) * pow(1.0 - vUv.y, 1.6);
            float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
            float wave = exp(-pow((vUv.x - (uTime - uWaveT) * 0.18), 2.0) * 60.0) * step(0.0, uTime - uWaveT);
            float dA = mod(vAz - uHot.x + 3.14159, 6.28318) - 3.14159;
            float hot = exp(-dA * dA * 6.0) * exp(-(uTime - uHot.z) * 1.5) * step(0.0, uTime - uHot.z);
            vec3 col = mix(uC2, uC1 * 1.4, smoothstep(0.05, 0.7, vUv.y));
            col += vec3(1.0) * (wave * 0.5 + hot * 0.4) * (1.0 - vUv.y);
            float a = base * edge * streak * (0.35 + uEnergy * 0.7 + uBreath * 0.2 + uPulse * 0.25 + wave * 1.2 + hot);
            gl_FragColor = vec4(col * a * uFade * 0.8, 1.0);
          }`,
      }));
      m.frustumCulled = false;
      this.group.add(m);
    }
  }

  onEvent(e) {
    const t = this.uniforms.uTime.value;
    if (e.type === 'chord') this.uniforms.uWaveT.value = t;
    if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.6 : 0.25));
    if (e.type === 'note') this.uniforms.uHot.value.set(Math.atan2(e.pos[0], -e.pos[2]), 0, t);
  }

  update(dt) {
    this.uniforms.uPulse.value *= Math.exp(-dt * 2.2);
  }
}
