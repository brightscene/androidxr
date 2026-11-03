import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, SFX, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Into the light
// A gentle reimagining of crossing over. You rise slowly out of a quiet
// darkness toward a soft light, pass through it, and find yourself in a vast
// shimmering realm of gold and pearl. Figures of light — people and the pets
// you have loved — walk out of the glow to meet you, gather around you, and
// everything dissolves into a warm, endless bliss. Then, softly, it begins again.
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const LOOP = 280;

// soft glowing silhouettes, drawn once onto canvases
function figureTexture(kind) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 512;
  const c = cv.getContext('2d');
  c.translate(128, 0);
  c.fillStyle = '#fff';
  c.shadowColor = 'rgba(255, 240, 210, 1)';
  const draw = () => {
    c.beginPath();
    if (kind === 'person' || kind === 'person2') {
      const tall = kind === 'person' ? 1 : 0.92;
      c.save(); c.scale(1, tall); c.translate(0, 512 * (1 - tall) / tall);
      c.arc(0, 92, 34, 0, Math.PI * 2);
      c.moveTo(-30, 140);
      c.quadraticCurveTo(-62, 150, -66, 210); c.lineTo(-74, 330); c.quadraticCurveTo(-80, 430, -70, 500);
      c.lineTo(70, 500); c.quadraticCurveTo(80, 430, 74, 330); c.lineTo(66, 210); c.quadraticCurveTo(62, 150, 30, 140);
      c.closePath(); c.restore();
    } else if (kind === 'child') {
      c.arc(0, 262, 30, 0, Math.PI * 2);
      c.moveTo(-24, 302); c.quadraticCurveTo(-52, 312, -54, 360); c.lineTo(-58, 500); c.lineTo(58, 500); c.lineTo(54, 360); c.quadraticCurveTo(52, 312, 24, 302);
      c.closePath();
    } else if (kind === 'dog') {
      // a dog standing side-on, tail up, ears soft
      c.ellipse(-6, 392, 66, 30, 0, 0, Math.PI * 2);
      c.moveTo(46, 380); c.lineTo(64, 330); c.lineTo(88, 330); c.lineTo(70, 390); c.closePath();
      c.moveTo(100, 322); c.ellipse(82, 322, 24, 20, 0, 0, Math.PI * 2);
      c.moveTo(110, 330); c.ellipse(106, 334, 18, 10, 0.15, 0, Math.PI * 2);
      c.moveTo(68, 312); c.ellipse(70, 322, 9, 20, 0.25, 0, Math.PI * 2);
      for (const x of [-56, -38, 30, 48]) { c.moveTo(x - 7, 410); c.rect(x - 7, 405, 14, 95); }
      c.moveTo(-68, 384); c.quadraticCurveTo(-104, 372, -112, 340); c.lineTo(-102, 338); c.quadraticCurveTo(-98, 364, -64, 372); c.closePath();
    } else {
      // a cat sitting, tail curled round
      c.ellipse(0, 430, 52, 66, 0, 0, Math.PI * 2);
      c.moveTo(34, 350); c.arc(0, 350, 34, 0, Math.PI * 2);
      c.moveTo(-30, 334); c.lineTo(-26, 296); c.lineTo(-8, 322);
      c.moveTo(30, 334); c.lineTo(26, 296); c.lineTo(8, 322);
      c.moveTo(40, 480); c.quadraticCurveTo(100, 470, 84, 420); c.lineTo(76, 426); c.quadraticCurveTo(86, 462, 40, 470);
    }
    c.fill();
  };
  // layered glow: wide soft halo, then a brighter body
  for (const [blur, a] of [[60, 0.35], [26, 0.5], [8, 0.9]]) { c.shadowBlur = blur; c.globalAlpha = a; draw(); }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

    // the ones who come to meet you
    const kinds = [['person', -1.6, 0], ['person2', 1.5, 0.15], ['child', 0.55, 0.3], ['dog', -0.5, 0.1], ['cat', 2.6, 0.25], ['person', -3.0, 0.35]];
    this.figs = kinds.map(([k, x, delay], i) => {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { ...U, uTex: { value: figureTexture(k) }, uOp: { value: 0 }, uSeed: { value: i * 7.3 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform sampler2D uTex; uniform float uOp, uTime, uSeed, uFade; varying vec2 vUv; ${NOISE}
          void main(){ vec4 t = texture2D(uTex, vUv);
            // made of light: shimmering currents rising through a soft glow, brighter at the heart
            float sh = fbm(vec3(vUv * vec2(6.0, 9.0) - vec2(0.0, uTime * 0.35), uSeed + uTime * 0.1));
            float sp = pow(vnoise(vec3(vUv * 60.0, uTime * 1.5 + uSeed)), 12.0) * 6.0;
            float core = smoothstep(0.6, 1.0, t.a);
            vec3 iri = 0.5 + 0.5 * cos(6.2831 * (sh + vec3(0.0, 0.33, 0.67) + uTime * 0.05));
            vec3 c = vec3(1.0, 0.9, 0.75) * (t.a * 0.12 + core * (0.06 + 0.22 * sh)) + iri * core * 0.06 + vec3(1.0, 0.97, 0.9) * sp * core * 0.5;
            gl_FragColor = vec4(c * uOp * uFade, 1.0); }`,
      });
      const h = k === 'dog' || k === 'cat' ? 1.85 : 1.95;
      const sp = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.5, h).translate(0, h / 2, 0), mat);
      this.group.add(sp);
      return { sp, x, delay, k, ang0: Math.atan2(x, 4) };
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
      f.sp.material.uniforms.uOp.value = vis * (0.85 + 0.15 * Math.sin(t * 2.1 + i * 1.7));
      f.sp.rotation.y = Math.atan2(-x, -zz);   // always turned toward you
      if (walk > 0.98 && !f.chimed && t < 200) { f.chimed = true; this._sfx('chime', { note: [0, 4, 7, 9, 12, 16][i % 6], pan: Math.max(-0.8, Math.min(0.8, x / 4)), gain: 0.35 }); }
      if (t < start) f.chimed = false;
    }
  }
}
