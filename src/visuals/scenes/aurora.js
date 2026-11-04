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

// ===================================================================== Northern lights
// Iceland at night: snowy mountains with dark rock rise on either side of a
// valley, a river winds across the snow into a lake, and the northern lights
// swirl up out of a glow on the horizon, fanning across a deep blue starry sky
// in green and teal with ribbons of magenta and violet, mirrored in the water.
export class NorthernLightsScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uPulse: { value: 0 } });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uPulse; varying vec3 vDir; ${NOISE}
        float sdHash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
        float stars(vec3 d){ vec3 p = d * 260.0, c = floor(p); float r = sdHash(c); if (r < 0.988) return 0.0;
          return smoothstep(0.42, 0.04, length(fract(p) - 0.5)) * (0.55 + 0.45 * sin(uTime * (0.8 + r * 3.0) + r * 60.0)) * (0.5 + fract(r * 17.0)); }

        // the northern lights: ribbons that swirl up and out from a glow on the horizon
        const vec2 RADIANT = vec2(0.22, -0.06);   // (azimuth, elevation) where they rise from
        vec3 aurora(float az, float el){
          if (el < -0.02) return vec3(0.0);
          vec2 q = vec2(az, el) - RADIANT;
          float fan = atan(q.x, q.y), fr = length(q);
          vec3 col = vec3(0.0);
          for (int k = 0; k < 3; k++) {
            float fk = float(k), t = uTime * 0.025 + fk * 1.9;
            float azs = az + sin(el * 3.5 + t * 3.0 + fk) * 0.18;          // the swirl
            float path = 0.16 + fk * 0.2 + 0.5 * (fbm(vec3(azs * 0.55 + fk * 3.1, t, fk)) - 0.5) + 0.1 * sin(azs * 1.4 + t * 2.0 + fk * 2.0);
            float w = 0.035 + 0.035 * fbm(vec3(azs * 1.8, t * 1.4, fk + 5.0));
            float dist = el - path;
            float hem = exp(-dist * dist / (w * w));                         // the bright lower edge
            float rise = smoothstep(-w, 0.0, dist) * exp(-max(dist, 0.0) / (0.16 + fk * 0.07));   // rays reaching up from it
            float rays = pow(fbm(vec3(fan * 22.0 + fk * 9.0, fr * 1.6 - uTime * 0.05, t)), 2.0) * 2.4;
            float under = exp(min(dist, 0.0) / 0.12) * (1.0 - smoothstep(-w, 0.0, dist)) * 0.22;   // the soft glow beneath each ribbon
            float b = hem * 0.55 + rise * rays + under;
            float hue = fbm(vec3(azs * 0.8 + fk * 4.0, t * 0.6, 7.0 + fk));
            vec3 c = mix(vec3(0.15, 1.0, 0.42), vec3(0.08, 0.95, 0.82), smoothstep(0.35, 0.65, hue));
            float mag = k == 1 ? smoothstep(0.42, 0.6, hue) : smoothstep(0.6, 0.75, hue) * 0.45;
            c = mix(c, mix(vec3(1.0, 0.2, 0.6), vec3(1.0, 0.35, 0.75), smoothstep(0.0, 0.2, dist)), mag);   // ribbons of magenta and pink
            c = mix(c, vec3(0.55, 1.0, 0.3), hem * 0.35 * (1.0 - mag));                                       // a yellow-green hem
            c = mix(c, vec3(0.5, 0.3, 1.0), smoothstep(0.02, 0.3, dist) * 0.7);                   // violet as they climb
            col += c * b * (0.75 - fk * 0.14);
          }
          // the yellow-green glow on the horizon where they rise
          col += vec3(0.5, 1.0, 0.3) * exp(-pow((az - RADIANT.x) * 1.1, 2.0)) * exp(-max(el, 0.0) * 6.0) * 0.75;
          return col * smoothstep(-0.02, 0.05, el) * (0.9 + uPulse * 0.25);
        }

        // mountains: high and snowy to either side, a low far range down the valley
        float ridge(float az){
          float left = 1.0 - smoothstep(-1.15, -0.18, az), right = smoothstep(0.38, 1.25, az);
          float behind = smoothstep(1.6, 2.6, abs(az));
          float h = 0.03 + 0.025 * fbm(vec3(az * 6.0, 1.0, 1.0));
          h += (left * 0.3 + right * 0.26) * (0.75 + 0.35 * fbm(vec3(az * 3.0, 2.0, 1.0)));
          h += behind * 0.12 * fbm(vec3(az * 2.5, 4.0, 2.0));
          return h;
        }

        vec3 sky(vec3 d){
          float el = asin(clamp(d.y, -1.0, 1.0)), az = atan(d.x, -d.z);
          vec3 a = aurora(az, el);
          vec3 c = mix(vec3(0.04, 0.09, 0.2), vec3(0.008, 0.02, 0.07), smoothstep(0.0, 0.9, el));
          c += vec3(stars(d)) * smoothstep(0.02, 0.2, el) + a;
          float h = ridge(az);
          if (el < h) {
            // snowfields cut by dark rocky gullies running down the slopes, lit green by the lights
            float down = (h - el) / max(h, 0.02);                                 // 0 at the ridge, 1 at the foot
            float gully = fbm(vec3(az * 34.0 + el * 18.0, el * 7.0, 3.0));
            float gully2 = fbm(vec3(az * 21.0 - el * 14.0, el * 5.0, 9.0));
            float rock = smoothstep(0.56, 0.7, max(gully, gully2 * 0.95)) + smoothstep(0.12, 0.0, h - el) * 0.35 * fbm(vec3(az * 40.0, 1.0, 2.0));
            float shade = 0.55 + 0.45 * fbm(vec3(az * 12.0 + el * 6.0, el * 18.0, 6.0));
            vec3 light = vec3(0.05, 0.11, 0.15) + aurora(az, 0.28) * 0.09;
            vec3 snow = vec3(0.7, 0.8, 0.88) * light * 2.6 * shade * (1.05 - down * 0.35);
            c = mix(snow, vec3(0.01, 0.013, 0.017) + light * 0.15, clamp(rock, 0.0, 1.0));
            c = mix(c, vec3(0.03, 0.06, 0.1), smoothstep(0.6, 1.0, down) * 0.35 * smoothstep(0.25, 0.05, h));   // haze on the far range
          }
          return c;
        }

        void main(){ vec3 d = normalize(vDir);
          vec3 c;
          if (d.y > 0.0) c = sky(d);
          else {
            // the valley floor, seen from 1.6 m up
            float t = min(1.6 / max(-d.y, 1e-3), 400.0);
            vec2 g = vec2(d.x, -d.z) * t;                // x across, y ahead
            float centre = 1.4 * sin(g.y * 0.11) + 0.5 * sin(g.y * 0.29 + 1.0);
            float width = 0.8 + max(g.y, 0.0) * 0.16 + 0.5 * fbm(vec3(g.y * 0.15, 2.0, 3.0));
            float edge = abs(g.x - centre) + (fbm(vec3(g * 0.8, 5.0)) - 0.5) * 0.9;   // a ragged, natural bank
            float water = smoothstep(width, width * 0.8, edge) * smoothstep(2.0, 4.0, g.y);
            water = max(water, smoothstep(45.0, 70.0, g.y));                // opening into the lake
            // snow, lit by the sky and the lights, with a little sparkle
            float drift = 0.6 + 0.4 * fbm(vec3(g * 0.18, 1.0)) * (0.8 + 0.2 * fbm(vec3(g * 1.5, 4.0)));
            vec3 sp = vec3(g * 30.0, 2.0), sc = floor(sp);
            float sparkle = step(0.992, sdHash(sc)) * smoothstep(0.35, 0.0, length(fract(sp.xy) - 0.5)) * smoothstep(14.0, 2.0, t) * (0.5 + 0.5 * sin(uTime * 3.0 + sdHash(sc + 3.0) * 40.0));
            vec3 snow = vec3(0.07, 0.14, 0.16) * drift * 1.4 + aurora(0.2, 0.3) * 0.035 + vec3(0.6, 1.0, 0.85) * sparkle * 0.25;
            snow *= smoothstep(400.0, 30.0, t) * 0.5 + 0.5;
            snow *= 0.75 + 0.25 * smoothstep(1.0, 8.0, t);   // darker right at your feet
            // the water mirrors the sky, softly rippling
            vec2 rip = vec2(fbm(vec3(g * 0.6, uTime * 0.3)), fbm(vec3(g * 0.6 + 7.0, uTime * 0.3))) - 0.5;
            vec3 r = normalize(vec3(d.x + rip.x * 0.02, -d.y + abs(rip.y) * 0.015, d.z));
            float fres = 0.55 + 0.45 * pow(1.0 - abs(d.y), 4.0);
            vec3 mirror = sky(r) * fres * 0.85 + vec3(0.004, 0.008, 0.014);
            vec3 shore = mix(snow, vec3(0.02, 0.03, 0.035), smoothstep(0.0, 0.5, water) * 0.8);
            c = mix(shore, mirror, smoothstep(0.4, 0.9, water));
          }
          gl_FragColor = vec4(c * uFade, 1.0); }`,
    }));
    dome.renderOrder = -6;
    this.group.add(dome);
  }
  onEvent(e) { if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.5 : 0.2)); }
  update(dt) { this.uniforms.uPulse.value *= Math.exp(-dt * 2); }
}
