import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Neon Tokyo flight
// You fly fast down a rain-soaked canyon of towers in a vast Japanese city at
// night. Every tower is different: shopfront podiums glowing at street level,
// glass curtain walls, LED fins, office ribbons, diagrid lattices and animated
// media facades; stepped tiers, lush sky gardens lit from below, glowing glass
// penthouses and antenna spires blinking red. Giant animated billboards and
// tall neon kanji signs hang over the street, flying traffic streams past,
// and the wet street mirrors it all.
const LEN = 520;       // length of city that loops past you
const STREET = 14;     // half-width of the street
const FLY = 13;        // flying height above the street

// facade styles and building parts
const ST = { grid: 0, glass: 1, fins: 2, ribbons: 3, diagrid: 4, media: 5 };
const PART = { podium: 0, tower: 1, garden: 2, penthouse: 3, spire: 4 };

const WRAP = /* glsl */ `
  float wrapZ(float z, float uZ){ return mod(z + uZ - 40.0, ${LEN.toFixed(1)}) - ${LEN.toFixed(1)} + 40.0; }`;

const BUILD_VS = /* glsl */ `attribute vec4 aInfo; uniform float uZ, uMirror; ${WRAP}
  varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vSize; varying vec4 vInfo; varying vec3 vC;
  void main(){
    vec3 c = instanceMatrix[3].xyz;
    vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
    // aInfo: x seed, y facade style, z part, w the lot's z (so every part of a tower loops together)
    float dz = wrapZ(aInfo.w, uZ) - aInfo.w;
    vec3 w = c + position * size; w.z += dz;
    vL = position * size + size * 0.5;
    vN = normal; vSize = size; vInfo = aInfo; vC = c + vec3(0.0, 0.0, dz);
    if (uMirror > 0.5) w.y = -w.y;
    vW = w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0); }`;

const COMMON_FS = /* glsl */ `
  float h1(float x){ return fract(sin(x * 127.1) * 43758.5453); }
  float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  vec3 neonCol(float r){ return r < 0.28 ? vec3(1.0, 0.15, 0.6) : r < 0.52 ? vec3(0.1, 0.85, 1.0) : r < 0.7 ? vec3(1.0, 0.6, 0.12) : r < 0.86 ? vec3(1.0, 0.12, 0.18) : vec3(0.65, 0.35, 1.0); }
  float glyph(vec2 uv, float s){
    if (uv.x < 0.12 || uv.x > 0.88 || uv.y < 0.1 || uv.y > 0.9) return 0.0;
    vec2 g = (uv - vec2(0.12, 0.1)) / vec2(0.76, 0.8) * 4.0;
    vec2 cell = floor(g), f = fract(g);
    float hz = step(0.55, h2(cell + s * 13.0)) * step(abs(f.y - 0.5), 0.1);
    float vt = step(0.6, h2(cell + s * 29.0 + 3.1)) * step(abs(f.x - 0.5), 0.1);
    return max(hz, vt);
  }
  vec3 haze(vec3 c, vec3 w){
    float dist = length(w);
    vec3 fogc = vec3(0.11, 0.045, 0.15) + vec3(0.08, 0.02, 0.05) * smoothstep(80.0, 0.0, abs(w.y));
    return mix(c, fogc, 1.0 - exp(-dist * 0.0068));
  }`;

