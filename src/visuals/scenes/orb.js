import * as THREE from 'three';
import { BaseScene, NOISE, POINT_SIZE, SOFT_DOT, additive, damp } from '../common.js';

// A breathing orb of light with orbiting particle halos.
// Grows on inhale, softens on exhale; notes flare it and kick the halos.
export class OrbScene extends BaseScene {
  constructor() {
    super();
    this.center = new THREE.Vector3(0, 1.5, -2.3);
    this.group.position.copy(this.center);
    Object.assign(this.uniforms, { uFlare: { value: 0 } });
    this.flare = 0;

    const orbMat = additive({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        uniform float uTime, uEnergy, uFlare, uBeat;
        varying vec3 vN; varying vec3 vV; varying float vD;
        ${NOISE}
        void main(){
          float n = fbm(position * 2.4 + vec3(0.0, uTime * 0.25, uTime * 0.15));
          float disp = (n - 0.5) * (0.12 + uEnergy * 0.16 + uFlare * 0.12) + uBeat * 0.02;
          vec3 p = position + normal * disp;
          vD = n;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vN = normalize(normalMatrix * normal);
          vV = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC1, uC2; uniform float uFade, uFlare, uEnergy;
        varying vec3 vN; varying vec3 vV; varying float vD;
        void main(){
          float fr = pow(1.0 - abs(dot(vN, vV)), 2.2);
          vec3 c = mix(uC1, uC2, fr) * (0.25 + fr * 1.1) + uC2 * vD * 0.25 * (0.4 + uEnergy);
          c *= 0.7 + uFlare * 0.8;
          gl_FragColor = vec4(c * uFade, 1.0);
        }`,
    });
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 24), orbMat);
    this.group.add(this.orb);

    // inner core glow (one big soft point)
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3));
    this.core = new THREE.Points(cg, additive({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `uniform float uViewH, uBreath, uFlare; ${POINT_SIZE}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = pointPx(2.2 + uBreath * 0.8 + uFlare, mv); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uC1, uC2; uniform float uFade, uEnergy;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = exp(-d * d * 5.0) * (1.0 - d);
          gl_FragColor = vec4(mix(uC1, uC2, 0.5) * max(a, 0.0) * 0.35 * (0.6 + uEnergy) * uFade, 1.0); }`,
    }));
    this.group.add(this.core);

    // halos
    this.halos = [];
    const specs = [
      { r: 0.85, n: 700, tilt: [0.3, 0, 0.2], speed: 0.25 },
      { r: 1.25, n: 900, tilt: [-0.5, 0, -0.3], speed: -0.17 },
      { r: 1.8, n: 1200, tilt: [1.2, 0.3, 0], speed: 0.11 },
    ];
    for (const s of specs) {
      const pos = new Float32Array(s.n * 3);
      const seed = new Float32Array(s.n);
      for (let i = 0; i < s.n; i++) {
        const a = Math.random() * Math.PI * 2;
        const rr = s.r * (1 + (Math.random() - 0.5) * 0.12);
        pos.set([Math.cos(a) * rr, (Math.random() - 0.5) * 0.06, Math.sin(a) * rr], i * 3);
        seed[i] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      const u = { ...this.uniforms, uKick: { value: 0 }, uR: { value: 1 } };
      const m = new THREE.Points(g, additive({
        uniforms: u,
        vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uViewH, uKick, uR, uBreath; varying float vA;
          ${POINT_SIZE}
          void main(){
            vec3 p = position * uR;
            p.y += sin(aSeed * 50.0 + uTime) * 0.04 * (1.0 + uKick * 3.0);
            p *= 1.0 + uKick * 0.08 * sin(aSeed * 20.0);
            vec4 mv = modelViewMatrix * vec4(p,1.0);
            vA = 0.4 + 0.6 * fract(aSeed * 13.7 + uTime * 0.1);
            gl_PointSize = pointPx(0.012 + aSeed * 0.02 + uKick * 0.02, mv);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: /* glsl */ `uniform vec3 uC2; uniform float uFade, uKick, uEnergy; varying float vA; ${SOFT_DOT}
          void main(){ gl_FragColor = vec4(uC2 * softDot() * vA * (0.5 + uEnergy * 0.5 + uKick) * uFade, 1.0); }`,
      }));
      m.rotation.set(...s.tilt);
      m.userData = { speed: s.speed, u };
      this.group.add(m);
      this.halos.push(m);
    }
    this.scale = 1;
  }

  onEvent(e) {
    if (e.type === 'note') {
      this.flare = Math.min(1.2, this.flare + e.vel * 0.5);
      const h = this.halos[Math.min(2, Math.floor(e.u * 3))];
      h.userData.u.uKick.value = Math.min(1.5, h.userData.u.uKick.value + 0.8);
    }
    if (e.type === 'chord') this.halos.forEach((h) => (h.userData.speed *= -1));
  }

  update(dt, t, s) {
    this.flare *= Math.exp(-dt * 2.5);
    this.uniforms.uFlare.value = this.flare;
    this.scale = damp(this.scale, 0.75 + s.breath * 0.55 + s.level * 0.4, 6, dt);
    this.orb.scale.setScalar(this.scale);
    for (const h of this.halos) {
      h.rotation.y += h.userData.speed * dt * (0.5 + s.energy);
      h.userData.u.uKick.value *= Math.exp(-dt * 2);
      h.userData.u.uR.value = 0.8 + s.breath * 0.35;
    }
  }
}
