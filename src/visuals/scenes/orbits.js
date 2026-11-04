import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS } from '../common.js';

// ===================================================================== Orbits
// Gliding high over a world, the way the Final frontier ends: the curve of the
// planet below you, its thin glowing edge of atmosphere, and the surface
// drifting slowly beneath.
//   earth:   oceans, coasts, clouds and the blue limb; the sun slowly sets
//            ahead into an orange-red band, city lights come out on the night
//            side, then a new sunrise
//   moon:    low over grey, cratered plains and dark maria in low sunlight,
//            no air, the stars bright, and the Earth hanging in the black
//   jupiter: skimming the cloud tops: cream, tan and rust bands curling past,
//            white ovals, the Great Red Spot sliding by, Io and Europa above
const WORLDS = {
  earth: { R: 6371, h: 420, speed: 0.0032 },
  moon: { R: 1737, h: 45, speed: 0.0055 },
  jupiter: { R: 69911, h: 4200, speed: 0.0011 },
};

const COMMON = /* glsl */ `
  float hitSphere(vec3 o, vec3 d, float r, float hs){ float b = dot(o, d), c = hs * (2.0 * r + hs), h = b * b - c; if (h < 0.0) return -1.0; h = sqrt(h); float t = -b - h; return t > 0.0 ? t : (-b + h > 0.0 ? -b + h : -1.0); }
  vec3 rotX(vec3 v, float a){ float c = cos(a), s = sin(a); return vec3(v.x, v.y * c - v.z * s, v.y * s + v.z * c); }
  // a disc in the sky (a moon, the Earth): returns its surface normal in .xyz and coverage in .w
  vec4 skyBody(vec3 d, vec3 dir, float rad){
    float cd = dot(d, dir);
    float ang = acos(clamp(cd, -1.0, 1.0));
    if (ang > rad * 1.15) return vec4(0.0);
    vec3 up = abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 ax = normalize(cross(up, dir)), ay = cross(dir, ax);
    vec2 q = vec2(dot(d, ax), dot(d, ay)) / sin(rad);
    float r2 = dot(q, q);
    float cov = smoothstep(1.0, 0.97, sqrt(r2));
    vec3 n = normalize(ax * q.x + ay * q.y - dir * sqrt(max(0.0, 1.0 - r2)));
    return vec4(n, cov);
  }
`;

const EARTH = /* glsl */ `
  vec3 world(vec3 o, vec3 d, float h, vec3 c, float el, float horizonEl){
    float tg = hitSphere(o, d, R_, h);
    // the atmosphere, seen edge-on: the closest the ray comes to the ground
    float tc = max(-dot(o, d), 0.0);
    vec3 pc = o + d * tc;
    float hc = tg > 0.0 ? 0.0 : length(pc) - R_;
    vec3 nc = normalize(pc);
    float litc = dot(nc, uSun);
    vec3 dayAir = vec3(0.28, 0.55, 1.0);
    vec3 duskAir = vec3(1.0, 0.42, 0.12);
    vec3 airCol = mix(duskAir, dayAir, smoothstep(-0.02, 0.22, litc)) * smoothstep(-0.2, 0.0, litc);
    if (tg < 0.0) {
      float glow = exp(-hc / 22.0) * 1.3 + exp(-hc / 6.0) * 0.6;
      c += airCol * glow;
      // faint green airglow high on the night side
      c += vec3(0.15, 0.7, 0.3) * exp(-pow((hc - 95.0) / 9.0, 2.0)) * 0.12 * smoothstep(0.1, -0.1, litc);
      return c;
    }
    vec3 p = o + d * tg;
    vec3 n = normalize(p);
    vec3 s = rotX(n, -uTime * SPEED_);
    float lit = dot(n, uSun);
    float day = smoothstep(-0.08, 0.15, lit);
    // land and sea
    float land = fbm(s * 2.6 + 4.0) * 1.0 + fbm(s * 9.0 + 1.3) * 0.38 + fbm(s * 40.0) * 0.08 - 0.71;
    float coast = smoothstep(0.0, 0.03, land);
    vec3 sea = mix(vec3(0.01, 0.05, 0.16), vec3(0.02, 0.2, 0.32), smoothstep(-0.06, 0.0, land));
    float dry = fbm(s * 5.0 + 7.0);
    vec3 ground = mix(vec3(0.1, 0.24, 0.08), vec3(0.5, 0.4, 0.24), smoothstep(0.42, 0.6, dry));
    ground = mix(ground, vec3(0.62, 0.5, 0.33), smoothstep(0.62, 0.72, dry));
    ground *= 0.8 + 0.35 * fbm(s * 70.0);
    vec3 col = mix(sea, ground, coast);
    col *= 0.04 + 1.1 * max(lit, 0.0);
    // the sun's glint on the sea
    float glint = pow(max(dot(reflect(d, n), uSun), 0.0), 140.0);
    col += vec3(1.0, 0.85, 0.6) * glint * (1.0 - coast) * 1.6 * day;
    // city lights on the night side
    float town = smoothstep(0.55, 0.85, fbm(s * 55.0 + 3.0)) * smoothstep(0.62, 0.9, fbm(s * 9.0 + 9.0) + 0.3) * coast;
    col += vec3(1.0, 0.7, 0.35) * town * 0.9 * (1.0 - smoothstep(-0.12, 0.02, lit));
    // clouds, drifting a little on their own
    vec3 sc = rotX(n, -uTime * SPEED_ * 1.08);
    float cl = smoothstep(0.5, 0.74, fbm(sc * 7.0 + vec3(0.0, uTime * 0.004, 0.0)) * 0.72 + fbm(sc * 26.0) * 0.32);
    col = mix(col, vec3(0.95) * (0.03 + 1.05 * max(lit, 0.0)) + vec3(1.0, 0.45, 0.2) * 0.25 * exp(-pow(lit / 0.06, 2.0)), cl * 0.92);
    // the air thickens toward the horizon
    float graze = pow(1.0 - max(dot(n, -d), 0.0), 4.0);
    col = mix(col, airCol * 0.9, graze * 0.85);
    return col;
  }
`;