const BUILD_FS = /* glsl */ `uniform float uTime, uFade, uMirror; varying vec3 vW; varying vec3 vN; varying vec3 vL; varying vec3 vSize; varying vec4 vInfo; varying vec3 vC; ${NOISE} ${GRADE} ${COMMON_FS}
  void main(){
    vec3 n = normalize(vN);
    float seed = vInfo.x, style = vInfo.y, part = vInfo.z;
    bool side = abs(n.y) < 0.5;
    float u = abs(n.x) > 0.5 ? vL.z : vL.x;
    float faceW = abs(n.x) > 0.5 ? vSize.z : vSize.x;
    float v = vL.y, top = vSize.y;
    float wy = vW.y;                              // height above the street
    bool street = abs(n.x) > 0.5 && sign(n.x) != sign(vC.x);
    vec3 c = vec3(0.012, 0.012, 0.022) + vec3(0.015, 0.012, 0.03) * (0.5 + 0.5 * n.y);
    float tw = uTime;

    if (part < 0.5) {
      // podium: shopfronts glowing at street level, awnings and signboards, floors of offices above
      float shop = step(v, 4.2) * step(0.6, v);
      float bay = fract(u / 6.0);
      vec3 sc = mix(vec3(1.0, 0.8, 0.55), neonCol(h2(vec2(floor(u / 6.0), seed))), 0.55);
      float mull = step(0.06, bay) * step(bay, 0.94) * step(0.08, fract(u / 1.5));
      float inside = 0.5 + 0.5 * fbm(vec3(u * 0.8, v * 0.8, seed * 7.0));
      c += sc * shop * mull * 0.28 * inside;
      c += neonCol(h2(vec2(floor(u / 6.0), seed + 3.0))) * step(abs(v - 4.6), 0.18) * 1.2;   // awning light line
      vec2 q = vec2(u / 3.0, (v - 5.2) / 3.0);
      if (street && v > 5.2 && v < 8.2 && h2(vec2(floor(q.x), seed)) > 0.35) {
        vec3 nc = neonCol(h2(vec2(floor(q.x), seed + 9.0)));
        c = nc * 0.1 + nc * glyph(fract(q), floor(q.x) + seed * 31.0) * 1.6;
      }
      vec2 wg = vec2(u / 1.5, (v - 9.0) / 2.8), wc = floor(wg), wf = fract(wg);
      c += vec3(0.9, 0.85, 0.7) * step(9.0, v) * step(0.2, wf.x) * step(wf.x, 0.8) * step(0.3, wf.y) * step(wf.y, 0.8) * step(0.55, h2(wc + seed)) * 0.12 * float(side);
    } else if (part > 1.5 && part < 2.5) {
      // sky garden: an open floor of trees, lit warmly from below
      float leaf = fbm(vec3(u * 0.6, v * 0.9, seed * 10.0)) ;
      float canopy = smoothstep(0.42, 0.6, leaf) * smoothstep(top, top * 0.35, v);
      vec3 g = mix(vec3(0.01, 0.05, 0.03), vec3(0.15, 0.55, 0.25), smoothstep(0.5, 0.8, leaf)) * (0.3 + 1.2 * smoothstep(top, 0.0, v));
      c = mix(vec3(0.9, 0.7, 0.4) * 0.25 * smoothstep(top * 0.6, 0.0, v), g, canopy);
      c += vec3(1.0, 0.75, 0.4) * step(v, 0.35) * 0.6;              // the lit terrace edge
      c *= float(side) * 0.9 + 0.1;
    } else if (part > 2.5 && part < 3.5) {
      // penthouse: a glowing glass crown
      vec2 g = vec2(u / 2.0, v / 3.0); vec2 f = fract(g);
      float mull = step(0.06, f.x) * step(0.08, f.y);
      vec3 warm = mix(vec3(1.0, 0.75, 0.45), neonCol(h1(seed * 7.0)), 0.25);
      c = mix(vec3(0.03), warm * (0.35 + 0.25 * h2(floor(g) + seed)), mull) * float(side);
      c += neonCol(h1(seed * 5.0)) * step(top - 0.4, v) * 1.5 * float(side);     // crown light line
      c += vec3(0.05, 0.04, 0.06) * float(!side);
    } else if (part > 3.5) {
      // spire / antenna with a red beacon
      c = vec3(0.04, 0.04, 0.06) + vec3(0.3, 0.32, 0.4) * step(0.5, fract(v / 2.0)) * 0.1;
      c += vec3(1.0, 0.08, 0.08) * step(top - 1.2, v) * (0.4 + 0.6 * step(0.5, fract(tw * 0.7 + seed))) * 2.0;
    } else {
      // the tower: one of several facade styles
      if (!side) { c = vec3(0.02, 0.02, 0.035); if (fract(seed * 13.0) > 0.6) c += neonCol(h1(seed * 3.0)) * 0.6 * step(length(fract(vec2(u, v) / 6.0) - 0.5), 0.06); }
      else if (style < 0.5) {
        vec2 wg = vec2(u / 1.1, v / 2.2), wc = floor(wg), wf = fract(wg);
        float win = step(0.22, wf.x) * step(wf.x, 0.78) * step(0.3, wf.y) * step(wf.y, 0.78);
        vec3 wcol = mix(vec3(1.0, 0.72, 0.42), vec3(0.55, 0.78, 1.0), step(0.6, h2(wc + 7.0 + seed)));
        wcol = mix(wcol, neonCol(h2(wc + 11.0)), step(0.93, h2(wc + 5.0 + seed)));
        c += wcol * win * step(0.66, h2(wc + seed * 50.0)) * 0.12 * (0.4 + 0.6 * h2(wc + 3.0));
      } else if (style < 1.5) {
        // glass curtain wall: dark blue glass, floor lines, the city's glow reflected in streaks
        c = vec3(0.015, 0.03, 0.06) + vec3(0.03, 0.05, 0.09) * fbm(vec3(u * 0.05, v * 0.02, seed));
        c += vec3(0.25, 0.4, 0.6) * step(fract(v / 3.6), 0.04) * 0.25;
        c += neonCol(h1(seed * 9.0)) * pow(0.5 + 0.5 * sin(u * 0.35 + seed * 20.0), 18.0) * 0.18 * smoothstep(top, 0.0, v);
        vec2 wc = floor(vec2(u / 3.0, v / 3.6));
        c += vec3(0.8, 0.9, 1.0) * step(0.88, h2(wc + seed)) * 0.12;
      } else if (style < 2.5) {
        // vertical LED fins with colour flowing up them
        float fin = step(fract(u / 1.6), 0.18);
        vec3 fc = neonCol(h1(seed * 4.0));
        float flow = 0.5 + 0.5 * sin(v * 0.12 - tw * 2.0 + floor(u / 1.6) * 0.7);
        c += fc * fin * (0.25 + 0.9 * pow(flow, 3.0));
        c += vec3(0.9, 0.8, 0.6) * (1.0 - fin) * step(0.7, h2(floor(vec2(u / 1.6, v / 3.0)) + seed)) * 0.08;
      } else if (style < 3.5) {
        // office ribbons: continuous bands of light on every floor
        float band = step(0.35, fract(v / 3.4)) * step(fract(v / 3.4), 0.8);
        float on = step(0.3, h2(vec2(floor(v / 3.4), seed)));
        vec3 bc = mix(vec3(0.55, 0.8, 1.0), vec3(1.0, 0.7, 0.45), h1(seed * 2.0));
        float room = step(0.35, h2(vec2(floor(u / 4.0), floor(v / 3.4) + seed)));
        c += bc * band * on * room * 0.1 * (0.6 + 0.4 * h2(vec2(floor(u / 4.0), seed)));
        c += neonCol(h1(seed * 6.0)) * step(abs(fract(v / 34.0) - 0.5), 0.015) * 0.8;   // accent band
      } else if (style < 4.5) {
        // diagrid lattice: glowing diagonal bracing over the glass
        vec2 q = vec2(u, v) / 9.0;
        float d1 = abs(fract(q.x + q.y) - 0.5), d2 = abs(fract(q.x - q.y) - 0.5);
        float lat = step(min(d1, d2), 0.012);
        c += neonCol(h1(seed * 8.0)) * lat * 0.5;
        vec2 wc = floor(vec2(u / 1.5, v / 2.8)), wf = fract(vec2(u / 1.5, v / 2.8));
        c += vec3(1.0, 0.85, 0.65) * step(0.2, wf.x) * step(wf.x, 0.8) * step(0.3, wf.y) * step(wf.y, 0.8) * step(0.7, h2(wc + seed)) * 0.12;
      } else {
        // media facade: the whole face is a slowly animating colour mosaic
        vec2 px = floor(vec2(u, v) / 1.2);
        float m = sin(px.x * 0.25 + tw * 0.8 + seed * 10.0) + sin(px.y * 0.18 - tw * 0.6) + sin((px.x + px.y) * 0.12 + tw * 0.4);
        vec3 mc = 0.5 + 0.5 * cos(6.2831 * (m * 0.15 + vec3(0.0, 0.33, 0.67) + seed));
        vec2 f = fract(vec2(u, v) / 1.2);
        c += mc * step(0.1, f.x) * step(0.1, f.y) * 0.35 * (0.6 + 0.4 * h2(px + floor(tw * 2.0)));
      }
      // tall vertical neon signs on the street faces of some towers
      if (street && style != 1.0) {
        float sw = 3.0 + h1(seed + 1.0) * 2.0, sx = 1.0 + h1(seed * 3.0) * max(0.0, faceW - sw - 2.0);
        float sy0 = 2.0 + h1(seed * 7.0) * 18.0, sh = sw * (3.0 + floor(h1(seed * 11.0) * 6.0));
        vec2 q = vec2((u - sx) / sw, (v - sy0) / sw);
        float has = step(0.3, h1(seed * 5.0));
        vec2 dq = max(vec2(0.0), max(-q, q - vec2(1.0, sh / sw))) * sw;
        vec3 nc = neonCol(h1(seed * 17.0));
        c += nc * exp(-length(dq) * 0.9) * 0.15 * step(0.001, length(dq)) * has;
        if (has > 0.5 && q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < sh / sw) {
          float g = glyph(vec2(q.x, fract(q.y)), seed * 9.0 + floor(q.y));
          float edge = 1.0 - step(0.05, q.x) * step(q.x, 0.95) * step(0.03, q.y) * step(q.y, sh / sw - 0.03);
          float flick = 1.0 - step(0.985, h2(vec2(floor(tw * 8.0), seed))) * 0.8;
          c = nc * 0.1 + nc * (g * 2.0 + edge * 1.3) * flick;
        }
      }
      // a light line where the tower meets the sky
      c += neonCol(h1(seed * 21.0)) * step(top - 0.5, v) * step(0.5, h1(seed * 23.0)) * float(side) * 1.2;
    }
    c = haze(c, vW);
    if (uMirror > 0.5) c *= 0.6;
    gl_FragColor = vec4(grade(c), uFade); }`;

