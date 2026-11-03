import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';

// Womb: you float in warm amniotic fluid. Soft red-gold light filters through
// the membrane around you, threaded with veins that brighten with every
// heartbeat. Ahead, a small curled form drifts, lit from behind. The only
// sound is a slow, muffled heartbeat and the hush of flowing blood.

const BPM = 64;

export class WombScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uBeat2: { value: 0 } });
    // the membrane all around: translucent, warm, veined
    const dome = new THREE.Mesh(new THREE.SphereGeometry(6, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: /* glsl */ `uniform float uTime, uBeat2; varying vec3 vDir; ${NOISE}
        void main(){ vDir = position; vec3 p = position;
          p *= 1.0 + 0.02 * sin(uTime * 0.4 + p.y) + uBeat2 * 0.012;   // the walls breathe and pulse
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uBeat2, uBreath; varying vec3 vDir; ${NOISE} ${GRADE}
        float ridge(vec3 p){ return 1.0 - abs(fbm(p) * 2.0 - 1.0); }
        void main(){ vec3 d = normalize(vDir);
          // light from outside, strongest up and to one side
          vec3 L = normalize(vec3(0.35, 0.65, -0.65));
          float through = pow(max(dot(d, L), 0.0), 2.0);
          float tissue = fbm(d * 3.0 + vec3(0.0, uTime * 0.01, 0.0));
          vec3 c = mix(vec3(0.1, 0.012, 0.008), vec3(0.6, 0.14, 0.05), tissue * 0.5 + through * 0.7);
          c += vec3(1.0, 0.45, 0.2) * through * (0.35 + uBeat2 * 0.12 + uBreath * 0.05);
          // branching veins, darker against the light and glowing faintly on the beat
          float v1 = pow(ridge(d * 3.5 + 1.3), 40.0), v2 = pow(ridge(d * 7.0 + 7.1), 50.0) * 0.5;
          float veins = max(v1, v2);
          c = mix(c, vec3(0.2, 0.02, 0.03), veins * (0.28 + through * 0.25));
          c += vec3(0.6, 0.08, 0.05) * veins * uBeat2 * 0.35;
          // soft caustic shimmer of the fluid
          float cau = pow(1.0 - abs(sin(fbm(d * 6.0 + vec3(uTime * 0.05)) * 10.0)), 8.0);
          c += vec3(1.0, 0.55, 0.3) * cau * 0.06 * (0.4 + through);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    dome.renderOrder = -5;
    this.group.add(dome);

    // the little one: a soft curled form, ray-marched inside a sphere, lit from behind
    this.baby = new THREE.Mesh(new THREE.SphereGeometry(0.75, 48, 32), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { ...U, uRot: { value: 0 } },
      vertexShader: 'varying vec3 vO; varying vec3 vP; void main(){ vP = position; vO = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uBeat2, uRot; varying vec3 vO; varying vec3 vP;
        float sdE(vec3 p, vec3 r){ float k0 = length(p / r), k1 = length(p / (r * r)); return k0 * (k0 - 1.0) / k1; }
        float sdC(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }
        float smin(float a, float b, float k){ float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
        float sdS(vec3 p, vec3 c, float r){ return length(p - c) - r; }
        float smax(float a, float b, float k){ return -smin(-a, -b, k); }
        // a baby curled in profile: big head with the chin tucked, a rounded back,
        // knees drawn up to the chest, hands near the face, and the cord
        float map(vec3 p){
          float c = cos(uRot), s = sin(uRot); p.xz = mat2(c, -s, s, c) * p.xz;
          vec3 q = vec3(p.xy, abs(p.z));                                   // left and right sides mirrored
          float head = sdE(p - vec3(-0.01, 0.22, 0.0), vec3(0.175, 0.165, 0.145));
          float face = sdE(p - vec3(-0.115, 0.135, 0.0), vec3(0.065, 0.075, 0.085));
          float d = smin(head, face, 0.05);
          d = smin(d, sdS(p, vec3(-0.172, 0.158, 0.0), 0.016), 0.02);      // nose
          d = smin(d, sdS(p, vec3(-0.16, 0.098, 0.0), 0.024), 0.025);      // chin
          d = smax(d, -sdS(q, vec3(-0.135, 0.19, 0.06), 0.022), 0.02);     // soft hollows of the closed eyes
          d = smin(d, sdE(q - vec3(0.035, 0.19, 0.13), vec3(0.026, 0.034, 0.01)), 0.015);   // ears
          // the body: a curled back and a round belly
          float torso = sdE(p - vec3(0.025, -0.07, 0.0), vec3(0.12, 0.165, 0.11));
          d = smin(d, torso, 0.06);
          d = smin(d, sdC(p, vec3(0.06, 0.08, 0.0), vec3(0.11, -0.12, 0.0), 0.075), 0.06);   // the curve of the back
          d = smin(d, sdE(p - vec3(0.05, -0.23, 0.0), vec3(0.1, 0.07, 0.1)), 0.05);          // bottom
          // legs: thighs up toward the chest, shins folded down, little feet
          d = smin(d, sdC(q, vec3(0.03, -0.22, 0.06), vec3(-0.12, -0.08, 0.075), 0.052), 0.04);
          d = smin(d, sdC(q, vec3(-0.12, -0.08, 0.075), vec3(-0.05, -0.27, 0.085), 0.038), 0.03);
          d = smin(d, sdE(q - vec3(-0.09, -0.29, 0.085), vec3(0.05, 0.022, 0.03)), 0.02);
          // arms: hands up by the face
          d = smin(d, sdC(q, vec3(-0.0, 0.03, 0.095), vec3(-0.05, -0.07, 0.11), 0.032), 0.03);
          d = smin(d, sdC(q, vec3(-0.05, -0.07, 0.11), vec3(-0.135, 0.06, 0.1), 0.026), 0.025);
          d = smin(d, sdE(q - vec3(-0.15, 0.08, 0.095), vec3(0.03, 0.035, 0.022)), 0.02);
          // the umbilical cord, curving gently away
          float cord = min(sdC(p, vec3(-0.08, -0.13, 0.0), vec3(-0.17, -0.3, 0.06), 0.013), sdC(p, vec3(-0.17, -0.3, 0.06), vec3(-0.08, -0.55, 0.15), 0.013));
          return smin(d, cord, 0.02);
        }
        void main(){
          vec3 rd = normalize(vP - vO), ro = vP;
          float t = 0.0, dens = 0.0, hit = 0.0;
          for (int i = 0; i < 64; i++) {
            vec3 p = ro + rd * t;
            float d = map(p);
            if (d < 0.0015) { hit = 1.0; break; }
            dens += exp(-max(d, 0.0) * 40.0) * 0.02;           // a soft glow around the form
            t += max(d * 0.8, 0.004);
            if (t > 4.0) break;
          }
          vec3 p = ro + rd * t;
          vec2 e = vec2(0.002, 0.0);
          vec3 n = normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
          vec3 L = normalize(vec3(0.35, 0.65, -0.65));
          float back = pow(1.0 - max(dot(n, -rd), 0.0), 2.0);  // light glowing round the edges, as if seen through skin
          float wrap = max(0.0, dot(n, L) * 0.5 + 0.5);
          // how much body the light passes through on its way here: thin parts glow
          float thick = 0.0;
          for (int k = 1; k <= 5; k++) thick += max(0.0, -map(p - L * float(k) * 0.025));
          float sss = exp(-thick * 18.0);
          vec3 skin = vec3(0.95, 0.46, 0.34) * (0.3 + wrap * 0.45) + vec3(1.0, 0.55, 0.36) * sss * 0.7 + vec3(1.0, 0.7, 0.5) * back * 1.1;
          skin *= 0.9 + uBeat2 * 0.08;
          vec3 col = skin * hit + vec3(1.0, 0.45, 0.25) * dens * 0.6;
          float a = max(hit * 0.92, min(1.0, dens * 0.8));
          gl_FragColor = vec4(col * uFade, a * uFade);
        }`,
    }));
    this.baby.position.set(0.15, 1.45, -1.7);
    this.baby.scale.setScalar(1.6);
    this.group.add(this.baby);
    // drifting specks in the fluid, and a few slow bubbles of light
    this.group.add(particles(U, { count: 900, min: [-4, -1, -5], max: [4, 4.5, 3], vel: [0.01, 0.015, 0.01], sway: 0.25, size: [0.006, 0.018], colors: ['#ffb08a', '#ff7a5a', '#ffd8b0'], alpha: 0.6 }));
    this.group.add(particles(U, { count: 40, min: [-3, -1, -4], max: [3, 4, 2], vel: [0, 0.05, 0], sway: 0.3, size: [0.04, 0.12], shape: 'bubble', colors: ['#ffc0a0'], alpha: 0.2 }));
    this.nextBeat = 0.5;
    this.nextFlow = 0;
  }

  update(dt, t) {
    const U = this.uniforms;
    // our own steady heartbeat drives the light and the sound
    if (t >= this.nextBeat) {
      this.nextBeat = t + 60 / BPM * (0.97 + Math.random() * 0.06);
      U.uBeat2.value = 1;
      if (this.fade > 0.5) SFX.play('heart', { pan: 0, gain: 1.4 });
      setTimeout(() => { U.uBeat2.value = Math.max(U.uBeat2.value, 0.6); }, 270);
    }
    if (this.fade > 0.5 && t >= this.nextFlow) { SFX.play('hiss', { pan: 0, dur: 30, gain: 0.9, freq: 260 }); this.nextFlow = t + 28; }
    U.uBeat2.value *= Math.exp(-dt * 5);
    // the little one turns very slowly and bobs in the fluid
    this.baby.material.uniforms.uRot.value = Math.sin(t * 0.05) * 0.6 - 0.4;
    this.baby.position.y = 1.45 + Math.sin(t * 0.21) * 0.05;
    this.baby.rotation.z = Math.sin(t * 0.13) * 0.08;
  }
}
