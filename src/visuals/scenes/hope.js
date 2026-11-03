import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, damp } from '../common.js';
import { particles } from './kit.js';

const DOME_VS = 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
const smooth = (x) => x * x * (3 - 2 * x);

// ===================================================================== Hope
// You sit above a sea of clouds before dawn. Over a few minutes the stars
// fade, a thin line of rose and gold spreads along the horizon and the sun
// slowly crests, fanning soft rays up through the cloud gaps and lighting the
// cloud tops gold. It holds there, glowing, then sinks into twilight and the
// whole dawn begins again.
export class HopeScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uDawn: { value: 0 }, uGlow: { value: 0 } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U, vertexShader: DOME_VS,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uDawn, uGlow, uBreath; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float p = uDawn;
          vec3 S = normalize(vec3(0.0, mix(-0.13, 0.11, p), -1.0));
          float mu = dot(d, S);
          vec2 dh = normalize(d.xz + 1e-4); float az = max(dot(dh, normalize(S.xz)), 0.0);
          float warmth = pow(az, 2.5);
          // sky: night indigo -> dawn rose and gold near the sun, deep blue above
          vec3 zen = mix(vec3(0.006, 0.01, 0.035), vec3(0.06, 0.1, 0.26), p);
          vec3 hor = mix(vec3(0.03, 0.025, 0.07), vec3(0.32, 0.2, 0.36), p);
          vec3 hot = mix(vec3(0.25, 0.08, 0.12), vec3(1.25, 0.6, 0.28), smoothstep(0.15, 0.9, p));
          hor = mix(hor, hot, warmth * smoothstep(0.0, 0.5, p + 0.15));
          float y = d.y;
          vec3 c = mix(hor, zen, smoothstep(-0.02, 0.55, y));
          // first light: a thin bright band on the horizon
          c += vec3(1.0, 0.55, 0.3) * exp(-abs(y - 0.005) * 40.0) * warmth * smoothstep(0.05, 0.5, p) * 0.6;
          // stars fade as the light comes
          vec2 st = starDot(d, 260.0, 0.993);
          c += vec3(0.85, 0.9, 1.0) * st.x * (0.6 + 0.4 * sin(uTime * (1.0 + st.y * 3.0) + st.y * 40.0)) * (1.0 - smoothstep(0.15, 0.6, p)) * smoothstep(0.02, 0.3, y) * 0.8;
          // the sun, its halo and soft rays fanning up through the cloud gaps
          float sunUp = smoothstep(-0.05, 0.03, S.y);
          c += vec3(1.0, 0.75, 0.45) * (pow(max(mu, 0.0), 1200.0) * 6.0 * sunUp + pow(max(mu, 0.0), 60.0) * 0.5 * p + pow(max(mu, 0.0), 6.0) * 0.18 * p) * (1.0 + uGlow * 0.3);
          vec3 v = d - S * mu; float ang = atan(v.y, v.x);
          // soft, wide shafts of light that slowly shift, fading upward
          float rays = 0.6 * vnoise(vec3(ang * 5.0, uTime * 0.02, 1.0)) + 0.4 * vnoise(vec3(ang * 11.0, uTime * 0.03, 5.0));
          rays = smoothstep(0.35, 0.75, rays) * smoothstep(0.7, 0.99, mu) * smoothstep(-0.01, 0.04, y) * smoothstep(0.2, 0.7, p);
          c += vec3(1.0, 0.72, 0.42) * rays * 0.16;
          // high wisps, lit pink-gold from beneath
          float hw = fbm(vec3(d.xz / (y + 0.12) * 0.9 + vec2(uTime * 0.004, 0.0), 2.0));
          float wisp = smoothstep(0.55, 0.85, hw) * smoothstep(0.04, 0.15, y) * smoothstep(0.55, 0.2, y);
          c = mix(c, mix(vec3(0.05, 0.05, 0.1), vec3(1.0, 0.55, 0.45), p * (0.4 + 0.6 * warmth)), wisp * 0.55);
          // the sea of clouds below
          if (y < 0.0) {
            vec2 P = d.xz / max(-y, 0.012);
            vec2 q = P * 0.22 + vec2(0.0, uTime * 0.015);
            float n1 = fbm(vec3(q, uTime * 0.008));
            float n2 = fbm(vec3(q * 2.7 + n1, 4.0 + uTime * 0.01));
            float top = n1 * 0.7 + n2 * 0.3;
            float lit = pow(az, 3.0) * smoothstep(0.4, 0.85, top);
            float shade = smoothstep(0.3, 0.7, n2);
            vec3 cl = mix(vec3(0.015, 0.018, 0.04), vec3(0.17, 0.17, 0.3), p) * (0.3 + top * 1.3) * (0.7 + 0.5 * shade);
            cl += mix(vec3(0.3, 0.08, 0.12), vec3(1.2, 0.62, 0.32), p) * lit * smoothstep(0.1, 0.8, p) * 0.9;
            cl += vec3(1.0, 0.7, 0.4) * pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(S.x, 0.0, S.z))), 0.0), 40.0) * smoothstep(0.06, 0.0, -y) * p * 0.6;
            c = mix(hor, cl, smoothstep(0.0, 0.08, -y));
          }
          gl_FragColor = vec4(grade(c * (0.96 + uBreath * 0.04)), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);
    // motes of light drifting up in the dawn air
    this.motes = particles(U, { count: 260, min: [-30, -4, -45], max: [30, 14, 6], vel: [0.05, 0.18, 0], sway: 0.3, size: [0.03, 0.07], colors: ['#ffd9a0', '#ffc2a8', '#fff2d8'], alpha: 0.5, clear: 3 });
    this.group.add(this.motes);
    this.cycle = 70;   // start just before first light
  }
  onEvent(e) { if (e.type === 'beat' && e.accent) this.uniforms.uGlow.value = Math.min(1, this.uniforms.uGlow.value + 0.3); }
  update(dt) {
    const U = this.uniforms;
    // one dawn every six minutes: 50 s night, 170 s sunrise, 80 s golden, 60 s settling
    this.cycle = (this.cycle + dt) % 360;
    const t = this.cycle;
    const p = t < 50 ? 0 : t < 220 ? smooth((t - 50) / 170) : t < 300 ? 1 : 1 - smooth((t - 300) / 60) * 0.85;
    U.uDawn.value = damp(U.uDawn.value, p, 1.5, dt);
    U.uGlow.value *= Math.exp(-dt * 0.8);
    this.motes.userData.u.uAlpha.value = 0.15 + U.uDawn.value * 0.45;
  }
}

