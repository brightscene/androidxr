import * as THREE from 'three';
import { U, POINT_SIZE } from './common.js';

// Light layer for decoded AudioStrobe / SpectraStrobe tracks.
//
// In a headset each eye gets its own light, like mind-machine glasses: the
// left-eye overlay sits on layer 1 (rendered only by the left eye camera) and
// the right-eye overlay on layer 2. On a flat screen both are shown side by side.
//
// Each overlay draws a glowing sacred symbol and/or a soft full-field glow,
// coloured and pulsed by the decoded brightness of that eye.

export const SYMBOLS = ['Flower of Life', 'Sri Yantra', 'Lotus', 'Merkaba', 'Ripples', 'Seed of Life'];

const FRAG = /* glsl */ `
  uniform vec3 uCol; uniform float uBright, uStyle, uGlow, uSym, uSymB, uMix, uTime, uMax;
  varying vec2 vUv;
  #define PI 3.14159265
  float ring(vec2 p, vec2 c, float r){ return abs(length(p - c) - r); }
  float sdTri(vec2 p, float r, float flip){
    p.y *= flip;
    const float k = sqrt(3.0);
    p.x = abs(p.x) - r; p.y = p.y + r / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -2.0 * r, 0.0);
    return abs(-length(p) * sign(p.y));
  }
  float flower(vec2 p, int rings){
    float r = 0.14; float d = ring(p, vec2(0.0), r);
    for (int i = 0; i < 6; i++){
      float a = float(i) * PI / 3.0;
      d = min(d, ring(p, r * vec2(cos(a), sin(a)), r));
      if (rings > 1) {
        d = min(d, ring(p, 2.0 * r * vec2(cos(a), sin(a)), r));
        float a2 = a + PI / 6.0;
        d = min(d, ring(p, r * sqrt(3.0) * vec2(cos(a2), sin(a2)), r));
      }
    }
    return min(d, ring(p, vec2(0.0), r * (rings > 1 ? 3.0 : 2.0)));
  }
  float symbol(vec2 p, float s){
    if (s < 0.5) return flower(p, 2);
    if (s < 1.5) { // sri-yantra-like interlocking triangles
      float d = ring(p, vec2(0.0), 0.42);
      d = min(d, ring(p, vec2(0.0), 0.46));
      d = min(d, sdTri(p - vec2(0.0, 0.02), 0.32, 1.0));
      d = min(d, sdTri(p + vec2(0.0, 0.02), 0.32, -1.0));
      d = min(d, sdTri(p - vec2(0.0, 0.05), 0.2, 1.0));
      d = min(d, sdTri(p + vec2(0.0, 0.05), 0.2, -1.0));
      d = min(d, sdTri(p, 0.1, 1.0));
      return min(d, length(p) - 0.012);
    }
    if (s < 2.5) { // lotus
      float a = atan(p.y, p.x), r = length(p);
      float d = abs(r - (0.28 + 0.09 * abs(cos(4.0 * a))));
      d = min(d, abs(r - (0.38 + 0.07 * abs(cos(4.0 * a + PI / 4.0)))));
      return min(d, ring(p, vec2(0.0), 0.12));
    }
    if (s < 3.5) { // merkaba (hexagram in circles)
      float d = min(sdTri(p, 0.3, 1.0), sdTri(p, 0.3, -1.0));
      d = min(d, ring(p, vec2(0.0), 0.36));
      return min(d, ring(p, vec2(0.0), 0.17));
    }
    if (s < 4.5) { // ripples
      float r = length(p);
      return abs(fract(r * 6.0 - uTime * 0.3) - 0.5) / 6.0 + smoothstep(0.42, 0.5, r) * 0.2;
    }
    return flower(p, 1);
  }
  void main(){
    vec2 p = (vUv - 0.5) * 2.6;
    float b = clamp(uBright, 0.0, 1.0) * uMax;
    float r = length(p);
    float field = (exp(-r * r * 1.6) * 0.75 + 0.18) * smoothstep(1.3, 0.55, r);
    float da = symbol(p, uSym), db = symbol(p, uSymB);
    float line = mix(exp(-da * 90.0) + 0.35 * exp(-da * 18.0), exp(-db * 90.0) + 0.35 * exp(-db * 18.0), uMix);
    line *= smoothstep(0.58, 0.48, length(p));
    // saturated colour glow, with a slightly hotter core on the symbol lines so it reads crisply
    float core = mix(exp(-da * 260.0), exp(-db * 260.0), uMix);
    // uStyle: the symbol's kind (0 sacred symbol, 1 glowing orb, 2 neon ring, 3 none: a solid shape is drawn instead)
    // uGlow: a soft coloured glow behind it (0 none, 1 glow)
    vec3 col = vec3(0.0);
    if (uStyle < 0.5) col = uCol * line * 1.5 + mix(uCol, vec3(1.0), 0.45) * core * 0.9;
    else if (uStyle < 1.5) { // glowing orb: solid filled disc, white-hot core, corona
      float disc = smoothstep(0.37, 0.34, r);
      col = uCol * (disc * 1.25 + exp(-r * 3.2) * 0.7) + vec3(1.0) * exp(-r * r * 28.0) * 0.75 * disc;
    } else if (uStyle < 2.5) { // neon ring: thick solid ring with a hot centre line
      float dr = abs(r - 0.3);
      col = uCol * (smoothstep(0.06, 0.04, dr) * 1.3 + exp(-dr * 10.0) * 0.55) + vec3(1.0) * smoothstep(0.018, 0.0, dr) * 0.6;
    }
    // the glow: a soft field, plus a halo hugging the symbol itself
    float halo = exp(-r * r * 5.0) * smoothstep(0.75, 0.4, r);
    col += uCol * uGlow * (field * (uStyle > 2.5 ? 0.9 : 0.75) + halo * (uStyle > 2.5 ? 0.3 : 0.6));
    gl_FragColor = vec4(col * b, 1.0);
  }`;

