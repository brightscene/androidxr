import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, damp } from '../common.js';
import { particles } from './kit.js';

// Scenes made for the built-in AudioStrobe tracks. They follow the track's
// beats (decoded ahead of time from the audio) and its sections.

const domeMesh = (U, frag, r = 60) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 40), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: frag,
  }));
  m.renderOrder = -5;
  return m;
};

// ===================================================================== Journey of the Drums
// Night on an open plain. A fire burns ahead inside a ring of great drums;
// every beat lights one drum's skin, sends a ring of firelight rolling out
// across the ground and throws sparks into the sky.
export class DrumJourneyScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    const RINGS = 8;
    Object.assign(U, { uRings: { value: new Array(RINGS).fill(-99) }, uFire: { value: 0 } });
    this.ringI = 0;
    this.group.add(domeMesh(U, /* glsl */ `uniform float uTime, uFade, uFire, uBreath; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
      void main(){ vec3 d = normalize(vDir);
        vec3 c = mix(vec3(0.012, 0.008, 0.02), vec3(0.02, 0.025, 0.07), smoothstep(-0.05, 0.6, d.y));
        vec2 st = starDot(d, 260.0, 0.993); c += vec3(0.9, 0.85, 0.8) * st.x * smoothstep(0.02, 0.2, d.y);
        // warm smoke rising from the fire ahead
        float smoke = fbm(vec3(d.x * 3.0, d.y * 2.0 - uTime * 0.05, d.z * 3.0)) * exp(-pow(atan(d.x, -d.z) * 1.6, 2.0)) * smoothstep(0.55, 0.0, d.y) * smoothstep(-0.05, 0.05, d.y);
        c += vec3(0.35, 0.12, 0.04) * smoke * (0.6 + uFire * 0.6);
        // distant hills
        float hill = 0.02 + 0.03 * fbm(vec3(atan(d.z, d.x) * 3.0, 0.0, 0.0));
        c = mix(c, vec3(0.006, 0.004, 0.01), smoothstep(hill + 0.005, hill - 0.005, d.y));
        gl_FragColor = vec4(grade(c), uFade); }`));
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFire, uRings[${RINGS}]; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){
          vec2 p = vW.xz - vec2(0.0, -6.0);           // centred on the fire
          float r = length(p);
          vec3 c = vec3(0.025, 0.017, 0.012) * (0.6 + 0.6 * fbm(vec3(vW.xz * 0.6, 0.0)));
          c += vec3(0.6, 0.25, 0.06) * exp(-r * 0.45) * (0.35 + uFire * 0.4);       // firelight on the ground
          // a drum-skin mandala worn into the earth around the fire
          float ang = atan(p.y, p.x);
          float mand = smoothstep(0.06, 0.0, abs(fract(r * 0.5) - 0.5) - 0.44) * step(r, 8.5) * step(2.0, r);
          mand += smoothstep(0.08, 0.0, abs(sin(ang * 8.0)) - 0.92) * step(r, 8.5) * step(2.5, r) * 0.6;
          c += vec3(0.35, 0.14, 0.05) * mand * 0.25;
          // rings of light rolling out on every beat
          for (int i = 0; i < ${RINGS}; i++) {
            float age = uTime - uRings[i];
            if (age < 0.0 || age > 4.0) continue;
            float R = age * 7.0;
            c += vec3(1.0, 0.5, 0.15) * exp(-pow((r - R) * 2.2, 2.0)) * exp(-age * 1.1) * 0.7;
          }
          c = mix(c, vec3(0.006, 0.004, 0.01), smoothstep(14.0, 55.0, length(vW.xz)));
          gl_FragColor = vec4(grade(c), uFade);
        }`,
    }));
    ground.renderOrder = -4;
    this.group.add(ground);
    // the ring of drums
    this.drums = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8, R = 8.5;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.62, 1.1, 32, 4, true), this.drumMat || (this.drumMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide, transparent: true, uniforms: U,
        vertexShader: 'varying vec3 vN; varying vec3 vW; varying float vY; void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; vY = position.y; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
        fragmentShader: /* glsl */ `uniform float uFade, uFire, uTime; varying vec3 vN; varying vec3 vW; varying float vY; ${NOISE}
          void main(){ vec3 toFire = normalize(vec3(0.0, 0.8, -6.0) - vW);
            float lit = max(0.0, dot(normalize(vN), toFire)) * (0.75 + 0.25 * sin(uTime * 9.0 + vW.x) * 0.3 + uFire * 0.4);
            float grain = 0.75 + 0.25 * fbm(vec3(atan(vN.z, vN.x) * 6.0, vY * 8.0, 0.0));
            float rope = smoothstep(0.03, 0.0, abs(fract(vY * 3.0 + atan(vN.z, vN.x) * 0.6) - 0.5) - 0.44);
            vec3 c = vec3(0.16, 0.07, 0.03) * grain * (0.12 + lit) + vec3(0.5, 0.35, 0.2) * rope * lit * 0.5;
            gl_FragColor = vec4(c, uFade); }`,
      })));
      const skin = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff9a40, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false }));
      skin.position.y = 0.56;
      const g = new THREE.Group(); g.add(body, skin);
      g.position.set(Math.sin(a) * R, 0.55, -6 - Math.cos(a) * R);
      this.group.add(g);
      this.drums.push({ skin, glow: 0 });
    }
    // the fire
    const flame = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.6), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFire; varying vec2 vUv; ${NOISE}
        void main(){ vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
          float n = fbm(vec3(p.x * 2.5, p.y * 3.0 - uTime * 2.2, uTime * 0.4));
          float width = (1.0 - p.y) * (0.55 + 0.25 * uFire) + 0.02;
          float shape = smoothstep(width, width * 0.25, abs(p.x + (n - 0.5) * 0.5 * p.y)) * smoothstep(0.0, 0.08, p.y);
          float body = shape * smoothstep(0.95, 0.15, p.y + (n - 0.5) * 0.5);
          vec3 c = mix(vec3(1.0, 0.35, 0.06), vec3(1.0, 0.85, 0.45), smoothstep(0.2, 0.9, body));
          gl_FragColor = vec4(c * body * (1.2 + uFire * 0.6) * uFade, 1.0); }`,
    }));
    flame.position.set(0, 1.25, -6);
    this.group.add(flame);
    // logs
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 10), new THREE.MeshBasicMaterial({ color: 0x2a1408 }));
      log.rotation.set(Math.PI / 2 - 0.35, (i / 4) * Math.PI, 0); log.position.set(0, 0.25, -6);
      this.group.add(log);
    }
    this.sparks = particles(U, { count: 300, min: [-0.9, 0.6, -6.9], max: [0.9, 9, -5.1], vel: [0, 1.3, 0], sway: 0.7, size: [0.012, 0.03], colors: ['#ffcf7a', '#ff8a3a'], alpha: 0.9 });
    this.group.add(this.sparks);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uFade, uFire; varying vec2 vUv; void main(){ float r = length(vUv - vec2(0.5, 0.35)); gl_FragColor = vec4(vec3(1.0, 0.55, 0.18) * exp(-r * r * 18.0) * (0.55 + uFire * 0.5) * uFade, 1.0); }',
    }));
    glow.position.set(0, 1.2, -6);
    this.group.add(glow);
    this.next = 0;
  }
  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'beat') {
      U.uRings.value[this.ringI] = U.uTime.value; this.ringI = (this.ringI + 1) % U.uRings.value.length;
      U.uFire.value = Math.min(1.2, U.uFire.value + (e.accent ? 0.7 : 0.3));
      const d = this.drums[this.next]; this.next = (this.next + (e.accent ? 3 : 1)) % this.drums.length; d.glow = e.accent ? 1 : 0.7;
      this.sparks.userData.u.uBoost.value = e.accent ? 1.5 : 0.6;
    }
  }
  update(dt) {
    const U = this.uniforms;
    U.uFire.value *= Math.exp(-dt * 2.2);
    this.sparks.userData.u.uBoost.value *= Math.exp(-dt * 2);
    for (const d of this.drums) { d.glow *= Math.exp(-dt * 3); d.skin.material.opacity = (0.12 + d.glow * 0.85) * this.fade; }
  }
}

