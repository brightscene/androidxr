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
// A clear Icelandic night: dark snow-capped mountains around a still lake, stars
// overhead, and great curtains of northern lights rippling across the sky in
// green, with rose-pink lower hems and violet crowns, mirrored in the water.
export class NorthernLightsScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uPulse: { value: 0 } });
    // sky, mountains and the lake
    const dome = new THREE.Mesh(new THREE.SphereGeometry(60, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE}
        float sdHash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
        float stars(vec3 d){ vec3 p = d * 220.0, c = floor(p); float r = sdHash(c); if (r < 0.992) return 0.0;
          return smoothstep(0.45, 0.05, length(fract(p) - 0.5)) * (0.6 + 0.4 * sin(uTime * (1.0 + r * 3.0) + r * 50.0)); }
        float ridge(float az){ return 0.035 + 0.09 * pow(fbm(vec3(az * 2.2, 3.0, 1.0)), 1.6) + 0.05 * fbm(vec3(az * 7.0, 1.0, 2.0)) * 0.6; }
        void main(){ vec3 d = normalize(vDir);
          float az = atan(d.x, -d.z);
          float y = d.y;
          vec3 sky = mix(vec3(0.012, 0.02, 0.045), vec3(0.002, 0.006, 0.018), smoothstep(0.0, 0.7, y));
          sky += vec3(0.03, 0.09, 0.06) * exp(-y * 6.0) * 0.5;               // the aurora's glow low on the horizon
          vec3 c = sky + vec3(stars(d)) * smoothstep(0.02, 0.25, y);
          // the mountains, with snow on their upper slopes catching the green light
          float h = ridge(az);
          if (y < h && y > 0.0) {
            float depth = (h - y) / h;
            float snow = smoothstep(0.55, 0.15, depth) * step(0.06, h) * (0.5 + 0.5 * fbm(vec3(az * 30.0, y * 60.0, 1.0)));
            c = vec3(0.008, 0.01, 0.016) + vec3(0.16, 0.3, 0.27) * snow * 0.6;
          }
          // the lake: a dark mirror of the sky and mountains, with gentle ripples
          if (y <= 0.0) {
            float ry = -y + 0.002 * sin(az * 90.0 + uTime * 0.8) * smoothstep(0.0, 0.3, -y);
            float mh = ridge(az);
            vec3 m = mix(vec3(0.012, 0.02, 0.045), vec3(0.002, 0.006, 0.018), smoothstep(0.0, 0.7, ry)) + vec3(0.03, 0.09, 0.06) * exp(-ry * 6.0) * 0.5;
            if (ry < mh) m = vec3(0.006, 0.008, 0.012);
            c = m * 0.55 + vec3(0.005, 0.008, 0.012);
            c *= smoothstep(-1.0, -0.05, y) * 0.6 + 0.4;
          }
          gl_FragColor = vec4(c, uFade); }`,
    }));
    dome.renderOrder = -6;
    this.group.add(dome);

    // the curtains: [radius, from, to, base height, height, phase]
    // [radius, from, to, base height, height, phase, tint: 0 green, 1 magenta-violet, -1 teal-blue]
    const curtains = [
      [22, -1.7, 0.3, 6, 15, 0, 0], [28, -0.2, 1.9, 7.5, 17, 1.7, 1], [34, 1.5, 3.4, 8, 19, 3.1, 0],
      [26, 3.2, 4.7, 6, 15, 4.4, -1], [42, -1.0, 1.0, 13, 20, 5.9, 0.75], [31, 4.5, 6.1, 7, 16, 2.6, 0.5],
    ];
    for (const [r, a0, a1, y, h, ph, tint] of curtains) {
      for (const mirror of [false, true]) {
        const u = { ...U, uR: { value: r }, uA0: { value: a0 }, uA1: { value: a1 }, uY: { value: y }, uH: { value: h }, uPh: { value: ph }, uMirror: { value: mirror ? 1 : 0 }, uTint: { value: tint } };
        const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 260, 1), additive({
          uniforms: u, side: THREE.DoubleSide,
          vertexShader: /* glsl */ `uniform float uTime, uR, uA0, uA1, uY, uH, uPh, uMirror; varying vec2 vUv; ${NOISE}
            void main(){ vUv = uv;
              float a = mix(uA0, uA1, uv.x);
              // the curtain folds and drifts slowly
              float fold = (fbm(vec3(uv.x * 5.0 + uPh, uTime * 0.05, uPh)) - 0.5) * 7.0 + sin(uv.x * 14.0 + uTime * 0.35 + uPh) * 0.8;
              float rr = uR + fold;
              float yy = uY + uv.y * uH + sin(uv.x * 9.0 + uTime * 0.25 + uPh) * 0.8 * uv.y;
              if (uMirror > 0.5) yy = -yy;   // its reflection in the lake
              gl_Position = projectionMatrix * modelViewMatrix * vec4(sin(a) * rr, yy, -cos(a) * rr, 1.0);
            }`,
          fragmentShader: /* glsl */ `uniform float uTime, uFade, uPh, uPulse, uMirror, uTint; varying vec2 vUv; ${NOISE}
            void main(){
              // fine vertical rays, slowly travelling along the curtain
              float rays = fbm(vec3(vUv.x * 60.0 - uTime * 0.12, uPh, uTime * 0.05));
              rays = pow(rays, 1.8) * 2.4;
              float y = vUv.y;
              // colour by height: a rose-pink hem, bright green body, violet and deep red crown
              vec3 col = mix(vec3(1.0, 0.25, 0.6), vec3(0.15, 1.0, 0.45), smoothstep(0.0, 0.12, y));
              col = mix(col, vec3(0.2, 0.9, 0.75), smoothstep(0.35, 0.6, y));
              col = mix(col, vec3(0.55, 0.25, 0.95), smoothstep(0.55, 0.85, y));
              col = mix(col, vec3(0.8, 0.12, 0.25), smoothstep(0.85, 1.0, y));
              // some curtains glow magenta and violet, one teal-blue, and the colours drift slowly
              float drift = 0.5 + 0.5 * sin(uTime * 0.07 + uPh * 2.0 + vUv.x * 2.5);
              vec3 magenta = mix(vec3(1.0, 0.3, 0.75), vec3(0.62, 0.3, 1.0), smoothstep(0.1, 0.7, y));
              vec3 teal = mix(vec3(0.2, 0.95, 0.9), vec3(0.3, 0.55, 1.0), smoothstep(0.2, 0.8, y));
              col = mix(col, magenta, clamp(uTint, 0.0, 1.0) * (0.55 + 0.45 * drift));
              col = mix(col, teal, clamp(-uTint, 0.0, 1.0) * (0.6 + 0.4 * drift));
              float bright = smoothstep(0.0, 0.03, y) * (pow(1.0 - y, 1.2) + 0.15 * smoothstep(0.6, 0.9, y));
              float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
              // waves of brightness rolling along the curtain
              float surge = 0.7 + 0.3 * sin(vUv.x * 6.0 - uTime * 0.6 + uPh) + uPulse * 0.3;
              float a = bright * edge * rays * surge;
              if (uMirror > 0.5) a *= 0.3 * (0.9 + 0.1 * sin(vUv.y * 23.0 + vUv.x * 7.0 + uTime * 0.9));   // dimmer and rippled in the water
              gl_FragColor = vec4(col * a * uFade * 0.85, 1.0);
            }`,
        }));
        m.frustumCulled = false;
        m.renderOrder = mirror ? -3 : -2;
        this.group.add(m);
      }
    }
  }
  onEvent(e) { if (e.type === 'beat') this.uniforms.uPulse.value = Math.min(1, this.uniforms.uPulse.value + (e.accent ? 0.5 : 0.2)); }
  update(dt) { this.uniforms.uPulse.value *= Math.exp(-dt * 2); }
}
