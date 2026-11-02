import * as THREE from 'three';

// Uniforms shared by every material (same {value} objects, so one update reaches all).
export const U = {
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
float hash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash3(i+vec3(0,0,0)),hash3(i+vec3(1,0,0)),f.x),
                 mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),
                 mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*vnoise(p); p*=2.03; a*=.5; } return s; }
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
  update(_dt, _t, _s) {}
  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
    this.group.removeFromParent();
  }
}
