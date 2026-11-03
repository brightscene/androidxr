import * as THREE from 'three';
import { BaseScene, POINT_SIZE, additive } from '../common.js';

// Spiral galaxies drifting past as you travel, and one vast galaxy turning
// slowly overhead like a projection on the ceiling. Chords send a glow out
// along the spiral arms; beats pulse the cores; dives rush them past you.

export function galaxyGeometry(n, arms, twist, seedOff = 0) {
  const pos = new Float32Array(n * 3), aR = new Float32Array(n), aSeed = new Float32Array(n);
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  for (let i = 0; i < n; i++) {
    let x, y, z, r;
    if (i < n * 0.22) { // bulge
      r = Math.abs(gauss()) * 0.16;
      const v = new THREE.Vector3().randomDirection().multiplyScalar(r);
      x = v.x; y = v.y * 0.6; z = v.z;
    } else {
      const arm = i % arms;
      r = 0.08 + Math.pow(Math.random(), 1.4) * 0.92;
      const a = (arm / arms) * Math.PI * 2 + r * twist + gauss() * (0.42 * (1 - r) + 0.12);
      x = Math.cos(a) * r + gauss() * 0.06;
      z = Math.sin(a) * r + gauss() * 0.06;
      y = gauss() * 0.035 * (1 - r * 0.7);
    }
    pos.set([x, y, z], i * 3);
    aR[i] = r;
    aSeed[i] = Math.random();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.BufferAttribute(aR, 1));
  g.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 1));
  return g;
}

export class GalaxyScene extends BaseScene {
  constructor() {
    super();
    Object.assign(this.uniforms, { uArmWave: { value: -99 } });
    this.galaxies = [];
    const specs = [
      { n: 16000, arms: 2, twist: 7 },
      { n: 14000, arms: 3, twist: 5.5 },
      { n: 14000, arms: 4, twist: 4.2 },
    ];
    specs.forEach((sp, i) => {
      const gal = this._makeGalaxy(galaxyGeometry(sp.n, sp.arms, sp.twist), 1);
      this._respawn(gal, -35 - i * 55);
      this.galaxies.push(gal);
    });
    // the great overhead galaxy (does not travel)
    this.ceiling = this._makeGalaxy(galaxyGeometry(42000, 2, 8.5), 1.3);
    this.ceiling.position.set(0, 34, -6);
    this.ceiling.rotation.set(0.12, 0, 0.08);
    this.ceiling.userData.scale = 46;
    this.ceiling.userData.u.uScale.value = 46;
    this.ceiling.scale.setScalar(46);
    this.ceiling.userData.spin = 0.008;
  }

  _makeGalaxy(geo, bright) {
    const u = { ...this.uniforms, uScale: { value: 10 }, uHue: { value: new THREE.Color(1, 1, 1) }, uBright: { value: bright }, uCore: { value: 0 } };
    const m = new THREE.Points(geo, additive({
      uniforms: u,
      vertexShader: /* glsl */ `attribute float aR, aSeed; uniform float uViewH, uScale, uTime, uArmWave, uCore;
        varying float vR; varying float vS; varying float vA; varying float vW;
        ${POINT_SIZE}
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vR = aR; vS = aSeed;
          float age = uTime - uArmWave;
          vW = age > 0.0 ? exp(-pow((aR - age * 0.25) * 6.0, 2.0)) * exp(-age * 0.4) : 0.0;
          float dist = -mv.z;
          vA = smoothstep(260.0, 120.0, dist) * smoothstep(1.5, 6.0, dist);
          float core = (1.0 - smoothstep(0.0, 0.2, aR)) * uCore;
          gl_PointSize = max(1.0, pointPx((0.0045 + aSeed * 0.007) * uScale * (1.0 + core * 0.6 + vW), mv));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uC1, uC2, uHue; uniform float uFade, uBright, uEnergy, uCore;
        varying float vR; varying float vS; varying float vA; varying float vW;
        void main(){
          float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d);
          vec3 core = vec3(1.0, 0.92, 0.78);
          vec3 arm = mix(uC2, uC1 * 1.6, vS) * uHue;
          vec3 c = mix(core, arm, smoothstep(0.05, 0.45, vR));
          c += vec3(1.0) * vW * 0.8;
          float b = (0.55 + uEnergy * 0.5) * (1.0 + (1.0 - smoothstep(0.0, 0.25, vR)) * uCore * 0.8);
          gl_FragColor = vec4(c * a * vA * b * uBright * uFade * 0.75, 1.0);
        }`,
    }));
    m.frustumCulled = false;
    m.userData = { u, spin: 0.02 + Math.random() * 0.03, scale: 10 };
    this.group.add(m);
    return m;
  }

  _respawn(gal, z) {
    let x, y;
    do { x = (Math.random() - 0.5) * 90; y = 1.6 + (Math.random() - 0.5) * 50; } while (Math.abs(x) < 14 && Math.abs(y - 1.6) < 10);
    const sc = 12 + Math.random() * 18;
    gal.position.set(x, y, z);
    // mostly face-on to you, with a gentle tilt, so the spiral arms read clearly
    gal.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.6, Math.random() * 6.28);
    gal.scale.setScalar(sc);
    gal.userData.scale = sc;
    gal.userData.u.uScale.value = sc;
    const hue = new THREE.Color().setHSL(Math.random(), 0.5, 0.75);
    gal.userData.u.uHue.value.set(1, 1, 1).lerp(hue, 0.5);
  }

  onEvent(e) {
    if (e.type === 'chord') this.uniforms.uArmWave.value = this.uniforms.uTime.value;
    if (e.type === 'beat') for (const g of [...this.galaxies, this.ceiling]) g.userData.u.uCore.value = Math.min(1, g.userData.u.uCore.value + (e.accent ? 0.6 : 0.25));
  }

  update(dt, t, s) {
    const speed = this.uniforms.uSpeed.value;
    for (const g of this.galaxies) {
      g.position.z += speed * dt * 0.9;
      g.rotateY(g.userData.spin * dt);
      if (g.position.z > 25) this._respawn(g, -170 - Math.random() * 40);
      g.userData.u.uCore.value *= Math.exp(-dt * 2.5);
    }
    this.ceiling.rotation.y += this.ceiling.userData.spin * dt;
    this.ceiling.userData.u.uCore.value *= Math.exp(-dt * 2.5);
  }
}
