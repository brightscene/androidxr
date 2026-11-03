import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Journey to the centre of the earth
// You bore straight down through the planet. The tunnel walls change as you
// go: soil and roots, banded bedrock, caverns glittering with amethyst and
// quartz, dark mantle rock split by glowing cracks, then the flowing molten
// outer core, until you arrive in the blazing heart of the earth. A short
// rest in the light, a fade to dark, and the journey begins again.
const LAYERS = [
  { at: 0.0, name: 'The crust' },
  { at: 0.16, name: 'Bedrock' },
  { at: 0.36, name: 'Crystal caverns' },
  { at: 0.56, name: 'The mantle' },
  { at: 0.76, name: 'The molten outer core' },
  { at: 0.93, name: 'The heart of the earth' },
];
const JOURNEY = 300;   // seconds from surface to core

export class EarthJourneyScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uDepth: { value: 0 }, uTravel: { value: 0 }, uRoll: { value: 0 }, uShake: { value: 0 }, uDark: { value: 1 } });
    const m = new THREE.Mesh(new THREE.SphereGeometry(30, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uDepth, uTravel, uRoll, uShake, uDark, uBreath; varying vec3 vDir; ${NOISE} ${GRADE}
        float cells(vec2 p, out float id){ vec2 i = floor(p), f = fract(p); float m = 9.0; id = 0.0;
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y); vec2 o = vec2(hash3(vec3(i + g, 1.0)), hash3(vec3(i + g, 7.0)));
            float dd = length(g + o - f); if (dd < m) { m = dd; id = hash3(vec3(i + g, 3.0)); } }
          return m; }
        // the wall material at a given depth through the planet (0 surface .. 1 core)
        vec3 wall(float L, float a, float W, out float emit){
          vec3 P = vec3(cos(a) * 2.0, sin(a) * 2.0, W * 0.6);
          float n = fbm(P), n2 = fbm(P * 2.6 + n);
          float strata = 0.5 + 0.5 * sin(W * 2.2 + n * 5.0);
          emit = 0.0;
          // soil and roots
          vec3 soil = mix(vec3(0.22, 0.13, 0.07), vec3(0.42, 0.28, 0.16), n2) * (0.7 + 0.3 * strata);
          float root = smoothstep(0.02, 0.0, abs(fbm(P * 1.5 + vec3(0.0, 0.0, 3.0)) - 0.5)) * 0.6;
          soil = mix(soil, vec3(0.07, 0.045, 0.03), root);
          // banded bedrock
          vec3 rock = mix(vec3(0.16, 0.15, 0.16), vec3(0.38, 0.33, 0.3), strata) * (0.6 + 0.5 * n2);
          rock = mix(rock, vec3(0.25, 0.18, 0.13), smoothstep(0.6, 0.8, n) * 0.5);
          // crystal caverns: faceted amethyst and quartz with glints
          float id; float cd = cells(vec2(a * 4.0, W * 1.3), id);
          vec3 gem = mix(vec3(0.16, 0.04, 0.3), vec3(0.04, 0.18, 0.26), step(0.65, id)) * (0.25 + 1.1 * pow(smoothstep(0.0, 0.7, cd), 2.0)) * (0.6 + 0.6 * n);
          float glint = pow(max(0.0, sin(id * 80.0 + uTime * (0.5 + id) + W * 0.3)), 40.0);
          vec3 crystal = mix(vec3(0.04, 0.035, 0.05) * (0.5 + n), gem, smoothstep(0.45, 0.6, n2 + id * 0.25)) + vec3(0.9, 0.85, 1.0) * glint * 0.5;
          // mantle: dark basalt split by glowing cracks
          float crack = 1.0 - smoothstep(0.0, 0.06, abs(n2 - 0.5));
          vec3 mantle = vec3(0.06, 0.04, 0.035) * (0.6 + n);
          float mEmit = crack * (0.6 + 0.4 * sin(uTime * 0.8 + W));
          // molten outer core: flowing liquid light
          float flow = fbm(vec3(cos(a) * 1.5, sin(a) * 1.5, W * 0.3 - uTime * 0.25) + n * 1.5);
          vec3 molten = mix(vec3(0.25, 0.03, 0.0), vec3(1.1, 0.45, 0.08), smoothstep(0.4, 0.85, flow));
          // the heart: white-gold radiance
          vec3 heart = mix(vec3(0.7, 0.22, 0.04), vec3(1.4, 0.9, 0.45), smoothstep(0.35, 0.9, flow));
          float t0 = smoothstep(0.13, 0.19, L), t1 = smoothstep(0.33, 0.39, L), t2 = smoothstep(0.53, 0.59, L), t3 = smoothstep(0.73, 0.79, L), t4 = smoothstep(0.9, 0.96, L);
          vec3 c = mix(soil, rock, t0);
          c = mix(c, crystal, t1);
          c = mix(c, mantle, t2);
          c = mix(c, molten, t3);
          c = mix(c, heart, t4);
          emit = mix(0.0, 1.0, t1 - t2) * 0.0 + (t2 - t3) * mEmit + t3;
          c += vec3(1.3, 0.4, 0.05) * (t2 - t3) * mEmit;
          return c;
        }
        void main(){ vec3 d = normalize(vDir);
          d.xy += vec2(sin(uTime * 37.0), cos(uTime * 31.0)) * uShake * 0.004;
          float r = max(length(d.xy), 1e-3), z = max(-d.z, -0.5) / r;
          float a = atan(d.y, d.x) + uRoll;
          float W = z * 0.9 + uTravel;
          float L = clamp(uDepth + z * 0.006, 0.0, 1.0);
          float emit;
          vec3 c = wall(L, a, W, emit);
          // your headlamp lights the nearby walls; the far end falls into darkness, unless it glows
          float lamp = 1.4 / (1.0 + z * 0.22) * (0.8 + 0.2 * pow(max(0.0, -d.z), 2.0));
          float glow = smoothstep(0.55, 0.8, uDepth);
          c *= mix(lamp, 1.0, clamp(emit, 0.0, 1.0));
          // light at the end of the tunnel deep down
          c += mix(vec3(0.0), vec3(1.0, 0.45, 0.1), glow) * exp(-r * r * 30.0) * step(0.0, -d.z) * (0.5 + glow);
          c += vec3(1.0, 0.85, 0.6) * exp(-r * r * 20.0) * step(0.0, -d.z) * smoothstep(0.9, 1.0, uDepth) * 0.4;
          gl_FragColor = vec4(grade(c * uDark * (0.96 + uBreath * 0.04)), uFade); }`,
    }));
    m.renderOrder = -5;
    this.group.add(m);
    // rock dust and sparks from the drill, then embers deeper down
    this.dust = particles(U, { count: 500, min: [-2.5, -1, -40], max: [2.5, 4, 3], vel: [0, 0, 9], sway: 0.1, size: [0.01, 0.025], colors: ['#d8c8b0', '#a89880', '#ffffff'], alpha: 0.5 });
    this.embers = particles(U, { count: 500, min: [-2.5, -1, -40], max: [2.5, 4, 3], vel: [0, 0.3, 9], sway: 0.3, size: [0.015, 0.04], colors: ['#ff9a3a', '#ffcf6a', '#ff5a1a'], alpha: 0 });
    this.group.add(this.dust, this.embers);
    this.text = textPlane(U, 2.0, 0.3);
    this.text.position.set(0, 0.95, -3.2);
    this.text.rotation.x = -0.25;
    this.group.add(this.text);
    this.t = 0; this.layer = -1; this.cap = 0; this.speed = 1; this.state = 'down';
    this.nextSfx = 3;
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }
  update(dt) {
    const U = this.uniforms;
    if (this.state === 'down') {
      this.t += dt;
      const p = Math.min(1, this.t / JOURNEY);
      U.uDepth.value = p;
      // speed swells and eases through each layer, faster in open rock, slower in the core
      const target = 1.4 + 0.8 * Math.sin(this.t * 0.07) - p * 0.6;
      this.speed = damp(this.speed, target, 0.6, dt);
      if (p >= 1) { this.state = 'rest'; this.t = 0; }
    } else if (this.state === 'rest') {
      this.t += dt;
      this.speed = damp(this.speed, 0.25, 0.4, dt);
      if (this.t > 30) { this.state = 'fade'; this.t = 0; }
    } else {
      this.t += dt;
      U.uDark.value = Math.max(0, 1 - this.t / 3);
      if (this.t > 5) { this.state = 'down'; this.t = 0; this.layer = -1; U.uDepth.value = 0; U.uTravel.value = 0; }
    }
    if (this.state !== 'fade') U.uDark.value = damp(U.uDark.value, 1, 1.2, dt);
    U.uTravel.value += dt * this.speed;
    U.uRoll.value += dt * 0.008;
    U.uShake.value = 0;   // no shaking: a smooth descent
    // a slow, smooth look left and right as you drill down
    this.panT = (this.panT || 0) + dt;
    this.group.rotation.y = Math.sin(this.panT * 0.09) * 0.4;
    // layer captions
    const p = U.uDepth.value;
    const li = this.state === 'down' ? LAYERS.reduce((k, l, i) => (p >= l.at ? i : k), 0) : this.layer;
    if (li !== this.layer) { this.layer = li; this.text.userData.set(LAYERS[li].name); this.cap = 0; this._sfx('whoosh', { pan: 0, dur: 2.5, gain: 0.35 }); }
    this.cap += dt;
    this.text.material.uniforms.uA.value = Math.min(1, this.cap / 1.5) * (1 - Math.min(1, Math.max(0, this.cap - 6) / 2));
    // what flies past: rock dust above, embers below
    const hot = THREE.MathUtils.smoothstep(p, 0.55, 0.75);
    this.dust.userData.u.uAlpha.value = 0.5 * (1 - hot) * (this.state === 'down' ? 1 : 0.3);
    this.embers.userData.u.uAlpha.value = 0.8 * hot;
    this.dust.userData.u.uBoost.value = this.embers.userData.u.uBoost.value = this.speed * 0.3;
    // the sounds of the deep: falling stones, crackling rock, hissing magma
    this.nextSfx -= dt;
    if (this.nextSfx <= 0 && this.state === 'down') {
      const pan = Math.random() * 1.6 - 0.8;
      if (p < 0.55) this._sfx(Math.random() < 0.5 ? 'thud' : 'crackle', { pan, gain: 0.35, decay: 0.8 });
      else this._sfx('hiss', { pan, gain: 0.25, dur: 2.5, freq: 600 + Math.random() * 600 });
      this.nextSfx = 3 + Math.random() * 6;
    }
  }
}
