#version 300 es
// Shared by every native scene. Ported from src/visuals/common.js so scenes
// look the same as in the web app.
precision highp float;
precision highp sampler3D;
in vec3 vDir;
out vec4 outColor;
uniform float uTime, uTravel, uFade, uEnergy, uBreath, uBeat, uOct;
uniform vec3 uC0, uC1, uC2;
uniform sampler3D uNoiseTex;

float hash3(vec3 p){ p = fract(p*0.3183099 + .1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ return texture(uNoiseTex, x * 0.0625).r; }
float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ if (float(i) >= uOct) { s += a * 0.5 * 2.0; break; } s+=a*vnoise(p); p = p*2.03 + vec3(1.7, 9.2, 3.1); a*=.5; } return s; }

vec3 grade(vec3 c){ c = c / (1.0 + c * 0.16) * 1.08; return c + (hash3(vec3(gl_FragCoord.xy * 0.731, 3.7)) - 0.5) / 128.0; }

float sdHash(vec3 p){ p = fract(p * vec3(0.1031, 0.1030, 0.0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
vec2 starDot(vec3 d, float scale, float thresh){
  vec3 p = d * scale; vec3 c = floor(p);
  float r = sdHash(c);
  if (r < thresh) return vec2(0.0);
  vec3 o = 0.45 + 0.1 * vec3(sdHash(c + 11.3), sdHash(c + 27.1), sdHash(c + 3.7));
  float s = smoothstep(0.45, 0.05, length(fract(p) - o));
  return vec2(s * (0.85 + 0.45 * fract(r * 37.0)), fract(r * 91.7));
}

vec3 toLinear(vec3 c){ c = max(c, 0.0); return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }

