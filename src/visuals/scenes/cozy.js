import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, POINT_SIZE, SFX, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Murmuration
// Dusk over a wide reed bed. Thousands of glowing starlings move as one,
// pouring, folding and rippling across the sky, sometimes sweeping right over
// you with a rush of wings. The flock's shape and pace follow the music.
export class MurmurationScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uFlock: { value: 0 }, uWave: { value: 0 } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 sunDir = normalize(vec3(0.3, 0.03, -1.0));
          float s = max(dot(d, sunDir), 0.0);
          vec3 c = mix(vec3(0.95, 0.5, 0.25), vec3(0.45, 0.28, 0.45), smoothstep(0.0, 0.25, h));
          c = mix(c, vec3(0.08, 0.08, 0.22), smoothstep(0.2, 0.75, h));
          c += vec3(1.0, 0.6, 0.3) * (pow(s, 8.0) * 0.5 + pow(s, 400.0) * 2.0);
          float cl = fbm(vec3(d.xz * 2.5 / (h + 0.25), uTime * 0.01)) * smoothstep(0.03, 0.25, h) * smoothstep(0.6, 0.25, h);
          c = mix(c, mix(vec3(0.35, 0.2, 0.3), vec3(1.0, 0.6, 0.4), pow(s, 3.0)), cl * 0.55);
          vec2 st = starDot(d, 220.0, 0.995); c += vec3(0.9) * st.x * smoothstep(0.4, 0.8, h) * 0.6;
          // reed beds and a calm lake on the horizon
          float reeds = 0.012 + 0.02 * fbm(vec3(atan(d.z, d.x) * 40.0, 0.0, 0.0));
          c = mix(c, vec3(0.04, 0.03, 0.05), smoothstep(reeds + 0.003, reeds - 0.003, h) * step(-0.02, h));
          vec3 water = mix(vec3(0.2, 0.12, 0.18), vec3(0.95, 0.55, 0.3) * 0.7, pow(max(dot(normalize(vec3(d.x, -d.y, d.z)), sunDir), 0.0), 20.0));
          c = mix(c, water * (0.8 + 0.25 * fbm(vec3(d.x * 40.0 / (-h + 0.02), d.z * 6.0 / (-h + 0.02), uTime * 0.2))), step(h, -0.02));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -5;
    this.group.add(sky);

    // the flock: one point per bird, its place in the formation computed on the GPU
    const N = 5000;
    const base = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // a soft, flattened cloud
      const u = Math.random(), v = Math.random(), w = Math.cbrt(Math.random());
      const th = u * Math.PI * 2, ph = Math.acos(2 * v - 1);
      base.set([Math.sin(ph) * Math.cos(th) * w, Math.cos(ph) * w * 0.45, Math.sin(ph) * Math.sin(th) * w * 0.8], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(base, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.flock = new THREE.Points(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uViewH, uFlock, uWave; varying float vA; varying float vS; varying float vFlap; varying vec3 vCol;
        ${NOISE} ${POINT_SIZE}
        vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z); }
        vec3 rotX(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
        vec3 aura(float h){ h = fract(h);
          vec3 a = vec3(0.62, 0.45, 1.0), b = vec3(0.35, 0.9, 1.0), c = vec3(1.0, 0.5, 0.82), d = vec3(1.0, 0.8, 0.45);
          return h < 0.25 ? mix(a, b, h * 4.0) : h < 0.5 ? mix(b, c, h * 4.0 - 1.0) : h < 0.75 ? mix(c, d, h * 4.0 - 2.0) : mix(d, a, h * 4.0 - 3.0); }
        void main(){
          float t = uFlock;
          vec3 b = position;
          // the flock glides slowly across the sky in front of you, turning gently
          // just past the edges of your view, rising and falling a little
          float sweep = sin(t * 0.045);
          vec3 C = vec3(sweep * 34.0, 24.0 + sin(t * 0.06) * 5.0, -52.0 + cos(t * 0.045) * 8.0);
          // its shape stretches and folds, slowly
          vec3 scale = vec3(16.0 + 6.0 * sin(t * 0.09), 5.5 + 2.5 * sin(t * 0.12 + 1.0), 11.0 + 4.0 * cos(t * 0.08));
          vec3 p = b * scale;
          p += (vec3(fbm(b * 1.2 + vec3(t * 0.04, 0.0, 0.0)), fbm(b * 1.2 + vec3(0.0, t * 0.035, 4.0)), fbm(b * 1.2 + vec3(7.0, 0.0, t * 0.045))) - 0.5) * 10.0;
          // the flock banks the way it's heading
          float heading = cos(t * 0.045);
          p = rotX(rotY(p, heading * 0.5), sin(t * 0.05) * 0.25);
          // soft ripples of density travelling through the flock
          float wave = sin(dot(b, vec3(3.0, 1.0, 2.0)) * 2.0 - t * 0.5);
          p += normalize(vec3(1.0, 0.3, 0.6)) * wave * (1.0 + uWave * 1.2);
          vec4 mv = modelViewMatrix * vec4(C + p, 1.0);
          float dist = -mv.z;
          vA = 0.75 + 0.25 * wave;
          vS = aSeed;
          // each bird glows its own aura colour, with gentle colour currents across the flock
          vCol = aura(aSeed * 0.35 + b.x * 0.4 + b.z * 0.25 + t * 0.01);
          vFlap = sin(uTime * (9.0 + aSeed * 5.0) + aSeed * 50.0);
          gl_PointSize = max(2.5, pointPx(0.55 + aSeed * 0.25, mv));
          vA *= smoothstep(0.0, 6.0, dist) * min(1.0, pointPx(0.55, mv) * pointPx(0.55, mv) / 9.0 + 0.35);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform float uFade; varying float vA; varying float vS; varying float vFlap; varying vec3 vCol;
        void main(){
          // a small bird: a body and two swept wings that beat
          vec2 p = (gl_PointCoord - 0.5) * vec2(2.0, -2.0);
          float wingY = 0.15 + vFlap * 0.35;
          float body = smoothstep(0.22, 0.1, length(p * vec2(1.0, 1.6)));
          float wl = smoothstep(0.12, 0.0, abs(p.y - wingY * abs(p.x) * 1.4 + 0.05)) * smoothstep(0.95, 0.4, abs(p.x));
          float shape = max(body, wl);
          float glow = exp(-dot(p, p) * 3.0) * 0.35;
          gl_FragColor = vec4(vCol * (shape + glow) * vA * uFade, 1.0);
        }`,
    }));
    this.flock.frustumCulled = false;
    this.group.add(this.flock);
    this.group.add(particles(U, { count: 300, min: [-30, 0.5, -40], max: [30, 6, 10], vel: [0.2, 0.05, 0], sway: 0.4, size: [0.02, 0.04], colors: ['#ffd8a0', '#ffffff'], alpha: 0.4 }));
    this.speed = 1;
  }
  onEvent(e) {
    if (e.type === 'beat' && e.accent) this.uniforms.uWave.value = Math.min(1, this.uniforms.uWave.value + 0.25);
    if (e.type === 'section') this.speedT = 0.8 + (e.energy ?? 0.5) * 0.4;
  }
  update(dt, t, s) {
    const U = this.uniforms;
    this.speed = damp(this.speed, (this.speedT || 1) * 0.8, 0.2, dt);
    U.uFlock.value += dt * this.speed;
    U.uWave.value *= Math.exp(-dt * 0.8);
    // a rush of wings when the flock sweeps close overhead
    const f = U.uFlock.value;
    // a soft rush of wings each time the flock turns at the edge of your view
    const turn = Math.abs(Math.cos(f * 0.045));
    if (turn < 0.05 && (this.lastRush ?? -99) < t - 15 && this.fade > 0.5) { this.lastRush = t; SFX.play('whoosh', { pan: Math.sign(Math.sin(f * 0.045)) * 0.6, dur: 4, gain: 0.45 }); }
  }
}

// ===================================================================== Fireplace
// A quiet room at night: a stone fireplace with a log fire, flames curling
// and flickering, embers glowing, warm light dancing on the walls and floor,
// sparks rising, and the soft crackle and hiss of the fire.
export class FireplaceScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uFlick: { value: 1 } });
    const FIRE = new THREE.Vector3(0, 0.45, -2.75);
    const lit = /* glsl */ `
      uniform float uTime, uFlick;
      vec3 fireLight(vec3 p, vec3 n){
        vec3 L = vec3(0.0, 0.55, -2.6) - p;
        float d = length(L);
        float f = 0.8 + 0.12 * sin(uTime * 11.0) + 0.1 * sin(uTime * 17.3 + 1.0) + 0.06 * sin(uTime * 29.0);
        return vec3(1.0, 0.55, 0.22) * max(0.0, dot(n, L / d) * 0.7 + 0.3) * f * uFlick * 3.2 / (1.0 + d * d * 0.55);
      }`;
    const surf = (frag) => new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vW; varying vec3 vN; varying vec2 vUv; void main(){ vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vW; varying vec3 vN; varying vec2 vUv; ${NOISE} ${GRADE} ${lit}
        void main(){ vec3 n = normalize(vN); ${frag}
          gl_FragColor = vec4(grade(c), uFade); }`,
    });
    // room: wooden floor, plaster walls, beamed ceiling
    const room = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(-Math.PI / 2), surf(`
      float plank = floor(vW.x * 4.0); float grain = fbm(vec3(vW.x * 4.0, vW.z * 0.6 + plank * 3.1, 0.0));
      vec3 base = vec3(0.32, 0.18, 0.09) * (0.65 + 0.5 * grain) * (0.85 + 0.15 * fract(sin(plank * 12.9) * 43758.5));
      base *= 1.0 - 0.6 * smoothstep(0.03, 0.0, abs(fract(vW.x * 4.0) - 0.5) - 0.47);
      // a rug in front of the hearth
      vec2 r = vW.xz - vec2(0.0, -1.2);
      float rug = step(abs(r.x), 1.3) * step(abs(r.y), 0.85);
      vec3 rugCol = mix(vec3(0.42, 0.08, 0.07), vec3(0.6, 0.38, 0.14), step(0.5, fract((abs(r.x) + abs(r.y)) * 3.0))) * (0.7 + 0.3 * fbm(vec3(vW.xz * 30.0, 0.0)));
      rugCol = mix(rugCol, vec3(0.75, 0.6, 0.3), smoothstep(0.08, 0.0, min(1.3 - abs(r.x), 0.85 - abs(r.y))));
      base = mix(base, rugCol, rug);
      vec3 c = base * (0.04 + fireLight(vW, n));`));
    const wallMat = surf(`
      vec3 base = vec3(0.55, 0.45, 0.36) * (0.8 + 0.25 * fbm(vW * 3.0));
      vec3 c = base * (0.025 + fireLight(vW, n) * 0.9);`);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.2), wallMat); back.position.set(0, 1.6, -3.3);
    const left = new THREE.Mesh(new THREE.PlaneGeometry(9, 3.2), wallMat); left.rotation.y = Math.PI / 2; left.position.set(-4.5, 1.6, 0.5);
    const right = left.clone(); right.rotation.y = -Math.PI / 2; right.position.x = 4.5;
    const behind = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.2), wallMat); behind.rotation.y = Math.PI; behind.position.set(0, 1.6, 4.5);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(12, 12).rotateX(Math.PI / 2), surf(`
      float beam = step(0.82, fract(vW.z * 0.8));
      vec3 base = mix(vec3(0.45, 0.4, 0.34), vec3(0.18, 0.1, 0.05), beam) * (0.8 + 0.2 * fbm(vW * 2.0));
      vec3 c = base * (0.02 + fireLight(vW, n) * 0.7);`));
    ceil.position.y = 3.2;
    room.add(floor, back, left, right, behind, ceil);
    // the stone fireplace: a surround with a dark opening, a hearth and a wooden mantel
    const stoneMat = surf(`
      vec2 q = vec2(vW.x + vW.z * 0.0, vW.y) * vec2(3.2, 4.5);
      q.x += floor(q.y) * 0.5;
      vec2 f = fract(q) - 0.5;
      float mortar = smoothstep(0.43, 0.48, max(abs(f.x), abs(f.y)));
      float id = fract(sin(dot(floor(q), vec2(12.9, 78.2))) * 43758.5);
      vec3 base = mix(vec3(0.42, 0.38, 0.33), vec3(0.55, 0.5, 0.44), id) * (0.75 + 0.3 * fbm(vW * 9.0));
      base = mix(base, vec3(0.16, 0.14, 0.12), mortar);
      vec3 c = base * (0.03 + fireLight(vW, n));`);
    const box = (w, h, d, x, y, z, m = stoneMat) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); room.add(b); return b; };
    box(0.55, 1.45, 0.5, -0.95, 0.72, -2.95);
    box(0.55, 1.45, 0.5, 0.95, 0.72, -2.95);
    box(2.45, 0.42, 0.5, 0, 1.65, -2.95);
    box(2.9, 1.3, 0.45, 0, 2.55, -3.05);
    box(2.8, 0.1, 0.9, 0, 0.05, -2.55);   // hearth
    const wood = surf(`
      vec3 base = vec3(0.3, 0.16, 0.07) * (0.6 + 0.5 * fbm(vec3(vW.x * 2.0, vW.y * 30.0, vW.z * 30.0)));
      vec3 c = base * (0.03 + fireLight(vW, n));`);
    box(3.0, 0.12, 0.42, 0, 1.92, -2.78, wood);
    // the firebox: soot-dark inside
    box(1.4, 1.45, 0.1, 0, 0.72, -3.15, surf(`
      vec3 c = vec3(0.05, 0.035, 0.03) * (0.6 + 0.6 * fbm(vW * 6.0)) * (0.3 + fireLight(vW, n) * 0.5);`));
    this.group.add(room);
    // logs with glowing cracks
    const logMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick; varying vec3 vP; varying vec3 vN; ${NOISE}
        void main(){
          float bark = fbm(vec3(vP.x * 18.0, vP.y * 3.0, vP.z * 18.0));
          float crack = smoothstep(0.08, 0.0, abs(fbm(vP * 7.0 + 3.0) - 0.5));
          float ember = crack * (0.6 + 0.4 * sin(uTime * 2.0 + vP.y * 12.0)) * smoothstep(0.3, -0.2, vN.y);
          vec3 c = vec3(0.07, 0.04, 0.025) * (0.5 + bark) + vec3(1.0, 0.35, 0.06) * ember * 1.3 * uFlick;
          gl_FragColor = vec4(c, uFade); }`,
    });
    const logs = new THREE.Group();
    [[0.0, 0.0, 0.12, 0.25], [0.25, 1.1, 0.1, 0.0], [-0.25, -1.1, 0.1, 0.0]].forEach(([x, ry, r, y]) => {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 0.95, 14), logMat);
      l.rotation.set(Math.PI / 2, 0, ry + Math.PI / 2); l.position.set(x * 0.4, 0.14 + y * 0.4, 0);
      logs.add(l);
    });
    logs.position.set(FIRE.x, 0.08, FIRE.z);
    this.group.add(logs);
    // ember bed
    const bed = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick; varying vec2 vP; ${NOISE}
        void main(){ float n = fbm(vec3(vP * 14.0, uTime * 0.3)); float r = length(vP * vec2(1.0, 1.6));
          float e = smoothstep(0.55, 0.75, n) * smoothstep(0.55, 0.2, r);
          gl_FragColor = vec4(vec3(1.0, 0.32, 0.05) * e * (0.8 + 0.4 * uFlick) * uFade, 1.0); }`,
    }));
    bed.position.set(FIRE.x, 0.11, FIRE.z);
    this.group.add(bed);
    // flames: several crossed sheets of animated fire for a rounded, living flame
    const flameMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { ...U, uOff: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick, uOff; varying vec2 vUv; ${NOISE}
        void main(){ vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
          float t = uTime + uOff;
          float n = fbm(vec3(p.x * 3.0, p.y * 3.5 - t * 2.6, t * 0.5 + uOff));
          float n2 = fbm(vec3(p.x * 7.0, p.y * 7.0 - t * 4.0, t + uOff * 2.0));
          // several tongues of flame along the logs
          float tongues = 0.55 + 0.45 * sin(p.x * 9.0 + n * 3.0 + uOff);
          float height = 0.45 + 0.4 * tongues * (0.8 + 0.3 * uFlick);
          float y = p.y / height;
          float w = (1.0 - y) * 0.95;
          float shape = smoothstep(w, w * 0.4, abs(p.x + (n - 0.5) * 0.6 * y)) * smoothstep(0.0, 0.06, p.y);
          float body = shape * smoothstep(1.05, 0.25, y + (n2 - 0.5) * 0.5);
          vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18), smoothstep(0.1, 0.6, body));
          c = mix(c, vec3(1.0, 0.92, 0.65), smoothstep(0.65, 1.0, body) * smoothstep(0.6, 0.0, y));
          c += vec3(0.1, 0.25, 0.9) * smoothstep(0.12, 0.0, p.y) * shape * 0.35;   // a hint of blue at the roots
          gl_FragColor = vec4(c * body * 1.25 * uFade, 1.0); }`,
    });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.45), flameMat.clone());
      m.material.uniforms = { ...U, uOff: { value: i * 3.7 } };
      m.geometry.translate(0, 0.72, 0);
      m.rotation.y = (i / 4) * Math.PI;
      m.position.set(FIRE.x + (i - 1.5) * 0.04, 0.12, FIRE.z);
      m.renderOrder = 5 + i;
      this.group.add(m);
    }
    this.sparks = particles(U, { count: 90, min: [-0.35, 0.3, -2.95], max: [0.35, 1.7, -2.55], vel: [0, 0.7, 0], sway: 0.12, size: [0.006, 0.014], colors: ['#ffb060', '#ff7a2a', '#ffe0a0'], alpha: 1 });
    this.group.add(this.sparks);
    this.nextCrackle = 1;
    this.nextHiss = 0;
  }
  onEvent(e) { if (e.type === 'beat' && e.accent) this.sparks.userData.u.uBoost.value = 0.8; }
  update(dt, t) {
    const U = this.uniforms;
    // the fire breathes: slow swells with quick flickers on top
    U.uFlick.value = 0.85 + 0.12 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 2.3 + 1) + 0.05 * (Math.random() - 0.5);
    this.sparks.userData.u.uBoost.value *= Math.exp(-dt * 2);
    if (this.fade > 0.5) {
      if (t > this.nextCrackle) { SFX.play('crackle', { pan: (Math.random() - 0.5) * 0.4, gain: 0.5 + Math.random() * 0.8 }); this.nextCrackle = t + 0.15 + Math.pow(Math.random(), 2) * 2.2; }
      if (t > this.nextHiss) { SFX.play('hiss', { pan: 0, dur: 30, gain: 1 }); this.nextHiss = t + 28; }
    }
  }
}

// ===================================================================== Campfire
// A clear night in a forest clearing. A campfire crackles in a ring of stones,
// throwing warm light on the ground and the trees; sparks climb into a sky
// full of stars and the Milky Way, and now and then a shooting star slips by.
export class CampfireScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uFlick: { value: 1 }, uShoot: { value: new THREE.Vector4(0, 0, 0, -99) } });
    const FIRE = new THREE.Vector3(0, 0, -2.6);
    const sky = new THREE.Mesh(new THREE.SphereGeometry(120, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick; uniform vec4 uShoot; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(vec3(0.02, 0.025, 0.05), vec3(0.004, 0.006, 0.02), smoothstep(0.0, 0.7, h));
          // the Milky Way
          vec3 bn = normalize(vec3(0.5, 0.75, 0.3));
          float band = exp(-pow(dot(d, bn) * 3.2, 2.0));
          float dust = fbm(d * 6.0) * fbm(d * 13.0 + 2.0);
          c += vec3(0.32, 0.3, 0.38) * band * dust * 0.9 * smoothstep(0.0, 0.25, h);
          c -= vec3(0.05) * band * smoothstep(0.55, 0.75, fbm(d * 9.0 + 5.0)) * smoothstep(0.0, 0.25, h);
          vec2 s1 = starDot(d, 300.0, 0.985); vec2 s2 = starDot(d, 700.0, 0.99 - band * 0.03);
          float tw = 0.7 + 0.3 * sin(uTime * (2.0 + s1.y * 4.0) + s1.y * 50.0);
          c += mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.85, 0.7), s1.y) * s1.x * tw * smoothstep(0.02, 0.15, h);
          c += vec3(0.8, 0.85, 1.0) * s2.x * 0.5 * smoothstep(0.02, 0.2, h);
          // a shooting star: a bright head with a fading tail along its path
          float age = uTime - uShoot.w;
          if (age > 0.0 && age < 1.2) {
            vec3 a = normalize(vec3(uShoot.x, 0.55 + uShoot.z * 0.2, -1.0));
            vec3 dir = normalize(vec3(uShoot.y, -0.35, 0.0));
            vec3 head = normalize(a + dir * age * 0.45);
            vec3 tail = normalize(a + dir * max(0.0, age - 0.25) * 0.45);
            vec3 pa = d - tail, ba = head - tail;
            float k = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
            float line = exp(-pow(length(pa - ba * k) * 520.0, 2.0)) * k * k;
            c += vec3(0.9, 0.95, 1.0) * line * 3.0 * sin(age / 1.2 * 3.14159);
          }
          // a dark ring of trees around the clearing, faintly lit by the fire
          float az = atan(d.z, d.x);
          float tree = 0.1 + 0.07 * fbm(vec3(az * 14.0, 0.0, 0.0)) + 0.05 * pow(abs(sin(az * 37.0 + fbm(vec3(az * 5.0, 1.0, 0.0)) * 4.0)), 6.0);
          float isTree = smoothstep(tree + 0.004, tree - 0.004, h);
          vec3 treeCol = vec3(0.012, 0.01, 0.01) + vec3(0.08, 0.035, 0.015) * smoothstep(0.1, -0.05, h) * smoothstep(0.0, 1.0, -d.z) * uFlick;
          c = mix(c, treeCol, isTree);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -6;
    this.group.add(sky);
    // the ground: earth and grass, lit by the fire
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 96).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vW; void main(){ vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick; varying vec3 vW; ${NOISE} ${GRADE}
        void main(){
          vec2 q = vW.xz - vec2(0.0, -2.6); float r = length(q);
          float n = fbm(vec3(vW.xz * 1.5, 0.0)), g = fbm(vec3(vW.xz * 7.0, 2.0));
          vec3 base = mix(vec3(0.07, 0.05, 0.03), vec3(0.06, 0.08, 0.03), smoothstep(1.2, 2.5, r)) * (0.6 + 0.6 * n) * (0.8 + 0.3 * g);
          base = mix(base, vec3(0.03, 0.025, 0.02), smoothstep(0.8, 0.4, r));   // ash at the centre
          float f = 0.8 + 0.12 * sin(uTime * 11.0) + 0.1 * sin(uTime * 17.3 + 1.0);
          vec3 c = base * (0.04 + vec3(1.0, 0.55, 0.22) * 3.0 * f * uFlick / (1.0 + r * r * 0.9));
          c += vec3(0.01, 0.012, 0.02);   // starlight
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    ground.renderOrder = -5;
    this.group.add(ground);
    // a ring of stones and two log seats
    const stoneMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vN = normalize(mat3(modelMatrix) * normal); vW = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick; varying vec3 vW; varying vec3 vN; ${NOISE}
        void main(){ vec3 L = vec3(0.0, 0.5, -2.6) - vW; float d = length(L);
          float f = 0.8 + 0.12 * sin(uTime * 11.0) + 0.1 * sin(uTime * 17.3 + 1.0);
          float lit = max(0.0, dot(normalize(vN), L / d) * 0.7 + 0.3) * f * uFlick * 3.0 / (1.0 + d * d * 0.9);
          vec3 c = vec3(0.3, 0.28, 0.25) * (0.6 + 0.5 * fbm(vW * 8.0)) * (0.03 + lit * vec3(1.0, 0.55, 0.22));
          gl_FragColor = vec4(c, uFade); }`,
    });
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2, st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14 + Math.random() * 0.05, 1), stoneMat);
      st.scale.set(1.2, 0.75, 1); st.position.set(FIRE.x + Math.cos(a) * 0.62, 0.07, FIRE.z + Math.sin(a) * 0.62);
      st.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(st);
    }
    [[-1.9, -1.4, 0.5], [1.8, -3.6, -0.6]].forEach(([x, z, ry]) => {
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 1.6, 14), this.seatMat || (this.seatMat = stoneMat.clone()));
      seat.rotation.set(0, ry, Math.PI / 2); seat.position.set(x, 0.2, z);
      this.group.add(seat);
    });
    // the fire itself: logs, embers, layered flames and sparks
    const logMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uFlick; varying vec3 vP; varying vec3 vN; ${NOISE}
        void main(){ float bark = fbm(vec3(vP.x * 18.0, vP.y * 3.0, vP.z * 18.0));
          float crack = smoothstep(0.08, 0.0, abs(fbm(vP * 7.0 + 3.0) - 0.5));
          float ember = crack * (0.6 + 0.4 * sin(uTime * 2.0 + vP.y * 12.0));
          vec3 c = vec3(0.07, 0.04, 0.025) * (0.5 + bark) + vec3(1.0, 0.35, 0.06) * ember * 1.3 * uFlick;
          gl_FragColor = vec4(c, uFade); }`,
    });
    for (let i = 0; i < 5; i++) {   // logs leaning together like a tepee
      const a = (i / 5) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.95, 10), logMat);
      l.position.set(FIRE.x + Math.cos(a) * 0.2, 0.32, FIRE.z + Math.sin(a) * 0.2);
      l.lookAt(FIRE.x, 0.9, FIRE.z); l.rotateX(Math.PI / 2);
      this.group.add(l);
    }
    const flameMat = /* glsl */ `uniform float uTime, uFade, uFlick, uOff; varying vec2 vUv; ${NOISE}
      void main(){ vec2 p = vec2((vUv.x - 0.5) * 2.0, vUv.y);
        float t = uTime + uOff;
        float n = fbm(vec3(p.x * 3.0, p.y * 3.5 - t * 2.6, t * 0.5 + uOff));
        float n2 = fbm(vec3(p.x * 7.0, p.y * 7.0 - t * 4.0, t + uOff * 2.0));
        float tongues = 0.55 + 0.45 * sin(p.x * 7.0 + n * 3.0 + uOff);
        float height = 0.5 + 0.45 * tongues * (0.8 + 0.3 * uFlick);
        float y = p.y / height;
        float w = (1.0 - y) * 0.9;
        float shape = smoothstep(w, w * 0.4, abs(p.x + (n - 0.5) * 0.6 * y)) * smoothstep(0.0, 0.06, p.y);
        float body = shape * smoothstep(1.05, 0.25, y + (n2 - 0.5) * 0.5);
        vec3 c = mix(vec3(0.9, 0.18, 0.02), vec3(1.0, 0.62, 0.18), smoothstep(0.1, 0.6, body));
        c = mix(c, vec3(1.0, 0.92, 0.65), smoothstep(0.65, 1.0, body) * smoothstep(0.6, 0.0, y));
        gl_FragColor = vec4(c * body * 1.25 * uFade, 1.0); }`;
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.5), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { ...U, uOff: { value: i * 3.7 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: flameMat,
      }));
      m.geometry.translate(0, 0.75, 0);
      m.rotation.y = (i / 4) * Math.PI;
      m.position.set(FIRE.x, 0.05, FIRE.z);
      m.renderOrder = 5 + i;
      this.group.add(m);
    }
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uFade, uFlick; varying vec2 vUv; void main(){ float r = length(vUv - vec2(0.5, 0.3)); gl_FragColor = vec4(vec3(1.0, 0.5, 0.15) * exp(-r * r * 14.0) * 0.35 * uFlick * uFade, 1.0); }',
    }));
    glow.position.set(FIRE.x, 0.7, FIRE.z - 0.1);
    this.group.add(glow);
    this.sparks = particles(U, { count: 160, min: [-0.35, 0.4, -2.95], max: [0.35, 5.5, -2.25], vel: [0, 0.9, 0], sway: 0.25, size: [0.006, 0.016], colors: ['#ffb060', '#ff7a2a', '#ffe0a0'], alpha: 1 });
    this.group.add(this.sparks);
    this.nextCrackle = 1; this.nextHiss = 0; this.nextShoot = 8;
  }
  onEvent(e) { if (e.type === 'beat' && e.accent) this.sparks.userData.u.uBoost.value = 0.8; }
  update(dt, t) {
    const U = this.uniforms;
    U.uFlick.value = 0.85 + 0.12 * Math.sin(t * 0.7) + 0.08 * Math.sin(t * 2.3 + 1) + 0.05 * (Math.random() - 0.5);
    this.sparks.userData.u.uBoost.value *= Math.exp(-dt * 2);
    if (t > this.nextShoot) {   // a shooting star every half minute or so
      U.uShoot.value.set((Math.random() - 0.5) * 1.6, Math.random() < 0.5 ? -1 : 1, Math.random(), t);
      this.nextShoot = t + 18 + Math.random() * 30;
    }
    if (this.fade > 0.5) {
      if (t > this.nextCrackle) { SFX.play('crackle', { pan: (Math.random() - 0.5) * 0.4, gain: 0.5 + Math.random() * 0.8 }); this.nextCrackle = t + 0.15 + Math.pow(Math.random(), 2) * 2.2; }
      if (t > this.nextHiss) { SFX.play('hiss', { pan: 0, dur: 30, gain: 1 }); this.nextHiss = t + 28; }
    }
  }
}
