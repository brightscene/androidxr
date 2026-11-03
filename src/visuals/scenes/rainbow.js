import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, SFX, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Rainbow road
// You ride a shimmering ribbon of rainbow light that loops and weaves through
// a galaxy: sweeping round long banked curves, climbing and dipping, glowing
// rails either side, light chevrons streaming beneath you, a great spiral
// galaxy turning in the distance and nebulae drifting past.
const WIDTH = 9;
const EYE = 2.4;
const SEGS = 2400;

function makeTrack() {
  // a big closed loop through space, weaving left, right, up and down
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    const r = 260 + Math.sin(a * 3) * 60 + Math.sin(a * 5 + 2) * 25;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2 + 1) * 16 + Math.sin(a * 5) * 6, Math.sin(a) * r));
  }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

export class RainbowRoadScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uRoadT: { value: 0 }, uBoost: { value: 0 } });
    this.world = new THREE.Group();
    this.group.add(this.world);

    // the galaxy all around
    const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 64, 40), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        void main(){ vec3 d = normalize(vDir);
          vec3 c = vec3(0.006, 0.006, 0.02);
          // nebulae in deep violet, teal and rose
          float n1 = fbm(d * 2.2 + vec3(0.0, 0.0, uTime * 0.004)), n2 = fbm(d * 4.0 + 5.0);
          c += vec3(0.25, 0.06, 0.35) * smoothstep(0.5, 0.85, n1) * 0.6 + vec3(0.03, 0.2, 0.25) * smoothstep(0.55, 0.9, n2) * 0.5;
          c += vec3(0.35, 0.08, 0.18) * smoothstep(0.62, 0.9, fbm(d * 3.0 + 11.0)) * 0.4;
          // a great spiral galaxy, tilted, turning slowly
          vec3 G = normalize(vec3(0.6, 0.35, -0.7));
          vec3 X = normalize(cross(G, vec3(0.0, 1.0, 0.0))), Y = cross(X, G);
          float k = dot(d, G);
          if (k > 0.0) {
            vec2 q = vec2(dot(d, X), dot(d, Y) * 1.8) / k * 3.0;
            float r = length(q), a = atan(q.y, q.x);
            float arms = pow(0.5 + 0.5 * cos(a * 2.0 - log(r + 0.05) * 4.0 + uTime * 0.02), 3.0);
            float disc = exp(-r * 1.6);
            c += mix(vec3(0.5, 0.6, 1.0), vec3(1.0, 0.75, 0.5), exp(-r * 3.0)) * (disc * (0.3 + 0.9 * arms) + exp(-r * r * 30.0) * 1.2);
          }
          vec2 s1 = starDot(d, 300.0, 0.985), s2 = starDot(d, 700.0, 0.99);
          c += vec3(0.85, 0.9, 1.0) * (s1.x * 0.8 + s2.x * 0.4);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.sky = sky;
    this.group.add(sky);

    // the road: a glowing translucent ribbon
    const curve = makeTrack();
    this.curve = curve;
    this.len = curve.getLength();
    curve.arcLengthDivisions = SEGS * 2;
    this.frames = [];
    const pos = [], uv = [], idx = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= SEGS; i++) {
      const u = i / SEGS;
      const p = curve.getPointAt(u % 1), t = curve.getTangentAt(u % 1);
      // bank into the turns
      const t0 = curve.getTangentAt((u + 0.985) % 1), t2 = curve.getTangentAt((u + 0.015) % 1);
      const turn = new THREE.Vector3().crossVectors(t0, t2).y;
      const right = new THREE.Vector3().crossVectors(t, up).normalize();
      const bank = Math.max(-0.3, Math.min(0.3, -turn * 3.5));
      right.applyAxisAngle(t, bank);
      const nUp = new THREE.Vector3().crossVectors(right, t).normalize();
      this.frames.push({ p, t, right, up: nUp });
      for (const s of [-1, 1]) {
        const v = p.clone().addScaledVector(right, s * WIDTH / 2);
        pos.push(v.x, v.y, v.z);
        uv.push(s < 0 ? 0 : 1, u * this.len);
      }
      if (i < SEGS) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const road = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uRoadT, uBoost; varying vec2 vUv; varying vec3 vW; ${NOISE} ${GRADE}
        vec3 rainbow(float x){ return clamp(abs(mod(x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main(){ float x = vUv.x, z = vUv.y;
          // bands of colour across the road, shimmering
          vec3 c = rainbow(x * 0.92 + 0.02) * (0.5 + 0.15 * sin(z * 0.6 - uTime * 3.0));
          // chevrons of light streaming along beneath you
          float chev = fract((z - abs(x - 0.5) * 6.0) / 7.0 - uTime * (0.45 + uBoost * 1.5));
          c += vec3(1.0) * smoothstep(0.08, 0.0, abs(chev - 0.5) - 0.42) * 0.25 * (1.0 + uBoost);
          // panel seams and sparkle
          c *= 0.85 + 0.15 * step(0.04, fract(z / 4.0));
          c += vec3(1.0) * pow(vnoise(vec3(x * 40.0, z * 2.0, uTime * 3.0)), 18.0) * 1.5;
          // glowing rails at the edges
          float rail = smoothstep(0.04, 0.0, min(x, 1.0 - x));
          c = mix(c, vec3(1.0, 0.97, 0.95), rail);
          float dist = length(vW - cameraPosition);
          float a = (0.7 + 0.3 * rail) * exp(-max(0.0, dist - 150.0) * 0.006);
          gl_FragColor = vec4(grade(c) * a * uFade, 1.0); }`,
    }));
    road.frustumCulled = false;
    road.renderOrder = -4;
    this.world.add(road);

    // light posts along the rails, every few metres
    const posts = [];
    for (let d = 0; d < this.len; d += 12) {
      const f = this.frames[Math.round(d / this.len * SEGS) % SEGS];
      for (const s of [-1, 1]) { const v = f.p.clone().addScaledVector(f.right, s * (WIDTH / 2 + 0.2)).addScaledVector(f.up, 0.5); posts.push(v.x, v.y, v.z); }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(posts, 3));
    const glow = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
      vertexShader: 'uniform float uViewH, uTime; varying float vK; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(uViewH * 0.9 / -mv.z, 2.5, 60.0); vK = 0.5 + 0.5 * sin(uTime * 3.0 + position.x * 0.1 + position.z * 0.1); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform float uFade; varying float vK; void main(){ vec2 q = gl_PointCoord - 0.5; float d = exp(-dot(q, q) * 18.0); gl_FragColor = vec4(mix(vec3(1.0, 0.6, 0.9), vec3(0.6, 0.9, 1.0), vK) * d * uFade, 1.0); }',
    }));
    glow.frustumCulled = false;
    this.world.add(glow);

    // stardust drifting past you
    this.dust = particles(U, { count: 600, min: [-30, -15, -60], max: [30, 25, 6], vel: [0, 0, 20], sway: 0.1, size: [0.02, 0.05], colors: ['#ffffff', '#ffd6f5', '#cfe8ff'], alpha: 0.6 });
    this.group.add(this.dust);

    this.s = 0; this.speed = 24; this.target = 24; this.next = 8; this.boost = 0;
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.prevQ = null;
  }
  _frame(d) {
    const u = ((d / this.len) % 1 + 1) % 1 * SEGS, i = Math.floor(u), k = u - i;
    const a = this.frames[i % SEGS], b = this.frames[(i + 1) % SEGS];
    return {
      p: a.p.clone().lerp(b.p, k), t: a.t.clone().lerp(b.t, k).normalize(),
      right: a.right.clone().lerp(b.right, k).normalize(), up: a.up.clone().lerp(b.up, k).normalize(),
    };
  }
  update(dt) {
    const U = this.uniforms;
    this.next -= dt;
    if (this.next <= 0) { this.target = [16, 22, 28, 36][Math.floor(Math.random() * 4)]; this.next = 7 + Math.random() * 7; }
    // every so often, a burst: race at full tilt for 5-10 seconds, then ease right down
    this.nextBurst = (this.nextBurst ?? 14) - dt;
    if (this.nextBurst <= 0 && !this.burst) {
      this.burst = 5 + Math.random() * 5;
      this.nextBurst = this.burst + 15 + Math.random() * 15;
      if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 4, gain: 0.7 });
    }
    if (this.burst) {
      this.burst -= dt;
      if (this.burst <= 0) { this.burst = 0; this.target = 14; this.next = 6 + Math.random() * 4; if (this.fade > 0.5) SFX.play('whoosh', { pan: 0, dur: 3, gain: 0.3 }); }
    }
    this.boost = damp(this.boost, this.burst ? 1 : 0, this.burst ? 1.4 : 0.5, dt);
    this.speed = damp(this.speed, this.burst ? 95 : this.target, this.burst ? 0.9 : 0.45, dt);
    this.s += this.speed * dt;
    U.uBoost.value = this.boost;
    // ride the road: sit at eye height above it, looking a little way ahead, banking with it
    const here = this._frame(this.s), ahead = this._frame(this.s + 6);
    const fwd = ahead.p.clone().sub(here.p).normalize();
    const upv = here.up.clone().lerp(ahead.up, 0.5).normalize();
    const right = new THREE.Vector3().crossVectors(fwd, upv).normalize();
    const up2 = new THREE.Vector3().crossVectors(right, fwd).normalize();
    const eye = here.p.clone().addScaledVector(up2, EYE);
    this.M.makeBasis(right, up2, fwd.clone().negate());
    this.Q.setFromRotationMatrix(this.M);
    // smooth out any small jitters in the ride
    if (this.prevQ) this.Q.copy(this.prevQ.slerp(this.Q, 1 - Math.exp(-dt * 6)));
    this.prevQ = this.Q.clone();
    // the world is placed so that the rider's view sits at your eyes
    const inv = this.Q.clone().invert();
    this.world.quaternion.copy(inv);
    this.sky.quaternion.copy(inv);   // the galaxy turns around you as the road turns
    this.world.position.copy(eye).applyQuaternion(inv).negate().add(new THREE.Vector3(0, 1.6, 0));
    this.dust.userData.u.uVel.value.set(0, 0, this.speed * 0.8);
    this.dust.userData.u.uBoost.value = this.boost;
  }
}