const MOON = /* glsl */ `
  float h31(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
  // crater field at one scale: height and its slope, from the nearest cells
  void craters(vec3 p, float amp, inout float hgt, inout vec3 grad){
    vec3 b = floor(p - 0.5);
    for (int i = 0; i < 2; i++) for (int j = 0; j < 2; j++) for (int k = 0; k < 2; k++) {
      vec3 cell = b + vec3(float(i), float(j), float(k));
      float r = h31(cell);
      if (r < 0.35) continue;
      vec3 ctr = cell + 0.5 + 0.35 * (vec3(h31(cell + 7.1), h31(cell + 3.3), h31(cell + 9.7)) - 0.5);
      float rad = 0.18 + 0.25 * fract(r * 13.7);
      vec3 dv = p - ctr;
      float x = length(dv) / rad;
      if (x > 1.8) continue;
      // a bowl with a raised rim
      float hh = x < 1.0 ? (x * x - 1.0) * 0.6 + 0.25 : 0.25 * exp(-(x - 1.0) * 4.0);
      float dh = x < 1.0 ? 1.2 * x : -1.0 * exp(-(x - 1.0) * 4.0);
      hgt += hh * amp;
      grad += normalize(dv + 1e-5) * dh * amp / rad;
    }
  }
  vec3 world(vec3 o, vec3 d, float h, vec3 c, float el, float horizonEl){
    float tg = hitSphere(o, d, R_, h);
    if (tg < 0.0) return c;
    vec3 p = o + d * tg;
    vec3 n = normalize(p);
    vec3 s = rotX(n, -uTime * SPEED_);
    float hgt = 0.0; vec3 grad = vec3(0.0);
    craters(s * 18.0, 1.0, hgt, grad);
    craters(s * 60.0 + 3.0, 0.45, hgt, grad);
    craters(s * 190.0 + 7.0, 0.22, hgt, grad);
    // turn the craters' slopes into the lighting, rotated back into the world
    vec3 g = rotX(grad, uTime * SPEED_);
    g -= n * dot(g, n);
    vec3 nn = normalize(n - g * 0.035);
    float mare = smoothstep(0.5, 0.62, fbm(s * 3.0 + 2.0) * 0.8 + fbm(s * 11.0) * 0.25);
    vec3 alb = mix(vec3(0.6, 0.58, 0.55), vec3(0.3, 0.3, 0.31), mare) * (0.85 + 0.3 * fbm(s * 120.0));
    float lit = max(dot(nn, uSun), 0.0);
    vec3 col = alb * (0.02 + 1.6 * lit);
    // no air: just the faintest dusting toward the horizon
    col *= 1.0 - 0.25 * pow(1.0 - max(dot(n, -d), 0.0), 6.0);
    return col;
  }
`;

