import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, SFX, POINT_SIZE, SOFT_DOT, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Into the light
// A gentle reimagining of crossing over. You rise slowly out of a quiet
// darkness toward a soft light, pass through it, and find yourself in a vast
// shimmering realm of gold and pearl. Figures of light — people and the pets
// you have loved — walk out of the glow to meet you, gather around you, and
// everything dissolves into a warm, endless bliss. Then, softly, it begins again.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LOOP = 280;

// ---- figures of light: real body shapes, made of thousands of glowing motes
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const seg = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq())); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
const cap = (a, b, r0, r1 = r0) => (p) => {
  const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return p.distanceTo(a.clone().addScaledVector(ab, t)) - (r0 + (r1 - r0) * t);
};
const ell = (c, r) => (p) => { const q = p.clone().sub(c).divide(r); return (q.length() - 1) * Math.min(r.x, r.y, r.z); };

function personShape(h, build) {
  // an adult (or child, scaled) standing with arms opening in welcome
  const k = h / 1.75, w = build;
  const P = (x, y, z) => V(x * k * w, y * k, z * k);
  return [
    ell(P(0, 1.63, 0), V(0.095 * k, 0.12 * k, 0.105 * k)),                  // head
    cap(P(0, 1.5, 0), P(0, 1.43, 0), 0.05 * k),                               // neck
    ell(P(0, 1.27, 0), V(0.19 * k * w, 0.2 * k, 0.11 * k)),                  // chest
    ell(P(0, 1.03, 0), V(0.16 * k * w, 0.14 * k, 0.1 * k)),                  // waist and hips
    cap(P(-0.19, 1.4, 0), P(-0.3, 1.13, 0.06), 0.05 * k, 0.042 * k),          // upper arms, slightly out
    cap(P(0.19, 1.4, 0), P(0.3, 1.13, 0.06), 0.05 * k, 0.042 * k),
    cap(P(-0.3, 1.13, 0.06), P(-0.42, 0.96, 0.24), 0.04 * k, 0.032 * k),      // forearms reaching forward, open
    cap(P(0.3, 1.13, 0.06), P(0.42, 0.96, 0.24), 0.04 * k, 0.032 * k),
    ell(P(-0.44, 0.93, 0.27), V(0.04 * k, 0.07 * k, 0.025 * k)),              // hands
    ell(P(0.44, 0.93, 0.27), V(0.04 * k, 0.07 * k, 0.025 * k)),
    cap(P(-0.09, 0.95, 0), P(-0.1, 0.5, 0.02), 0.075 * k, 0.055 * k),         // legs
    cap(P(0.09, 0.95, 0), P(0.1, 0.5, 0.02), 0.075 * k, 0.055 * k),
    cap(P(-0.1, 0.5, 0.02), P(-0.1, 0.07, 0), 0.052 * k, 0.04 * k),
    cap(P(0.1, 0.5, 0.02), P(0.1, 0.07, 0), 0.052 * k, 0.04 * k),
    ell(P(-0.1, 0.035, 0.06), V(0.045 * k, 0.035 * k, 0.11 * k)),             // feet
    ell(P(0.1, 0.035, 0.06), V(0.045 * k, 0.035 * k, 0.11 * k)),
  ];
}
function dogShape() {
  // a friendly dog standing side-on to its path, head up, tail raised
  return [
    ell(V(0, 0.52, 0), V(0.14, 0.15, 0.36)),                                  // body (along z)
    ell(V(0, 0.56, 0.3), V(0.15, 0.16, 0.14)),                                // chest
    cap(V(0, 0.6, 0.36), V(0, 0.78, 0.46), 0.08),                             // neck
    ell(V(0, 0.84, 0.5), V(0.1, 0.1, 0.12)),                                  // head
    ell(V(0, 0.8, 0.63), V(0.055, 0.05, 0.09)),                               // muzzle
    ell(V(-0.08, 0.86, 0.46), V(0.03, 0.08, 0.05)), ell(V(0.08, 0.86, 0.46), V(0.03, 0.08, 0.05)),   // soft ears
    ...[[-0.08, 0.28], [0.08, 0.28], [-0.08, -0.25], [0.08, -0.25]].map(([x, z]) => cap(V(x, 0.45, z), V(x, 0.03, z + 0.02), 0.045, 0.035)),
    cap(V(0, 0.6, -0.34), V(0, 0.82, -0.52), 0.035, 0.02),                    // tail up
  ];
}
function catShape() {
  // a cat sitting upright, tail curled round its paws
  return [
    ell(V(0, 0.2, 0), V(0.13, 0.2, 0.15)),
    ell(V(0, 0.38, 0.04), V(0.1, 0.12, 0.1)),
    ell(V(0, 0.52, 0.07), V(0.085, 0.075, 0.08)),
    cap(V(-0.055, 0.58, 0.07), V(-0.065, 0.66, 0.06), 0.028, 0.004), cap(V(0.055, 0.58, 0.07), V(0.065, 0.66, 0.06), 0.028, 0.004),
    cap(V(-0.04, 0.2, 0.12), V(-0.04, 0.02, 0.14), 0.03), cap(V(0.04, 0.2, 0.12), V(0.04, 0.02, 0.14), 0.03),
    cap(V(0.12, 0.05, -0.1), V(0.17, 0.04, 0.08), 0.03, 0.025), cap(V(0.17, 0.04, 0.08), V(0.06, 0.03, 0.2), 0.025, 0.02),
  ];
}
function sampleShape(parts, n, box) {
  const d = (p) => Math.min(...parts.map((f) => f(p)));
  const pos = [], rnd = [];
  const p = new THREE.Vector3();
  let guard = 0;
  while (pos.length < n * 3 && guard++ < n * 400) {
    p.set(box[0] + Math.random() * (box[3] - box[0]), box[1] + Math.random() * (box[4] - box[1]), box[2] + Math.random() * (box[5] - box[2]));
    const dist = d(p);
    // mostly a luminous skin, with a softer glow inside
    if (dist < 0 && (dist > -0.018 || Math.random() < 0.12)) { pos.push(p.x, p.y, p.z); rnd.push(Math.random()); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(rnd, 1));
  return g;
}

export class IntoTheLightScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uRise: { value: 0 }, uLight: { value: 0 }, uBliss: { value: 0 }, uFadeIn: { value: 0 } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uRise, uLight, uBliss, uFadeIn, uBreath; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir);
          // the dark: deep, quiet blue with faint stars, and a soft light far above and ahead
          vec3 L = normalize(vec3(0.0, 0.55, -1.0));
          float mu = max(dot(d, L), 0.0);
          vec3 dark = vec3(0.004, 0.006, 0.02) + vec3(0.02, 0.03, 0.08) * smoothstep(-0.5, 0.8, d.y);
          vec2 st = starDot(d, 240.0, 0.994);
          dark += vec3(0.7, 0.8, 1.0) * st.x * 0.4;
          float grow = smoothstep(0.0, 1.0, uRise);
          dark += vec3(1.0, 0.92, 0.75) * (pow(mu, mix(400.0, 30.0, grow)) * (0.6 + 2.0 * grow) + pow(mu, 6.0) * 0.15 * grow);
          // the realm of light: pearl and gold, soft drifting veils, gently shimmering
          float veil = fbm(vec3(d * 2.0 + vec3(0.0, uTime * 0.01, uTime * 0.008)));
          float veil2 = fbm(vec3(d * 4.5 - vec3(uTime * 0.012, 0.0, 0.0)));
          vec3 realm = mix(vec3(0.85, 0.78, 0.7), vec3(1.15, 1.02, 0.82), smoothstep(-0.4, 0.6, d.y));
          realm = mix(realm, vec3(1.3, 1.2, 1.05), smoothstep(0.45, 0.8, veil) * 0.5);
          realm *= 0.85 + 0.3 * veil;
          // a faint iridescent shimmer through the light
          vec3 iri = 0.5 + 0.5 * cos(6.2831 * (veil2 * 1.5 + vec3(0.0, 0.33, 0.67) + uTime * 0.02));
          realm += iri * smoothstep(0.5, 0.75, veil2) * 0.2;
          realm += vec3(1.0, 0.95, 0.85) * pow(mu, 8.0) * 0.4;
          // a soft floor of luminous mist below
          realm = mix(realm, vec3(1.15, 1.05, 0.92) * (0.75 + 0.4 * veil), smoothstep(0.0, -0.3, d.y) * 0.7);
          vec3 c = mix(dark, realm * 0.78, uLight);
          // bliss: everything becomes warm, endless, gentle light
          c = mix(c, vec3(1.0, 0.92, 0.8) * (0.85 + 0.05 * sin(uTime * 0.3)), uBliss * 0.75);
          gl_FragColor = vec4(grade(c * uFadeIn * (0.97 + uBreath * 0.03)), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    // motes streaming past as you rise, then drifting softly in the light
    this.motes = particles(U, { count: 500, min: [-14, -6, -20], max: [14, 14, 8], vel: [0, -1.2, 0], sway: 0.4, size: [0.02, 0.05], colors: ['#fff4dc', '#ffe6b0', '#dfe8ff', '#ffffff'], alpha: 0.6, clear: 1.5 });
    this.group.add(this.motes);

    // the ones who come to meet you, made of light
    const kinds = [['woman', -1.6, 0], ['man', 1.5, 0.15], ['child', 0.55, 0.3], ['dog', -0.5, 0.1], ['cat', 2.6, 0.25], ['elder', -3.0, 0.35]];
    const glow = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const c = cv.getContext('2d'); const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,240,215,0.55)'); g.addColorStop(0.4, 'rgba(255,225,190,0.18)'); g.addColorStop(1, 'rgba(255,220,180,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); return cv; })());
    this.figs = kinds.map(([k, x, delay], i) => {
      const geo = k === 'dog' ? sampleShape(dogShape(), 2600, [-0.3, 0, -0.65, 0.3, 1.0, 0.75])
        : k === 'cat' ? sampleShape(catShape(), 1500, [-0.25, 0, -0.25, 0.25, 0.7, 0.3])
        : sampleShape(personShape(k === 'child' ? 1.2 : k === 'man' ? 1.8 : k === 'elder' ? 1.66 : 1.68, k === 'man' ? 1.12 : k === 'child' ? 1.0 : 0.95), k === 'child' ? 3000 : 4200, [-0.6, 0, -0.3, 0.6, 1.85, 0.45]);
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { ...U, uOp: { value: 0 }, uDis: { value: 0 }, uSeed: { value: i * 7.3 } },
        vertexShader: /* glsl */ `attribute float aR; uniform float uTime, uViewH, uOp, uDis, uSeed; varying float vA; varying vec3 vC; ${NOISE} ${POINT_SIZE}
          void main(){ vec3 p = position;
            // each mote drifts softly about its place, and on dissolving rises and spreads into the light
            float t = uTime * 0.4 + aR * 30.0;
            p += vec3(sin(t), sin(t * 1.3 + 2.0), cos(t * 0.9)) * 0.006;
            p += (vec3(vnoise(p * 3.0 + uSeed), vnoise(p * 3.0 + uSeed + 5.0), vnoise(p * 3.0 + uSeed + 9.0)) - 0.5) * uDis * 2.5 + vec3(0.0, uDis * uDis * (1.0 + aR * 3.0), 0.0);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = pointPx(0.016 + aR * 0.014, mv);
            float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aR * 3.0) + aR * 60.0);
            vA = uOp * tw * (1.0 - uDis * 0.6);
            vC = mix(vec3(1.0, 0.9, 0.72), 0.75 + 0.25 * cos(6.2831 * (aR + vec3(0.0, 0.33, 0.67) + uTime * 0.03)), 0.25);
            gl_Position = projectionMatrix * mv; }`,
        fragmentShader: /* glsl */ `uniform float uFade; varying float vA; varying vec3 vC; ${SOFT_DOT}
          void main(){ vec2 q = gl_PointCoord - 0.5; float d = exp(-dot(q, q) * 14.0); gl_FragColor = vec4(vC * d * vA * uFade * 0.55, 1.0); }`,
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
      const ah = k === 'dog' || k === 'cat' ? 1.2 : 2.6;
      aura.scale.set(ah, ah * 1.15, 1); aura.position.y = k === 'dog' ? 0.5 : k === 'cat' ? 0.35 : 1.0;
      const holder = new THREE.Group();
      holder.add(aura, pts);
      this.group.add(holder);
      return { sp: holder, pts, aura, x, delay, k, ang0: Math.atan2(x, 4) };
    });
    this.t = 0; this.chimed = 0;
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }
  update(dt) {
    const U = this.uniforms;
    this.t = (this.t + dt) % LOOP;
    const t = this.t;
    // 0-45 rising in the dark; 45-70 into the light; 95-165 they come; 165-205 they gather round; 205-250 bliss; 250-280 settling
    U.uRise.value = smooth(0, 50, t);
    U.uLight.value = damp(U.uLight.value, smooth(45, 72, t) * (1 - smooth(255, 278, t)), 2, dt);
    U.uBliss.value = damp(U.uBliss.value, smooth(200, 235, t) * (1 - smooth(245, 270, t)), 2, dt);
    U.uFadeIn.value = smooth(0, 6, t) * (1 - smooth(272, 280, t) * 0.9) + 0.1 * smooth(272, 280, t);
    // motes: streaming down while you rise, then floating up gently in the light
    const mu = this.motes.userData.u;
    mu.uVel.value.y = damp(mu.uVel.value.y, t < 60 ? -1.4 : 0.15, 0.6, dt);
    mu.uAlpha.value = 0.25 + 0.35 * U.uLight.value;
    if (t > 46 && t < 47 && this.chimed !== 1) { this.chimed = 1; this._sfx('whoosh', { pan: 0, dur: 6, gain: 0.35 }); }
    if (t < 46) this.chimed = 0;

    for (const [i, f] of this.figs.entries()) {
      const start = 95 + f.delay * 60;
      const walk = smooth(start, start + 60, t);
      const gather = smooth(165, 200, t);
      // walk toward you out of the light, then come gently round you
      const z = -38 + walk * 34;
      const ang = f.ang0 + gather * (i % 2 ? 1 : -1) * (0.35 + i * 0.12);
      const r = Math.hypot(f.x, z) * (1 - gather) + 3.2 * gather;
      const a = gather > 0 ? ang : Math.atan2(f.x, -z);
      const x = gather > 0 ? Math.sin(a) * r : f.x;
      const zz = gather > 0 ? -Math.cos(a) * r : z;
      f.sp.position.set(x, 0.05 + Math.sin(t * 1.3 + i) * 0.03 * walk, zz);
      // they shimmer, and dissolve into the bliss
      const vis = smooth(start - 4, start + 12, t) * (1 - smooth(215, 240, t));
      const u = f.pts.material.uniforms;
      u.uOp.value = vis * (0.85 + 0.15 * Math.sin(t * 2.1 + i * 1.7));
      u.uDis.value = smooth(212, 245, t);
      f.aura.material.opacity = vis * 0.55 * this.fade;
      // people turn to face you; the dog trots along its path, the cat sits facing you
      f.sp.rotation.y = f.k === 'dog' ? (gather > 0 ? Math.atan2(-x, -zz) + Math.PI / 2 : 0) : Math.atan2(-x, -zz);
      if (walk > 0.98 && !f.chimed && t < 200) { f.chimed = true; this._sfx('chime', { note: [0, 4, 7, 9, 12, 16][i % 6], pan: Math.max(-0.8, Math.min(0.8, x / 4)), gain: 0.35 }); }
      if (t < start) f.chimed = false;
    }
  }
}