// giant animated billboards hung on the towers
const BOARD_VS = /* glsl */ `attribute vec4 aInfo; uniform float uZ, uMirror; ${WRAP}
  varying vec2 vUv; varying vec4 vInfo; varying vec3 vW;
  void main(){ vUv = uv; vInfo = aInfo;
    vec4 w = instanceMatrix * vec4(position, 1.0);
    w.z += wrapZ(aInfo.w, uZ) - aInfo.w;
    if (uMirror > 0.5) w.y = -w.y;
    vW = w.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * w; }`;
const BOARD_FS = /* glsl */ `uniform float uTime, uFade, uMirror; varying vec2 vUv; varying vec4 vInfo; varying vec3 vW; ${NOISE} ${GRADE} ${COMMON_FS}
  void main(){ vec2 uv = vUv; float s = vInfo.x, kind = vInfo.y, t = uTime;
    vec3 c;
    float scene = floor(t / 6.0 + s * 5.0);          // each board changes its advert every few seconds
    float k = mod(kind + scene, 8.0);
    vec3 a = neonCol(h1(s + scene)), b = neonCol(h1(s * 3.0 + scene + 0.5));
    if (k < 1.0) {
      // flowing colour waves with a big glyph
      float w = sin(uv.x * 6.0 + t * 1.5) * 0.5 + sin(uv.y * 4.0 - t) * 0.5;
      c = mix(a, b, 0.5 + 0.5 * w) * 0.5;
      vec2 q = (uv - vec2(0.3, 0.5)) * vec2(2.2, 1.6) + 0.5;
      c += vec3(1.0) * glyph(q, s * 7.0 + scene) * 1.2;
    } else if (k < 2.0) {
      // columns of glyphs scrolling down
      vec2 g = vec2(uv.x * 7.0, uv.y * 5.0 + t * (1.0 + h1(floor(uv.x * 7.0) + s) * 2.0));
      c = a * 0.08 + mix(a, vec3(1.0), 0.3) * glyph(fract(g), floor(g.x) * 3.0 + floor(g.y) + s) * 1.3;
    } else if (k < 3.0) {
      // a pulsing logo ring on a gradient
      vec2 p = (uv - 0.5) * vec2(1.6, 1.0);
      float r = length(p);
      c = mix(a * 0.15, b * 0.5, uv.y);
      c += mix(vec3(1.0), b, 0.3) * smoothstep(0.03, 0.0, abs(r - 0.28 - 0.03 * sin(t * 3.0))) * 1.5;
      c += a * smoothstep(0.2, 0.0, r) * (0.6 + 0.4 * sin(t * 2.0));
    } else if (k > 3.5 && k < 4.5) {
      // manga panel: speed lines bursting from a big character, clean ink on bright tone
      vec2 p = (uv - 0.5) * vec2(1.6, 1.0);
      float ang = atan(p.y, p.x), r = length(p);
      float lines = step(0.6, fract(ang * 18.0 / 6.2831 + h1(floor(ang * 18.0 / 6.2831) + s) * 0.5)) * smoothstep(0.12, 0.5, r);
      c = mix(vec3(1.0, 0.97, 0.9), a * 0.9, 0.25) * (1.0 - lines * 0.85);
      vec2 q = (uv - vec2(0.5, 0.5)) * vec2(2.6, 1.6) + 0.5;
      c = mix(c, vec3(0.05), glyph(q, s * 11.0 + scene));
      c *= 0.75;
    } else if (k > 4.5 && k < 5.5) {
      // an original chibi mascot: a round cat face that blinks and smiles
      vec2 p = (uv - 0.5) * vec2(1.6, 1.0);
      c = mix(b * 0.35, a * 0.55, uv.y);
      float face = smoothstep(0.31, 0.3, length(p * vec2(1.0, 1.15)));
      float earL = step(0.0, p.y - 0.12) * step(abs(p.x + 0.18) * 1.6, 0.42 - p.y);
      float earR = step(0.0, p.y - 0.12) * step(abs(p.x - 0.18) * 1.6, 0.42 - p.y);
      vec3 fur = vec3(1.0, 0.96, 0.92);
      c = mix(c, fur, max(face, max(earL, earR) * step(p.y, 0.4)));
      float blink = step(0.06, fract(t * 0.3 + s));
      float eye = smoothstep(0.045, 0.04, length((vec2(abs(p.x), p.y) - vec2(0.11, 0.03)) * vec2(1.0, mix(6.0, 1.0, blink))));
      c = mix(c, vec3(0.08, 0.05, 0.1), eye * face);
      c = mix(c, vec3(1.0), smoothstep(0.015, 0.01, length(vec2(abs(p.x), p.y) - vec2(0.125, 0.05))) * face * blink);
      float mouth = smoothstep(0.012, 0.0, abs(length(vec2(abs(p.x) - 0.035, p.y + 0.06)) - 0.035)) * step(p.y, -0.06);
      c = mix(c, vec3(0.15, 0.05, 0.08), mouth * face);
      c += vec3(1.0, 0.45, 0.6) * smoothstep(0.05, 0.0, length(vec2(abs(p.x), p.y) - vec2(0.19, -0.05))) * 0.5 * face;   // blush
    } else if (k > 5.5 && k < 6.5) {
      // big sparkling anime eyes, glancing about
      vec2 p = (uv - 0.5) * vec2(1.6, 1.0);
      c = mix(vec3(0.98, 0.93, 0.9), a * 0.4, 0.2);
      vec2 look = vec2(sin(t * 0.7 + s * 9.0), cos(t * 0.5)) * 0.03;
      for (int e = 0; e < 2; e++) {
        vec2 ce = vec2(e == 0 ? -0.28 : 0.28, 0.0);
        vec2 d = (p - ce) * vec2(1.0, 0.8);
        float white = smoothstep(0.2, 0.19, length(d));
        float iris = smoothstep(0.13, 0.12, length(d - look));
        float pupil = smoothstep(0.06, 0.05, length(d - look));
        vec3 ic = mix(b * 0.4, a, smoothstep(-0.13, 0.13, (d - look).y));
        c = mix(c, vec3(1.0), white);
        c = mix(c, ic, iris);
        c = mix(c, vec3(0.03), pupil);
        c = mix(c, vec3(1.0), smoothstep(0.03, 0.02, length(d - look - vec2(0.04, 0.05))) + smoothstep(0.015, 0.01, length(d - look + vec2(0.05, 0.04))));
        c = mix(c, vec3(0.05), smoothstep(0.012, 0.0, abs(d.y - 0.19 + 0.6 * d.x * d.x)) * step(abs(d.x), 0.22));   // lash line
      }
      c *= 0.8;
    } else if (k > 6.5) {
      // sakura petals drifting over a twilight gradient with a big glyph
      c = mix(vec3(0.12, 0.05, 0.2), vec3(1.0, 0.55, 0.7), uv.y * 0.8);
      for (int j = 0; j < 12; j++) {
        float fj = float(j);
        vec2 pc = vec2(fract(h1(fj + s) + t * 0.05 * (0.5 + h1(fj * 3.0))), fract(h1(fj * 7.0 + s) - t * 0.08 * (0.5 + h1(fj))));
        vec2 d = (uv - pc) * vec2(1.6, 1.0);
        float an = t + fj;
        d = mat2(cos(an), -sin(an), sin(an), cos(an)) * d;
        c = mix(c, vec3(1.0, 0.8, 0.88), smoothstep(0.022, 0.016, length(d * vec2(1.0, 1.8))));
      }
      c = mix(c, vec3(1.0), glyph((uv - vec2(0.15, 0.5)) * vec2(2.2, 1.4) + 0.5, s * 5.0 + scene) * 0.9);
    } else {
      // an abstract product shot: a glowing shape turning, light sweeping across
      vec2 p = (uv - 0.5) * vec2(1.6, 1.0);
      float ang = t * 0.8;
      vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * p;
      float shape = smoothstep(0.02, 0.0, max(abs(q.x), abs(q.y)) - 0.18);
      c = mix(vec3(0.02, 0.02, 0.05), a * 0.2, uv.y) + b * shape * 1.2;
      c += vec3(1.0) * smoothstep(0.03, 0.0, abs(uv.x - fract(t * 0.3))) * 0.4;
    }
    // the screen's frame and scanlines
    float frame = step(0.02, uv.x) * step(uv.x, 0.98) * step(0.03, uv.y) * step(uv.y, 0.97);
    c = mix(vec3(0.05), c * (0.9 + 0.1 * sin(uv.y * 400.0)), frame);
    c = haze(c * 1.6, vW);
    if (uMirror > 0.5) c *= 0.6;
    gl_FragColor = vec4(grade(c), uFade); }`;