const JUPITER = /* glsl */ `
  vec3 band(float f){
    // cream zones, tan and rust belts, with blue-grey between
    vec3 a = vec3(0.93, 0.87, 0.74), b = vec3(0.78, 0.58, 0.4), cc = vec3(0.56, 0.34, 0.2), dd = vec3(0.6, 0.62, 0.66);
    float x = fract(f);
    vec3 col = mix(a, b, smoothstep(0.15, 0.35, x));
    col = mix(col, cc, smoothstep(0.42, 0.55, x) * (1.0 - smoothstep(0.62, 0.75, x)));
    col = mix(col, dd, smoothstep(0.8, 0.88, x) * (1.0 - smoothstep(0.9, 0.98, x)) * 0.6);
    return col;
  }
  vec3 world(vec3 o, vec3 d, float h, vec3 c, float el, float horizonEl){
    float tg = hitSphere(o, d, R_, h);
    float tc = max(-dot(o, d), 0.0);
    vec3 pc = o + d * tc;
    float lit0 = dot(normalize(pc), uSun);
    vec3 airCol = vec3(0.85, 0.72, 0.55) * smoothstep(-0.15, 0.15, lit0);
    if (tg < 0.0) {
      float hc = length(pc) - R_;
      c += airCol * (exp(-hc / 260.0) * 0.9 + exp(-hc / 60.0) * 0.4);
      return c;
    }
    vec3 p = o + d * tg;
    vec3 n = normalize(p);
    vec3 s = rotX(n, -uTime * SPEED_);
    float t = uTime * 0.01;
    // the bands curl and festoon: latitude bent by turbulence that shears along them
    vec3 w = s * vec3(14.0, 5.0, 5.0);
    float turb = fbm(w + vec3(0.0, t, -t)) - 0.47;
    float turb2 = fbm(s * vec3(40.0, 12.0, 12.0) + vec3(t * 2.0)) - 0.47;
    float lat = s.x + turb * 0.05 + turb2 * 0.02;
    // the Great Red Spot, and a few white ovals
    vec3 grs = normalize(vec3(-0.12, 0.6, -0.8));
    vec3 dv = s - grs;
    float e = length(dv * vec3(1.0, 1.7, 1.7) * vec3(20.0, 8.0, 8.0));
    float swirl = exp(-e * e * 0.5);
    lat += swirl * 0.02 * sin(atan(dv.y, dv.z) * 2.0 + e * 3.0 - uTime * 0.2);
    vec3 col = band(lat * 16.0 + 0.3);
    col = mix(col, vec3(0.78, 0.33, 0.18) * (0.85 + 0.3 * fbm(s * 90.0)), smoothstep(1.4, 0.6, e));
    float ov = 0.0;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      vec3 oc = normalize(vec3(-0.25 + fi * 0.12, cos(fi * 1.7 + 0.4), sin(fi * 1.7 + 0.4)));
      ov = max(ov, smoothstep(1.0, 0.6, length((s - oc) * vec3(55.0, 32.0, 32.0))));
    }
    col = mix(col, vec3(0.97, 0.95, 0.9), ov * 0.85);
    col *= 0.85 + 0.25 * fbm(s * 140.0 + vec3(t * 3.0));
    float lit = dot(n, uSun);
    col *= 0.02 + 1.1 * max(lit, 0.0);
    float graze = pow(1.0 - max(dot(n, -d), 0.0), 3.0);
    col = mix(col, airCol * 0.75, graze * 0.7);
    return col;
  }
`;