// ===================================================================== Audio Illusions
// You float inside slowly moving optical illusions: drifting moiré rings,
// an endlessly expanding spiral, a checkerboard tunnel that zooms forever and
// a breathing hexagon field. Low contrast, deep colours, changing with the
// sections; beats nudge the motion.
export class IllusionScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uMode: { value: 0 }, uSpin: { value: 0 }, uPulse: { value: 0 } });
    this.group.add(domeMesh(U, /* glsl */ `uniform float uTime, uFade, uMode, uSpin, uPulse, uBreath, uEnergy; varying vec3 vDir; ${NOISE} ${GRADE}
      vec3 pal(float t){ return mix(mix(vec3(0.03, 0.03, 0.12), vec3(0.22, 0.08, 0.42), smoothstep(0.0, 0.6, t)), vec3(0.05, 0.4, 0.48), smoothstep(0.6, 1.0, t)); }
      float illusion(int m, vec2 p, float r, float a){
        if (m == 0) {                                   // moiré of two drifting ring sets
          vec2 o = vec2(sin(uTime * 0.11), cos(uTime * 0.09)) * 0.12;
          float s1 = sin(length(p) * 60.0 - uSpin * 2.0), s2 = sin(length(p - o) * 60.0 + uSpin);
          return 0.5 + 0.25 * (s1 + s2);
        } else if (m == 1) {                            // endlessly expanding spiral
          return 0.5 + 0.5 * sin(a * 6.0 + log(r + 1e-3) * 14.0 - uSpin * 3.0);
        } else if (m == 2) {                            // checkerboard tunnel zooming forever
          float z = 1.0 / max(r, 0.02);
          vec2 q = vec2(a / 6.28318 * 16.0 + uSpin * 0.3, z * 2.0 + uSpin * 2.0);
          return 0.5 + 0.5 * sign(sin(q.x * 3.14159) * sin(q.y * 3.14159)) * smoothstep(0.02, 0.15, r);
        }
        // breathing hexagon field
        vec2 h = p * (9.0 + uBreath * 1.5);
        h.x *= 1.1547; h.y += mod(floor(h.x), 2.0) * 0.5;
        vec2 f = fract(h) - 0.5;
        return 0.5 + 0.5 * sin(length(f) * 12.0 - uSpin * 2.5 + floor(h.x) * 0.6);
      }
      void main(){ vec3 d = normalize(vDir);
        // look straight ahead or behind: both show a pattern centred on the view axis
        vec2 p = d.xy / (1.0 + abs(d.z));
        float r = length(p), a = atan(p.y, p.x);
        float m0 = floor(uMode), f = smoothstep(0.0, 1.0, fract(uMode));
        float v = mix(illusion(int(mod(m0, 4.0)), p, r, a), illusion(int(mod(m0 + 1.0, 4.0)), p, r, a), f);
        v = smoothstep(0.15, 0.85, v);
        vec3 c = pal(v * 0.85 + 0.1 * sin(uTime * 0.05)) * (0.55 + uPulse * 0.2 + uEnergy * 0.2);
        c *= 0.7 + 0.3 * smoothstep(1.2, 0.2, r);
        gl_FragColor = vec4(grade(c), uFade); }`));
    this.group.add(particles(U, { count: 400, min: [-8, -1, -8], max: [8, 6, 8], vel: [0, 0.03, 0], sway: 0.3, size: [0.01, 0.025], colors: ['#c8b8ff', '#9fe8ff'], alpha: 0.5 }));
    this.modeT = 0;
    this.lastSwitch = 0;
  }
  onEvent(e) {
    const U = this.uniforms;
    if (e.type === 'section' || (e.type === 'chord' && U.uTime.value - this.lastSwitch > 70)) { this.modeT = Math.round(this.modeT) + 1; this.lastSwitch = U.uTime.value; }
    if (e.type === 'beat') U.uPulse.value = Math.min(1, U.uPulse.value + (e.accent ? 0.6 : 0.2));
  }
  update(dt) {
    const U = this.uniforms;
    U.uMode.value = damp(U.uMode.value, this.modeT, 0.35, dt);
    U.uSpin.value += dt * (0.25 + U.uPulse.value * 0.6);
    U.uPulse.value *= Math.exp(-dt * 2);
  }
}