function buildCity() {
  const parts = [], boards = [];
  for (const side of [-1, 1]) {
    for (const [row, x0, hMin, hMax] of [[0, STREET, 30, 150], [1, STREET + 34, 70, 230]]) {
      let z = 0;
      while (z < LEN) {
        const w = 12 + Math.random() * 18, d = 16 + Math.random() * 12;
        const zc = -z - w / 2;
        const set = Math.random() * (row ? 8 : 2);
        const xc = side * (x0 + set + d / 2);
        const seed = Math.random();
        const style = Math.floor(Math.random() * 6);
        const H = hMin + Math.pow(Math.random(), 1.8) * (hMax - hMin);
        const info = (part, s = seed) => [s, style, part, zc];
        // podium
        const pod = row ? 0 : 9 + Math.random() * 8;
        if (pod) parts.push({ p: [xc, pod / 2, zc], s: [d, pod, w], i: info(PART.podium) });
        // the tower, maybe with a sky garden part way up and a stepped-back upper tier
        const tw = w * (0.75 + Math.random() * 0.2), td = d * (0.75 + Math.random() * 0.2);
        const tx = xc - side * (d - td) / 2 * (row ? 0 : 1);   // flush with the street face
        let y = pod;
        const garden = Math.random() < 0.35 && H > 60;
        const step = Math.random() < 0.55 && H > 50;
        const yStep = step ? y + (H - y) * (0.55 + Math.random() * 0.2) : H;
        const yGarden = garden ? y + (yStep - y) * (0.45 + Math.random() * 0.25) : -1;
        if (garden) {
          parts.push({ p: [tx, (y + yGarden) / 2, zc], s: [td, yGarden - y, tw], i: info(PART.tower) });
          parts.push({ p: [tx, yGarden + 3, zc], s: [td * 0.92, 6, tw * 0.92], i: info(PART.garden) });
          y = yGarden + 6;
        }
        parts.push({ p: [tx, (y + yStep) / 2, zc], s: [td, yStep - y, tw], i: info(PART.tower) });
        y = yStep;
        let topW = tw, topD = td;
        if (step) {
          topW = tw * (0.6 + Math.random() * 0.2); topD = td * (0.6 + Math.random() * 0.2);
          parts.push({ p: [tx, (y + H) / 2, zc], s: [topD, H - y, topW], i: info(PART.tower, seed + 0.37) });
          y = H;
        }
        if (Math.random() < 0.5) {
          const ph = 4 + Math.random() * 5;
          parts.push({ p: [tx, y + ph / 2, zc], s: [topD * 0.7, ph, topW * 0.7], i: info(PART.penthouse) });
          y += ph;
        }
        if (Math.random() < 0.35) {
          const sh = 8 + Math.random() * 22;
          parts.push({ p: [tx, y + sh / 2, zc], s: [0.6, sh, 0.6], i: info(PART.spire) });
        }
        // a giant billboard over the street on some front-row towers
        if (!row && Math.random() < 0.55) {
          const out = Math.random() < 0.5;   // hung out over the street, facing you
          const bw = out ? 7 + Math.random() * 5 : Math.min(w * 0.9, 13 + Math.random() * 10), bh = bw * (out ? 0.6 + Math.random() * 0.5 : 0.5 + Math.random() * 0.25);
          const by = pod + 4 + Math.random() * Math.max(4, Math.min(H, 75) - pod - bh - 8);
          const bx = out ? side * (x0 + set - bw / 2 - 0.5) : side * (x0 + set) - side * 0.6;
          boards.push({ p: [bx, by + bh / 2, zc + (out ? w / 2 - 1 : 0)], w: bw, h: bh, side, out, i: [Math.random(), Math.floor(Math.random() * 8), 0, zc] });
        }
        z += w + (row ? 5 + Math.random() * 6 : 3 + Math.random() * 7);   // alleys and gaps between towers
      }
    }
  }
  return { parts, boards };
}