// Silver chrome ball: a mirrored sphere reflecting a soft studio environment,
// flooded with the channel's colour as it flashes.
const CHROME_FRAG = /* glsl */ `
  uniform vec3 uCol; uniform float uB, uMax; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 n = normalize(vN);
    vec3 r = reflect(vV, n);
    float sky = smoothstep(-0.35, 0.7, r.y);
    float band = exp(-pow((r.y - 0.28) * 7.0, 2.0)) * 0.9 + exp(-pow((r.y + 0.15) * 10.0, 2.0)) * 0.35;
    float key = pow(max(0.0, dot(r, normalize(vec3(-0.5, 0.6, 0.6)))), 60.0) * 2.0;
    vec3 env = vec3(0.12) + vec3(0.75) * sky * 0.6 + vec3(1.0) * band + vec3(1.0) * key;
    float fres = pow(1.0 - max(0.0, dot(-vV, n)), 2.5);
    float b = clamp(uB, 0.0, 1.0) * uMax;
    vec3 col = env * mix(vec3(0.85), uCol * 1.2 + 0.25, b) + uCol * b * (0.9 + fres * 1.5);
    gl_FragColor = vec4(col, 1.0);
  }`;

// Faceted crystal: flat facets lit from inside by the channel's colour.
const CRYSTAL_FRAG = /* glsl */ `
  uniform vec3 uCol; uniform float uB, uMax; varying vec3 vN; varying vec3 vV;
  void main(){
    vec3 n = normalize(vN);
    float facet = 0.45 + 0.55 * abs(dot(n, normalize(vec3(0.3, 0.8, 0.5))));
    float spec = pow(max(0.0, dot(reflect(vV, n), normalize(vec3(-0.4, 0.7, 0.6)))), 30.0);
    float rim = pow(1.0 - abs(dot(-vV, n)), 2.0);
    float b = clamp(uB, 0.0, 1.0) * uMax;
    vec3 col = uCol * (0.12 + b * 1.6) * facet + mix(uCol, vec3(1.0), 0.6) * (spec * (0.4 + b) + rim * b * 0.8);
    gl_FragColor = vec4(col, 1.0);
  }`;

