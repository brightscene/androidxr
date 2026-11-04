import * as THREE from 'three';

// A tileable 3D value-noise texture, baked once. Shaders sample it instead of
// computing noise per pixel, which is many times cheaper on a headset GPU.
function makeNoiseTexture(size = 64, period = 16) {
  const lat = new Float32Array(period ** 3);
  let seed = 1234567;
  for (let i = 0; i < lat.length; i++) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; lat[i] = seed / 0x7fffffff; }
  const L = (x, y, z) => lat[((z % period) * period + (y % period)) * period + (x % period)];
  const sm = (t) => t * t * (3 - 2 * t);
  const data = new Uint8Array(size ** 3);
  const k = period / size;
  for (let z = 0; z < size; z++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x * k, fy = y * k, fz = z * k;
    const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
    const ux = sm(fx - ix), uy = sm(fy - iy), uz = sm(fz - iz);
    const a = L(ix, iy, iz) + (L(ix + 1, iy, iz) - L(ix, iy, iz)) * ux;
    const b = L(ix, iy + 1, iz) + (L(ix + 1, iy + 1, iz) - L(ix, iy + 1, iz)) * ux;
    const c = L(ix, iy, iz + 1) + (L(ix + 1, iy, iz + 1) - L(ix, iy, iz + 1)) * ux;
    const d = L(ix, iy + 1, iz + 1) + (L(ix + 1, iy + 1, iz + 1) - L(ix, iy + 1, iz + 1)) * ux;
    const v = (a + (b - a) * uy) + ((c + (d - c) * uy) - (a + (b - a) * uy)) * uz;
    data[(z * size + y) * size + x] = Math.round(v * 255);
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RedFormat;
  tex.type = THREE.UnsignedByteType;
  tex.minFilter = tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}

// Uniforms shared by every material (same {value} objects, so one update reaches all).
export const U = {
  uNoiseTex: { value: Object.assign(makeNoiseTexture(), { userData: { keep: true } }) },
  uOct: { value: 4 }, // noise detail; lowered automatically if the headset is struggling
  uTime: { value: 0 },
  uViewH: { value: 800 }, // half viewport height in px, for point sizing
  uEnergy: { value: 0.3 },
  uBreath: { value: 0 },
  uLevel: { value: 0 },
  uBeat: { value: 0 },
  uTravel: { value: 0 }, // metres travelled through the stars
  uSpeed: { value: 0.5 }, // current travel speed (m/s)
  uDive: { value: 0 }, // 0..1 dive envelope
  uC0: { value: new THREE.Color('#0b1d3a') },
  uC1: { value: new THREE.Color('#1f6f8b') },
  uC2: { value: new THREE.Color('#99e1d9') },
};

export const NOISE = /* glsl */ `
precision highp sampler3D;
uniform sampler3D uNoiseTex;
float hash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ return texture(uNoiseTex, x * 0.0625).r; }
uniform float uOct;
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ if (float(i) >= uOct) { s += a * 0.5 * 2.0; break; } s+=a*vnoise(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a*=.5; } return s; }
`;

// Fragment-only: gentle filmic shoulder + dither so dark gradients never band. Include after NOISE.
export const GRADE = /* glsl */ `
vec3 grade(vec3 c){ c = c / (1.0 + c * 0.16) * 1.08; return c + (hash3(vec3(gl_FragCoord.xy * 0.731, 3.7)) - 0.5) / 128.0; }
`;

// Point size in pixels for a given world-space size, correct in both eyes.
// Points never draw smaller than 2.5 px: a 1-2 px point renders as a hard
// square, so tiny ones are drawn as a soft 2.5 px dot and dimmed by vPtA to
// keep the same brightness.
export const POINT_SIZE = /* glsl */ `
varying float vPtA;
float pointPx(float worldSize, vec4 mv){
  float px = worldSize * projectionMatrix[1][1] * uViewH / max(0.05, -mv.z);
  vPtA = clamp(px * px / 6.25, 0.0, 1.0);
  return max(px, 2.5);
}
`;

// Round, anti-aliased stars on a sky sphere. A star is a jittered point inside
// each lit grid cell, drawn as a soft disc around it, so stars stay round from
// every angle (lighting whole grid cells made squares and triangles).
// Returns (brightness, random value for colour and twinkle).
export const STARS = /* glsl */ `
float sdHash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
vec2 starDot(vec3 d, float scale, float thresh){
  vec3 p = d * scale; vec3 c = floor(p);
  float r = sdHash(c);
  if (r < thresh) return vec2(0.0);
  vec3 o = 0.45 + 0.1 * vec3(sdHash(c + 11.3), sdHash(c + 27.1), sdHash(c + 3.7));
  float s = smoothstep(0.45, 0.05, length(fract(p) - o));
  return vec2(s * (0.85 + 0.45 * fract(r * 37.0)), fract(r * 91.7));
}
`;

// Soft round sprite for gl_PointCoord.
export const SOFT_DOT = /* glsl */ `
varying float vPtA;
float softDot(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; return smoothstep(1.0, 0.0, d) * smoothstep(1.0, 0.2, d) * vPtA; }
`;

export function sharedUniforms(extra = {}) {
  return { ...U, uFade: { value: 0 }, ...extra };
}

export function additive(params) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    ...params,
  });
}

export const easeInOut = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export class BaseScene {
  constructor() {
    this.group = new THREE.Group();
    this.uniforms = sharedUniforms();
    this.fade = 0;
  }
  setFade(f) { this.fade = f; this.uniforms.uFade.value = f; }
  silence() {}   // scenes with their own sound stop it here when another journey takes over
  onEvent(_e) {}
  onCue(_name) {}
  update(_dt, _t, _s) {}
  dispose() {
    // free everything this scene put on the GPU: geometry, materials and their
    // textures (captions, photos, glows), but never the textures every scene shares
    const texs = new Set();
    const grab = (v) => { if (v && v.isTexture && !v.userData.keep) texs.add(v); };
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
        for (const k of ['map', 'alphaMap', 'emissiveMap', 'normalMap']) grab(m[k]);
        if (m.uniforms) for (const u of Object.values(m.uniforms)) grab(u && u.value);
        m.dispose();
      });
    });
    for (const t of texs) t.dispose();
    this.group.removeFromParent();
  }
}

// Scenes trigger sounds through this hook; the app connects it to the audio
// engine and voice. Calls are ignored until audio has started.
export const SFX = { play() {}, say() { return Promise.resolve(false); }, preload() {}, audio() { return null; } };   // audio(): { ctx, out, reverb, noise } while a session plays

// Hands and pointers for scenes you interact with, refreshed every frame by
// the app: each has a ray (origin + direction) and, for tracked hands, the
// index fingertip position.
export const INPUT = { pointers: [], hands: [], head: null, presses: [], held: new Set(), xr: false };   // xr: in the headset (false on a screen)   // held: pointer ids whose pinch/trigger/click is down   // presses: pointer ids pressed (pinch, trigger, click) this frame   // head: { pos, fwd } of the viewer, each frame   // hands: [{ side, joints: [Vector3 x25] }]