export class OrbitScene extends BaseScene {
  constructor({ kind = 'earth' } = {}) {
    super();
    this.kind = kind;
    const W = WORLDS[kind];
    const U = this.uniforms;
    Object.assign(U, { uSun: { value: new THREE.Vector3(0.3, 0.1, -0.9).normalize() }, uAlt: { value: W.h } });
    const body = { earth: EARTH, moon: MOON, jupiter: JUPITER }[kind];
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uAlt; uniform vec3 uSun; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS} ${COMMON} ${body}
        void main(){ vec3 d = normalize(vDir);
          float h = uAlt;
          vec3 o = vec3(0.0, R_ + h, 0.0);
          float horizonEl = -acos(clamp(R_ / (R_ + h), 0.0, 1.0));
          float el = asin(clamp(d.y, -1.0, 1.0));
          // black space, stars, the sun
          vec3 c = vec3(0.0);
          vec2 st = starDot(d, 260.0, 0.982);
          c += vec3(0.9, 0.95, 1.0) * st.x * STARS_ * (0.75 + 0.25 * sin(uTime * (1.0 + st.y * 3.0) + st.y * 40.0));
          float mu = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.96, 0.88) * (smoothstep(SUNSIZE, SUNSIZE + 0.00003, mu) * 6.0 + pow(mu, 3000.0) * 1.5 + pow(mu, 200.0) * 0.25 + pow(mu, 12.0) * 0.03);
          ${kind === 'moon' ? `
          // the Earth, hanging in the black
          { vec3 ed = normalize(vec3(-0.35, 0.16, -0.92)); vec4 b = skyBody(d, ed, 0.05);
            if (b.w > 0.0) { vec3 bn = b.xyz; vec3 bs = rotX(bn, uTime * 0.01);
              float land = fbm(bs * 3.0 + 4.0) + fbm(bs * 9.0) * 0.35 - 0.68;
              vec3 ec = mix(vec3(0.03, 0.12, 0.35), vec3(0.3, 0.4, 0.2), smoothstep(0.0, 0.03, land));
              ec = mix(ec, vec3(0.95), smoothstep(0.52, 0.72, fbm(bs * 7.0 + 2.0)));
              float l = max(dot(bn, uSun), 0.0);
              ec = ec * (0.02 + 1.1 * l) + vec3(0.25, 0.5, 1.0) * pow(1.0 - max(dot(bn, -d), 0.0), 3.0) * l;
              c = mix(c, ec, b.w); }
            c += vec3(0.3, 0.55, 1.0) * exp(-max(0.0, acos(clamp(dot(d, ed), -1.0, 1.0)) - 0.05) * 140.0) * 0.12; }` : ''}
          ${kind === 'jupiter' ? `
          // Io and Europa
          { vec3 md = normalize(vec3(-0.15, 0.1, -0.98)); vec4 b = skyBody(d, md, 0.02);
            if (b.w > 0.0) { float l = max(dot(b.xyz, uSun), 0.0); vec3 ic = mix(vec3(0.92, 0.78, 0.35), vec3(0.75, 0.45, 0.2), smoothstep(0.45, 0.6, fbm(b.xyz * 6.0))); c = mix(c, ic * (0.02 + 1.1 * l), b.w); } }
          { vec3 md = normalize(vec3(-0.62, 0.17, -0.76)); vec4 b = skyBody(d, md, 0.012);
            if (b.w > 0.0) { float l = max(dot(b.xyz, uSun), 0.0); vec3 ic = mix(vec3(0.92, 0.9, 0.85), vec3(0.65, 0.5, 0.4), smoothstep(0.5, 0.62, fbm(b.xyz * 9.0))); c = mix(c, ic * (0.02 + 1.1 * l), b.w); } }` : ''}
          c = world(o, d, h, c, el, horizonEl);
          gl_FragColor = vec4(grade(c), uFade); }`
        .replace(/R_/g, W.R.toFixed(1)).replace(/SPEED_/g, W.speed.toFixed(5)).replace(/SUNSIZE/g, kind === 'jupiter' ? '0.999985' : '0.99995').replace(/STARS_/g, kind === 'earth' ? '0.55' : '1.0'),
    }));
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    this.viewPitch = -0.28;   // on a screen, look down a little so the world fills the lower view
    this.group.add(sky);
    this.t = 0;
  }
  update(dt) {
    this.t += dt;
    const S = this.uniforms.uSun.value;
    if (this.kind === 'earth') {
      // the sun sinks ahead into the band of air and rises again: an orbital day of five minutes
      const e = -0.12 + 0.5 * Math.sin((this.t / 300) * Math.PI * 2 + 1.2);
      S.set(0.22, Math.sin(e), -Math.cos(e)).normalize();
    } else if (this.kind === 'moon') {
      S.set(0.82, 0.16, -0.55).normalize();   // a low sun: long shadows across the craters
    } else {
      const e = 0.35 + 0.15 * Math.sin((this.t / 400) * Math.PI * 2);
      S.set(0.6, Math.sin(e), -Math.cos(e) * 0.8).normalize();
    }
  }
}
