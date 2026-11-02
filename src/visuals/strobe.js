import * as THREE from 'three';

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
  uniform vec3 uCol; uniform float uBright, uStyle, uSym, uSymB, uMix, uTime, uMax;
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
    float k = uStyle < 0.5 ? line * 1.5 : (uStyle < 1.5 ? field * 1.2 : line * 1.5 + field * 0.55);
    vec3 col = uCol * k + mix(uCol, vec3(1.0), 0.45) * core * (uStyle < 1.5 && uStyle > 0.5 ? 0.0 : 0.9);
    gl_FragColor = vec4(col * b, 1.0);
  }`;

const DIST = 2.6; // metres in front of you
const SEP = 0.62; // half the gap between the left and right symbols

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
            uCol: { value: new THREE.Color(1, 1, 1) }, uBright: { value: 0 }, uStyle: { value: 2 },
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

    camera.layers.enable(1);
    camera.layers.enable(2);
    this.symbol = 0;
    this.symbolTimer = 0;
    this.auto = true;
  }

  // Layer 1/2 are seen only by the left/right eye in a headset.
  setXR(on) {
    if (on) { this.camera.layers.disable(1); this.camera.layers.disable(2); }
    else { this.camera.layers.enable(1); this.camera.layers.enable(2); }
    this.xr = on;
  }

  setSymbol(i) { this.auto = i < 0; if (i >= 0) this._go(i); }

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
    const perEye = this.xr && opts.layout === 'eyes';
    this.meshes.forEach((m, side) => {
      m.visible = show;
      if (!show) return;
      const u = m.material.uniforms;
      const rgb = side ? rgbR : rgbL;
      const peak = Math.max(rgb[0], rgb[1], rgb[2], 1e-4);
      u.uBright.value = peak;
      u.uCol.value.setRGB(rgb[0] / peak, rgb[1] / peak, rgb[2] / peak);
      u.uStyle.value = { symbol: 0, field: 1, both: 2 }[opts.style] ?? 2;
      u.uMax.value = opts.max;
      u.uTime.value = t;
      if (u.uMix.value > 0) {
        u.uMix.value = Math.min(1, u.uMix.value + dt / 2.5);
        if (u.uMix.value >= 1) { u.uSym.value = u.uSymB.value; u.uMix.value = 0; }
      }
      m.layers.set(perEye ? side + 1 : 0);
      m.position.set(perEye ? 0 : side ? SEP : -SEP, 0, -DIST);
      m.scale.setScalar(perEye ? 0.95 : 0.7);
    });
    this.dimLevel += ((show ? opts.dim ?? 0.5 : 0) - this.dimLevel) * (1 - Math.exp(-dt * 2));
    this.dim.visible = this.dimLevel > 0.005;
    this.dim.material.uniforms.uDim.value = this.dimLevel;
    this.dim.material.uniforms.uSides.value = perEye ? 0 : 1;
    if (show && this.auto) {
      this.symbolTimer += dt;
      if (this.symbolTimer > 24) { this.symbolTimer = 0; this._go((this.symbol + 1) % SYMBOLS.length); }
    }
  }
}
