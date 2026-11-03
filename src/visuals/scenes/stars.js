import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Stars
// A deep, clear night sky full of stars. Thousands twinkle at their own pace in
// true star colours, the Milky Way glows across the sky in soft gold, rose and
// blue, the whole heavens turn slowly about the pole, shooting stars streak
// past now and then, and the night glow breathes gently.
export class StarsScene extends BaseScene {
  // opts.blue: blue stars, some drifting past you; opts.aura: curtains of coloured light
  constructor(opts = {}) {
    super();
    const U = this.uniforms;
    Object.assign(U, { uBlue: { value: opts.blue ? 1 : 0 }, uAura: { value: opts.aura ? 1 : 0 }, uRot: { value: 0 }, uShoot: { value: new THREE.Vector4(0, 0, 0, -1) }, uShootDir: { value: new THREE.Vector3(1, 0, 0) } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uRot, uBreath, uBlue, uAura; uniform vec4 uShoot; uniform vec3 uShootDir; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        vec3 rotAxis(vec3 v, vec3 k, float a){ return v * cos(a) + cross(k, v) * sin(a) + k * dot(k, v) * (1.0 - cos(a)); }
        vec3 starCol(float r){ vec3 w = r < 0.2 ? vec3(0.7, 0.8, 1.0) : r < 0.55 ? vec3(1.0, 0.98, 0.95) : r < 0.8 ? vec3(1.0, 0.9, 0.7) : vec3(1.0, 0.7, 0.55); vec3 b = r < 0.35 ? vec3(0.35, 0.6, 1.0) : r < 0.75 ? vec3(0.55, 0.78, 1.0) : vec3(0.75, 0.92, 1.0); return mix(w, b, uBlue); }
        void main(){ vec3 d0 = normalize(vDir);
          // the heavens turn slowly about the pole
          vec3 pole = normalize(vec3(0.0, 0.8, -0.6));
          vec3 d = rotAxis(d0, pole, uRot);
          // the night: deep blue with a soft glow low on the horizon that breathes gently
          // stars all around you, above and below; a soft night glow that breathes gently
          vec3 c = vec3(0.004, 0.006, 0.02) + vec3(0.02, 0.02, 0.05) * (0.8 + 0.2 * sin(uTime * 0.25)) * (0.5 + 0.5 * fbm(d * 1.5 + 20.0));
          // the Milky Way: a broad glowing band with dust lanes and colour
          vec3 band = normalize(vec3(1.0, 0.18, 0.28));   // arches overhead and across in front of you
          float b = dot(d, band);
          float n1 = fbm(d * 3.0), n2 = fbm(d * 7.0 + 4.0), dust = fbm(d * 5.0 + 9.0);
          float glow = exp(-b * b * 14.0) * (0.5 + 0.7 * n1);
          vec3 mw = mix(vec3(0.35, 0.3, 0.55), vec3(0.95, 0.8, 0.6), n2) * glow * (0.9 + 0.1 * sin(uTime * 0.2 + n1 * 3.0));
          mw *= 1.0 - smoothstep(0.55, 0.75, dust) * 0.75 * exp(-b * b * 30.0);
          mw = mix(mw, vec3(dot(mw, vec3(0.3, 0.4, 0.3))) * vec3(0.45, 0.7, 1.4), uBlue);   // the Milky Way turns blue too
          c += mw * 0.45;
          c += vec3(0.9, 0.4, 0.55) * smoothstep(0.62, 0.85, fbm(d * 4.0 + 2.0)) * glow * 0.18;
          // stars in three layers, each twinkling at its own pace, denser in the Milky Way
          for (int L = 0; L < 3; L++) {
            float fl = float(L);
            vec2 st = starDot(d, 180.0 + fl * 260.0, 0.985 - fl * 0.004 - exp(-b * b * 14.0) * 0.012);
            float tw = 0.55 + 0.45 * sin(uTime * (0.6 + st.y * 3.5) + st.y * 80.0);
            tw *= 0.85 + 0.15 * sin(uTime * (7.0 + st.y * 9.0) + st.y * 31.0);    // a quick shimmer on top
            c += starCol(fract(st.y * 7.3)) * st.x * tw * (1.3 - fl * 0.35);
          }
          // a few bright stars with soft halos and gentle diffraction spikes
          vec3 q = d * 22.0; vec3 cell = floor(q); vec3 f = fract(q) - 0.5;
          float h = sdHash(cell + 3.1);
          if (h > 0.985) {
            vec3 o = (vec3(sdHash(cell + 1.0), sdHash(cell + 2.0), sdHash(cell + 5.0)) - 0.5) * 0.6;
            vec3 p = f - o; float r = length(p);
            float pulse = 0.75 + 0.25 * sin(uTime * (0.8 + h * 2.0) + h * 40.0);
            vec3 sc = starCol(fract(h * 13.0));
            c += sc * (exp(-r * 60.0) * 2.0 + exp(-r * 12.0) * 0.25) * pulse;
            c += sc * (exp(-abs(p.x) * 220.0) + exp(-abs(p.y) * 220.0)) * exp(-r * 10.0) * 0.4 * pulse;
          }
          // blue night: a deeper blue glow behind the stars
          c += vec3(0.0, 0.05, 0.16) * uBlue * (0.6 + 0.4 * fbm(d * 2.0 + uTime * 0.01));
          // an aura: soft curtains of violet, teal and rose light drifting slowly across the sky
          if (uAura > 0.5) {
            float az = atan(d0.x, -d0.z);
            float fold = fbm(vec3(az * 2.0, uTime * 0.04, 3.0));
            float curtain = smoothstep(0.35, 0.85, fbm(vec3(az * 5.0 + fold * 3.0, d0.y * 2.5 - uTime * 0.06, 7.0)));
            float band = smoothstep(-0.1, 0.25, d0.y) * smoothstep(0.95, 0.4, d0.y);
            vec3 au = mix(vec3(0.75, 0.25, 1.0), vec3(0.2, 0.95, 0.85), 0.5 + 0.5 * sin(az * 1.3 + uTime * 0.08 + fold * 2.0));
            au = mix(au, vec3(1.0, 0.4, 0.7), smoothstep(0.45, 0.8, d0.y));
            c += au * curtain * band * 0.5 * (0.8 + 0.2 * sin(uTime * 0.5 + az * 2.0));
          }
          // a shooting star streaking across
          if (uShoot.w >= 0.0 && uShoot.w < 1.0) {
            vec3 s0 = normalize(uShoot.xyz);
            vec3 head = normalize(s0 + uShootDir * uShoot.w * 0.6);
            vec3 tail = normalize(s0 + uShootDir * max(0.0, uShoot.w * 0.6 - 0.18));
            vec3 ab = head - tail; float t = clamp(dot(d0 - tail, ab) / dot(ab, ab), 0.0, 1.0);
            float dist = length(d0 - (tail + ab * t));
            float fadeIn = smoothstep(0.0, 0.1, uShoot.w) * smoothstep(1.0, 0.75, uShoot.w);
            c += vec3(0.9, 0.95, 1.0) * exp(-dist * 900.0) * t * t * fadeIn * 1.6;
          }
          gl_FragColor = vec4(grade(c * (0.97 + uBreath * 0.03)), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);
    if (opts.blue) {
      // blue stars drifting slowly past you
      this.drift = particles(U, { count: 900, min: [-40, -25, -60], max: [40, 35, 10], vel: [0, 0, 1.6], sway: 0.15, size: [0.07, 0.16], colors: ['#5f9bff', '#9fc4ff', '#cfe4ff', '#3f7bff'], alpha: 1.0, clear: 3 });
      this.group.add(this.drift);
    }
    this.nextShoot = 4; this.shootT = -1;
  }
  update(dt) {
    const U = this.uniforms;
    U.uRot.value += dt * 0.004;                 // the sky wheels slowly round
    this.nextShoot -= dt;
    if (this.nextShoot <= 0 && this.shootT < 0) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, el = 0.1 + Math.random() * 0.6;   // mostly in front of you
      U.uShoot.value.set(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el), 0);
      const dir = new THREE.Vector3(Math.random() - 0.5, -0.3 - Math.random() * 0.4, Math.random() - 0.5).normalize();
      U.uShootDir.value.copy(dir);
      this.shootT = 0; this.nextShoot = 6 + Math.random() * 10;
    }
    if (this.shootT >= 0) { this.shootT += dt / (0.7 + Math.random() * 0.02); U.uShoot.value.w = this.shootT; if (this.shootT > 1) { this.shootT = -1; U.uShoot.value.w = -1; } }
  }
}