// ===================================================================== Dreams in the Mind's Eye
// Drifting through soft indigo and rose dream-clouds toward a great luminous
// eye of light. Its iris slowly breathes and opens; glassy dream bubbles float
// past; beats send shimmers through the iris.
export class MindsEyeScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uOpen: { value: 0 }, uShimmer: { value: 0 } });
    this.group.add(domeMesh(U, /* glsl */ `uniform float uTime, uFade, uOpen, uShimmer, uBreath, uEnergy, uTravel; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
      void main(){ vec3 d = normalize(vDir);
        float n = fbm(d * 2.2 + vec3(0.0, 0.0, -uTime * 0.03 - uTravel * 0.01));
        float n2 = fbm(d * 4.5 + n * 1.5 + vec3(uTime * 0.02, 0.0, 0.0));
        vec3 c = mix(vec3(0.02, 0.015, 0.06), vec3(0.16, 0.08, 0.3), smoothstep(0.35, 0.8, n));
        c = mix(c, vec3(0.38, 0.14, 0.32), smoothstep(0.55, 0.9, n2) * 0.6);
        vec2 st = starDot(d, 240.0, 0.994); c += vec3(0.85, 0.82, 1.0) * st.x * 0.6;
        // the eye, straight ahead
        vec2 p = d.xy / max(-d.z, 0.05) * 1.6;
        float fwd = step(0.0, -d.z);
        float lid = 0.28 + 0.62 * uOpen;                                         // how far the lids are open
        float almond = smoothstep(0.02, -0.02, abs(p.y) - lid * (1.0 - pow(abs(p.x) / 1.05, 2.0)) ) * step(abs(p.x), 1.05);
        float r = length(p), ang = atan(p.y, p.x);
        float pupil = 0.14 + 0.05 * uBreath;
        float fibres = 0.55 + 0.45 * sin(ang * 70.0 + fbm(vec3(ang * 3.0, r * 6.0, uTime * 0.1)) * 6.0);
        float iris = smoothstep(0.5, 0.46, r) * smoothstep(pupil - 0.01, pupil + 0.02, r);
        vec3 irisCol = mix(vec3(0.25, 0.55, 0.85), vec3(0.65, 0.35, 0.9), smoothstep(0.15, 0.5, r)) * (0.5 + 0.5 * fibres) * (0.7 + uShimmer * 0.8);
        float limbal = exp(-pow((r - 0.48) * 30.0, 2.0));
        vec3 eye = vec3(0.1, 0.07, 0.18) * 0.6 + irisCol * iris + vec3(0.6, 0.55, 1.0) * limbal * 0.5;
        eye += vec3(0.9, 0.85, 1.0) * exp(-pow(length(p - vec2(-0.12, 0.12)) * 18.0, 2.0)) * 0.6 * iris;   // a catchlight
        float rim = exp(-pow((abs(p.y) - lid * (1.0 - pow(abs(p.x) / 1.05, 2.0))) * 30.0, 2.0)) * step(abs(p.x), 1.05);
        c = mix(c, eye, almond * fwd * 0.95);
        c += vec3(0.75, 0.6, 1.0) * rim * fwd * 0.5;
        c += vec3(0.5, 0.4, 0.9) * exp(-r * 1.2) * fwd * 0.15;                   // the eye's soft glow
        gl_FragColor = vec4(grade(c * (0.85 + uEnergy * 0.2)), uFade); }`, 40));
    // dream bubbles
    this.group.add(particles(U, { count: 160, min: [-10, -1, -16], max: [10, 7, 6], vel: [0.05, 0.08, 0.3], sway: 0.6, size: [0.12, 0.4], shape: 'bubble', colors: ['#d8c8ff', '#ffd0ec', '#bfefff'], alpha: 0.35 }));
    this.group.add(particles(U, { count: 700, min: [-12, -2, -20], max: [12, 8, 8], vel: [0.02, 0.04, 0.2], sway: 0.4, size: [0.01, 0.03], colors: ['#ffffff', '#e8d8ff', '#ffd8f0'], alpha: 0.6 }));
    this.openT = 0.3;
  }
  onEvent(e) {
    if (e.type === 'beat') this.uniforms.uShimmer.value = Math.min(1, this.uniforms.uShimmer.value + (e.accent ? 0.6 : 0.2));
    if (e.type === 'section') this.openT = [0.25, 0.5, 0.8, 1.0, 0.55][e.index ?? 0] ?? 0.6;
  }
  update(dt, t) {
    const U = this.uniforms;
    U.uShimmer.value *= Math.exp(-dt * 2);
    // a slow blink now and then
    const blink = Math.pow(Math.max(0, Math.sin(t * 0.07)), 60.0);
    U.uOpen.value = damp(U.uOpen.value, this.openT * (1 - blink), 0.5, dt);
  }
}
