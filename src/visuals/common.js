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
  uNoiseTex: { value: makeNoiseTexture() },
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
export const POINT_SIZE = /* glsl */ `
float pointPx(float worldSize, vec4 mv){ return worldSize * projectionMatrix[1][1] * uViewH / max(0.05, -mv.z); }
`;

// Soft round sprite for gl_PointCoord.
export const SOFT_DOT = /* glsl */ `
float softDot(){ vec2 c = gl_PointCoord - 0.5; float d = length(c) * 2.0; return smoothstep(1.0, 0.0, d) * smoothstep(1.0, 0.2, d); }
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
  onEvent(_e) {}
  onCue(_name) {}
  update(_dt, _t, _s) {}
  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.group.removeFromParent();
  }
}