const DIST = 2.6; // metres in front of you
const SEP = 0.9; // half the distance between the left and right symbol centres

export class StrobeLayer {
  constructor(camera) {
    this.camera = camera;
    this.layout = 'sides';
    this.meshes = [0, 1].map((side) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(3.4, 3.4),
        new THREE.ShaderMaterial({
          transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
          uniforms: {
            uCol: { value: new THREE.Color(1, 1, 1) }, uBright: { value: 0 }, uStyle: { value: 0 }, uGlow: { value: 1 },
            uSym: { value: 0 }, uSymB: { value: 0 }, uMix: { value: 0 }, uTime: { value: 0 }, uMax: { value: 0.6 },
          },
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
          fragmentShader: FRAG,
        })
      );
      m.renderOrder = 950;
      m.frustumCulled = false;
      m.visible = false;
      camera.add(m);
      return m;
    });

    // Dims the scene behind the lights (darker still right behind each symbol) so colours stand out.
    this.dim = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false,
        uniforms: { uDim: { value: 0 }, uSep: { value: SEP / 14 }, uSides: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uDim, uSep, uSides; varying vec2 vUv;
          void main(){
            vec2 p = vUv - 0.5;
            float halo = uSides > 0.5
              ? max(exp(-dot(p - vec2(-uSep, 0.0), p - vec2(-uSep, 0.0)) * 900.0), exp(-dot(p - vec2(uSep, 0.0), p - vec2(uSep, 0.0)) * 900.0))
              : exp(-dot(p, p) * 500.0);
            gl_FragColor = vec4(0.0, 0.0, 0.01, uDim * (0.75 + 0.25 * halo));
          }`,
      })
    );
    this.dim.position.z = -DIST - 0.2;
    this.dim.renderOrder = 940;
    this.dim.frustumCulled = false;
    this.dim.visible = false;
    camera.add(this.dim);
    this.dimLevel = 0;

    // Solid 3D lights: a chrome ball and a faceted crystal per channel
    const crystalGeo = new THREE.OctahedronGeometry(0.34, 0).toNonIndexed();
    crystalGeo.scale(1, 1.45, 1);
    crystalGeo.computeVertexNormals();
    this.solids = {
      chrome: [0, 1].map(() => this._solid(new THREE.SphereGeometry(0.34, 64, 48), CHROME_FRAG)),
      crystal: [0, 1].map(() => this._solid(crystalGeo, CRYSTAL_FRAG)),
    };

    // WIDE: a broad, soft band of light filling each side, joining its partner in the middle (behind the symbol)
    this.wash = [0, 1].map(() => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
        transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uCol: { value: new THREE.Color() }, uB: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uCol; uniform float uB; varying vec2 vUv; void main(){
          vec2 q = vUv - 0.5;
          float band = exp(-pow(q.y * 3.2, 2.0)) * smoothstep(0.5, 0.3, abs(q.y)) * smoothstep(0.5, 0.36, abs(q.x));
          vec3 col = uCol * band * 1.1 + mix(uCol, vec3(1.0), 0.4) * exp(-pow(q.y * 7.0, 2.0)) * smoothstep(0.5, 0.3, abs(q.x)) * 0.4;
          gl_FragColor = vec4(col * uB, 1.0); }`,
      }));
      m.renderOrder = 949;
      m.frustumCulled = false;
      m.visible = false;
      camera.add(m);
      return m;
    });

    camera.layers.enable(1);
    camera.layers.enable(2);
    this.symbol = 0;
    this.symbolTimer = 0;
    this.auto = true;
  }

  _solid(geo, frag) {
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { uCol: { value: new THREE.Color() }, uB: { value: 0 }, uMax: { value: 0.6 }, uTime: U.uTime },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(mv.xyz); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: frag,
    }));
    m.renderOrder = 952;
    m.frustumCulled = false;
    m.visible = false;
    this.camera.add(m);
    return m;
  }

  // Layer 1/2 are seen only by the left/right eye in a headset.
  // ---- light frames: four fields of light, the inner and outer half of each eye's view
  // (as in light-machine glasses with two LEDs per eye). q = [left outer, left inner,
  // right inner, right outer] brightness 0..1; colL / colR are each eye's colour.
  _buildFrames() {
    const mat = (mode) => new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uQ: { value: new THREE.Vector4() }, uColL: { value: new THREE.Color() }, uColR: { value: new THREE.Color() }, uMax: { value: 0.6 }, uMode: { value: mode } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform vec4 uQ; uniform vec3 uColL, uColR; uniform float uMax, uMode; varying vec2 vUv;
        void main(){
          float x = vUv.x, v = smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
          vec3 c;
          if (uMode < 0.5) {            // the left eye's view: outer half on the left, inner on the right
            float b = mix(uQ.x, uQ.y, smoothstep(0.42, 0.58, x));
            c = uColL * b * smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
          } else if (uMode < 1.5) {     // the right eye's view: inner on the left, outer on the right
            float b = mix(uQ.z, uQ.w, smoothstep(0.42, 0.58, x));
            c = uColR * b * smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
          } else {                      // on a screen: four soft bands across the view
            float k = x * 4.0;
            float b0 = uQ.x * (1.0 - smoothstep(0.75, 1.25, k));
            float b1 = uQ.y * smoothstep(0.75, 1.25, k) * (1.0 - smoothstep(1.75, 2.25, k));
            float b2 = uQ.z * smoothstep(1.75, 2.25, k) * (1.0 - smoothstep(2.75, 3.25, k));
            float b3 = uQ.w * smoothstep(2.75, 3.25, k);
            c = uColL * (b0 + b1) + uColR * (b2 + b3);
          }
          gl_FragColor = vec4(c * v * uMax * 1.6, 1.0);
        }`,
    });
    this.frames = [0, 1, 2].map((mode) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(mode < 2 ? 3.2 : 4.4, 3.2), mat(mode));
      m.position.z = -1.2;
      m.renderOrder = 952;
      m.frustumCulled = false;
      m.visible = false;
      m.layers.set(mode < 2 ? mode + 1 : 0);
      this.camera.add(m);
      return m;
    });
  }

  updateFrames(q, colL, colR, max) {
    if (!this.frames) this._buildFrames();
    const show = !!q;
    this.frames.forEach((m, mode) => {
      m.visible = show && (mode < 2 ? !!this.xr : !this.xr);
      if (!m.visible) return;
      if (mode < 2) m.position.x = (mode ? 1 : -1) * (this.ipd || 0.063) / 2;   // centred on each eye
      const u = m.material.uniforms;
      u.uQ.value.set(q[0], q[1], q[2], q[3]);
      u.uColL.value.copy(colL); u.uColR.value.copy(colR);
      u.uMax.value = max;
    });
  }

  setXR(on) {
    if (on) { this.camera.layers.disable(1); this.camera.layers.disable(2); }
    else { this.camera.layers.enable(1); this.camera.layers.enable(2); }
    this.xr = on;
  }

  // 0..5 the sacred symbols; 6 glowing orb, 7 chrome ball, 8 neon ring, 9 crystal
  setSymbol(i) { if (i >= 0 && i < SYMBOLS.length && i !== this.symbol) this._go(i); }

  _go(i) {
    for (const m of this.meshes) {
      const u = m.material.uniforms;
      u.uSymB.value = i;
      u.uMix.value = 0.0001;
    }
    this.symbol = i;
  }

  // rgbL/rgbR: [r,g,b] 0..1 brightness per eye channel (null hides the layer)
  // opts: { style, max, layout: 'sides' | 'eyes', dim: 0..1 }
  update(dt, t, rgbL, rgbR, opts) {
    const show = !!(rgbL && rgbR);
    // "eyes" (one symbol per eye, fused into one in the centre) only means something in a headset
    const perEye = this.xr && (opts.layout === 'eyes' || opts.layout === 'eyesc');
    const centred = this.xr && opts.layout === 'eyesc';   // each eye's light straight ahead of that eye: they fuse into one
    const eyeX = (side) => (side ? 1 : -1) * (this.ipd || 0.063) / 2;   // each eye's own centre
    const sym = opts.symbol ?? 0;
    const glow = opts.style === 'field' ? 1 : 0;
    const wide = opts.style === 'wide';
    const shape = sym < SYMBOLS.length ? 0 : { 6: 1, 8: 2 }[sym] ?? 3;
    this.wash.forEach((m, side) => {
      m.visible = show && wide;
      if (!m.visible) return;
      const rgb = side ? rgbR : rgbL;
      const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
      m.material.uniforms.uB.value = peak * opts.max;
      m.material.uniforms.uCol.value.setRGB(rgb[0] / peak, rgb[1] / peak, rgb[2] / peak);
      m.layers.set(perEye ? side + 1 : 0);
      const W = SEP * 2 + 0.6;
      m.position.set((side ? 1 : -1) * W / 2 * 0.92 + (centred ? eyeX(side) : 0), 0, -DIST - 0.01);
      m.scale.set(W * 0.96, 3.4 * 0.92, 1);
    });
    const solidKind = { 7: 'chrome', 9: 'crystal' }[sym] || null;
    for (const [kind, pair] of Object.entries(this.solids)) pair.forEach((m, side) => {
      m.visible = show && kind === solidKind;
      if (!m.visible) return;
      const rgb = side ? rgbR : rgbL;
      const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
      const u = m.material.uniforms;
      u.uB.value = peak;
      u.uCol.value.setRGB(rgb[0] / peak, rgb[1] / peak, rgb[2] / peak);
      u.uMax.value = opts.max;
      m.layers.set(perEye ? side + 1 : 0);
      m.position.set(centred ? eyeX(side) : side ? SEP : -SEP, 0, -DIST);
      m.scale.setScalar(1.3);
      if (kind === 'crystal') m.rotation.y = t * 0.25 + side * 1.3;
    });
    this.meshes.forEach((m, side) => {
      m.visible = show && !(shape === 3 && !glow);
      if (!m.visible) return;
      const u = m.material.uniforms;
      const rgb = side ? rgbR : rgbL;
      const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
      u.uBright.value = peak;
      u.uCol.value.setRGB(rgb[0] / peak, rgb[1] / peak, rgb[2] / peak);
      u.uStyle.value = shape;
      u.uGlow.value = glow;
      u.uMax.value = opts.max;
      u.uTime.value = t;
      if (u.uMix.value > 0) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / 2.5);
        if (u.uMix.value >= 1) { u.uSym.value = u.uSymB.value; u.uMix.value = 0; }
      }
      // per-eye: each eye sees only its own symbol, off to its own side (like LEDs in light glasses)
      m.layers.set(perEye ? side + 1 : 0);
      {
        m.position.set(centred ? eyeX(side) : side ? SEP : -SEP, 0, -DIST);
        m.scale.setScalar(solidKind ? 0.65 : 0.92);
      }
    });
    this.dimLevel += ((show ? opts.dim ?? 0.5 : 0) - this.dimLevel) * (1 - Math.exp(-dt * 2));
    this.dim.visible = this.dimLevel > 0.005;
    this.dim.material.uniforms.uDim.value = this.dimLevel;
  }
}