export class NeonCityScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uZ: { value: 0 }, uMirror: { value: 0 } });
    this.world = new THREE.Group();
    this.world.position.y = -(FLY - 1.6);
    this.group.add(this.world);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 20), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = mix(vec3(0.13, 0.05, 0.16), vec3(0.01, 0.01, 0.03), smoothstep(-0.05, 0.5, d.y));
          c += vec3(0.05, 0.02, 0.06) * fbm(vec3(d.xz / (d.y + 0.2) * 2.0, uTime * 0.02)) * smoothstep(0.0, 0.3, d.y);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.world.add(sky);

    const { parts, boards } = buildCity();
    const box = new THREE.BoxGeometry(1, 1, 1);
    box.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(parts.flatMap((p) => p.i)), 4));
    const plane = new THREE.PlaneGeometry(1, 1);
    plane.setAttribute('aInfo', new THREE.InstancedBufferAttribute(new Float32Array(boards.flatMap((b) => b.i)), 4));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
    const mk = (mirror) => {
      const towers = new THREE.InstancedMesh(box, new THREE.ShaderMaterial({ uniforms: { ...U, uMirror: { value: mirror } }, vertexShader: BUILD_VS, fragmentShader: BUILD_FS, transparent: true, side: mirror ? THREE.BackSide : THREE.FrontSide }), parts.length);
      parts.forEach((p, i) => { M.makeScale(...p.s); M.setPosition(...p.p); towers.setMatrixAt(i, M); });
      const screens = new THREE.InstancedMesh(plane, new THREE.ShaderMaterial({ uniforms: { ...U, uMirror: { value: mirror } }, vertexShader: BOARD_VS, fragmentShader: BOARD_FS, transparent: true, side: THREE.DoubleSide }), Math.max(1, boards.length));
      boards.forEach((b, i) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.out ? 0 : -b.side * Math.PI / 2); M.compose(P.set(...b.p), Q, S.set(b.w, b.h, 1)); screens.setMatrixAt(i, M); });
      for (const m of [towers, screens]) { m.frustumCulled = false; m.renderOrder = mirror ? -8 : -4; }
      return [towers, screens];
    };
    this.world.add(...mk(1), ...mk(0));

    // the wet street, mirroring the city through its sheen
    const street = new THREE.Mesh(new THREE.PlaneGeometry(400, 700).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uZ, uTime; varying vec3 vW; ${NOISE} ${GRADE} ${COMMON_FS}
        void main(){ vec2 p = vec2(vW.x, vW.z - uZ);
          float puddle = smoothstep(0.45, 0.6, fbm(vec3(p * 0.08, 1.0)));
          float lane = step(abs(abs(vW.x) - 4.6), 0.08) * step(0.5, fract(p.y / 6.0)) + step(abs(vW.x), 0.1) * 0.6;
          float zebra = step(abs(fract(p.y / 120.0) - 0.5), 0.03) * step(0.5, fract(vW.x / 1.2)) * step(abs(vW.x), ${STREET.toFixed(1)});
          vec3 c = vec3(0.01, 0.01, 0.015) + vec3(0.6, 0.6, 0.55) * (lane + zebra) * 0.12;
          float a = mix(0.6, 0.15, puddle);
          c = haze(c, vW);
          gl_FragColor = vec4(grade(c), a * uFade); }`,
    }));
    street.renderOrder = -6;
    this.world.add(street);

    // flying traffic: lanes of headlights coming toward you and tail lights ahead
    this.traffic = [
      particles(U, { count: 120, min: [-9, 18, -260], max: [-3, 34, 10], vel: [0, 0, 55], sway: 0, size: [0.12, 0.2], colors: ['#ffffff', '#fff3d0'], alpha: 0.9 }),
      particles(U, { count: 120, min: [3, 22, -260], max: [9, 40, 10], vel: [0, 0, 14], sway: 0, size: [0.12, 0.2], colors: ['#ff2a2a', '#ff5a3a'], alpha: 0.9 }),
    ];
    for (const t of this.traffic) this.world.add(t);
    // rain streaking past
    this.rain = particles(U, { count: 900, min: [-14, -10, -40], max: [14, 14, 4], vel: [0, -16, 8], sway: 0.02, size: [0.01, 0.02], colors: ['#cfd8ff', '#ffffff', '#ffc8f0'], alpha: 0.45 });
    this.group.add(this.rain);

    this.speed = 26; this.target = 26; this.next = 8;
  }
  update(dt, t) {
    const U = this.uniforms;
    this.next -= dt;
    if (this.next <= 0) {
      // sometimes glide to a stop and hover, gazing at the city; otherwise speed up or ease off
      if (this.target > 0 && Math.random() < 0.25) { this.target = 0; this.next = 5 + Math.random() * 5; }
      else { this.target = [8, 16, 26, 38, 50][Math.floor(Math.random() * 5)]; this.next = 7 + Math.random() * 8; }
    }
    this.speed = damp(this.speed, this.target, this.target === 0 ? 0.5 : 0.3, dt);
    U.uZ.value += dt * this.speed;
    // a gentle weave down the street, rising and dipping a little
    this.world.position.x = Math.sin(t * 0.11) * 2.0;
    this.world.position.y = -(FLY - 1.6) - Math.sin(t * 0.07) * 4;
    this.rain.userData.u.uBoost.value = this.speed * 0.02;
  }
}