// ===================================================================== Bliss
// A vast flower of light slowly unfolds in the night sky above a mirror-still
// sea. Its silken petals open and close with your breath, colours drifting
// through deep jewel tones; light ripples outward from its heart and is
// mirrored in the water, while soft motes rise all around you.
export class BlissScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uOpen: { value: 0.3 }, uHueT: { value: Math.random() * 6 }, uRip: { value: 0 }, uSpin: { value: 0 } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U, vertexShader: DOME_VS,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uOpen, uHueT, uRip, uSpin, uBreath; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        vec3 pal(float h){
          // deep jewel tones: sapphire, amethyst, rose, teal
          vec3 a = vec3(0.12, 0.2, 0.75), b = vec3(0.5, 0.18, 0.8), c = vec3(0.85, 0.25, 0.5), e = vec3(0.1, 0.6, 0.65);
          h = fract(h) * 4.0;
          return h < 1.0 ? mix(a, b, smoothstep(0.0, 1.0, h)) : h < 2.0 ? mix(b, c, smoothstep(1.0, 2.0, h)) : h < 3.0 ? mix(c, e, smoothstep(2.0, 3.0, h)) : mix(e, a, smoothstep(3.0, 4.0, h));
        }
        vec3 bloom(vec3 d){
          // the flower hangs ahead and above, facing you
          vec3 F = normalize(vec3(0.0, 0.42, -1.0));
          vec3 X = normalize(cross(F, vec3(0.0, 1.0, 0.0))), Y = cross(X, F);
          float k = dot(d, F); if (k <= 0.0) return vec3(0.0);
          vec2 q = vec2(dot(d, X), dot(d, Y)) / k * 1.05;
          float r = length(q), a = atan(q.y, q.x);
          vec3 col = vec3(0.0);
          float hue = uHueT * 0.02;
          // three layers of petals, each turning slowly its own way
          for (int i = 0; i < 3; i++) {
            float fi = float(i);
            float n = 5.0 + fi * 3.0;
            float aa = a + uSpin * (fi - 1.0) * 0.6 + fi * 0.4;
            float open = uOpen * (1.0 - fi * 0.22) + 0.08;
            float petal = abs(cos(aa * n * 0.5));
            float edge = open * (0.35 + 0.65 * pow(petal, 0.8));
            float body = smoothstep(edge, edge * 0.55, r) * smoothstep(0.0, edge * 0.25, r);
            float silk = 0.6 + 0.4 * fbm(vec3(aa * 3.0, r * 6.0 - uTime * 0.06, fi * 3.0 + uTime * 0.02));
            float vein = pow(abs(sin(aa * n * 3.0)), 18.0) * 0.4;
            float rim = smoothstep(edge * 0.8, edge, r) * smoothstep(edge * 1.03, edge, r);
            vec3 pc = pal(hue + fi * 0.13 + r * 0.25);
            col += pc * body * silk * (0.35 - fi * 0.06) * (1.0 + vein) + pc * rim * 0.9 + vec3(1.0, 0.9, 0.95) * rim * 0.15;
          }
          // the heart and ripples of light spreading out from it
          col += mix(vec3(1.0, 0.85, 0.9), pal(hue + 0.5), 0.3) * exp(-r * r * 90.0) * (1.0 + uBreath * 0.3);
          col += pal(hue + 0.3) * exp(-r * 3.0) * 0.25;
          float wave = fract(r * 1.2 - uTime * 0.05);
          col += pal(hue + 0.6) * smoothstep(0.0, 0.03, wave) * smoothstep(0.08, 0.03, wave) * exp(-r * 2.5) * 0.12 * (0.6 + uRip);
          return col;
        }
        void main(){ vec3 d = normalize(vDir);
          vec3 base = mix(vec3(0.012, 0.01, 0.035), vec3(0.002, 0.003, 0.012), smoothstep(0.0, 0.7, abs(d.y)));
          vec3 sky = base;
          // a faint veil of nebula and stars
          float neb = fbm(vec3(d * 2.2 + vec3(0.0, 0.0, uTime * 0.003)));
          sky += pal(uHueT * 0.02 + 0.4 + neb * 0.3) * smoothstep(0.5, 0.9, neb) * 0.06;
          vec2 st = starDot(d, 280.0, 0.992);
          float tw = 0.55 + 0.45 * sin(uTime * (0.7 + st.y * 2.0) + st.y * 50.0);
          vec3 c;
          if (d.y >= 0.0) {
            c = sky + vec3(0.85, 0.9, 1.0) * st.x * tw * smoothstep(0.0, 0.15, d.y) * 0.7 + bloom(d);
          } else {
            // the mirror sea: the reflection, gently broken by slow swells
            vec2 P = d.xz / max(-d.y, 0.01);
            vec2 w = vec2(fbm(vec3(P * 0.35, uTime * 0.05)), fbm(vec3(P * 0.35 + 7.0, uTime * 0.05))) - 0.5;
            vec3 rd = normalize(vec3(d.x + w.x * 0.03, -d.y, d.z + w.y * 0.03));
            float fres = 0.35 + 0.65 * pow(1.0 - (-d.y), 4.0);
            vec2 st2 = starDot(rd, 280.0, 0.992);
            c = base * 0.5 + (bloom(rd) * 0.75 + vec3(0.8) * st2.x * 0.3) * fres;
            c = mix(c, base, smoothstep(0.02, 0.0, -d.y) * 0.4);
          }
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);
    this.motes = particles(U, { count: 380, min: [-22, -2, -30], max: [22, 12, 12], vel: [0, 0.12, 0], sway: 0.4, size: [0.025, 0.06], colors: ['#b9a2ff', '#ff9ad0', '#8fe6ff', '#ffffff'], alpha: 0.55, clear: 2.5 });
    this.group.add(this.motes);
    this.open = 0.3;
  }
  onEvent(e) {
    if (e.type === 'chord' || (e.type === 'beat' && e.accent)) this.uniforms.uRip.value = Math.min(1.2, this.uniforms.uRip.value + 0.5);
  }
  update(dt, t) {
    const U = this.uniforms;
    // unfold over two minutes, then slowly breathe between half and full bloom
    const target = 0.45 + 0.25 * Math.sin(t * 0.045) + U.uBreath.value * 0.04;
    this.open = damp(this.open, Math.min(1, t / 120) * target + 0.05, 0.4, dt);
    U.uOpen.value = this.open;
    U.uHueT.value += dt;
    U.uSpin.value += dt * 0.012;
    U.uRip.value *= Math.exp(-dt * 0.5);
  }
}
