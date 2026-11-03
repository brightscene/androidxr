import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Jet ski
// You ride a jet ski out across a rough open sea under a wild, broken sky.
// Big swells roll toward you; the ski climbs each one, crests, and crashes
// down through the next with a thump and a burst of spray, the sun flashing
// off the water. The ski's own nose and handlebars stay steady in front of
// you while the sea heaves gently around them, which keeps it comfortable.

// the swells: amplitude, x and z wavenumbers, own speed (shared by the shader
// and by the ride, so the ski moves exactly with the water you see)
const WAVES = [
  [0.85, 0.0, 0.15, 0.55],
  [0.5, 0.07, 0.22, 0.85],
  [0.32, -0.11, 0.3, 1.05],
  [0.17, 0.24, 0.44, 1.5],
  [0.09, -0.38, 0.62, 2.0],
];
const GLSL_WAVES = WAVES.map((w) => `vec4(${w.map((v) => v.toFixed(3)).join(', ')})`).join(', ');
// height of the sea at a point (x, z) of the world, offset by how far you've travelled
function height(x, z, ox, oz, T) {
  let h = 0;
  for (const [a, kx, kz, w] of WAVES) { const s = Math.sin(kx * (x + ox) + kz * (z + oz) + w * T); h += a * (s + 0.35 * s * s * Math.sign(s)); }
  return h;
}

const LIT_VS = 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }';
function litMat(U, a, b) {
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uA: { value: new THREE.Color(a) }, uB: { value: new THREE.Color(b) } }, vertexShader: LIT_VS,
    fragmentShader: /* glsl */ `uniform vec3 uA, uB; uniform float uFade; varying vec3 vN; varying vec3 vP; ${NOISE} ${GRADE}
      void main(){ vec3 n = normalize(vN); vec3 L = normalize(vec3(0.4, 0.6, -0.7));
        float dif = max(dot(n, L), 0.0), sky = 0.5 + 0.5 * n.y;
        vec3 base = mix(uA, uB, smoothstep(-0.02, 0.02, vP.y));
        vec3 c = base * (0.25 + 0.55 * dif + 0.3 * sky) + vec3(1.0) * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 24.0) * 0.35;
        gl_FragColor = vec4(grade(c) * uFade, 1.0); }`,
  });
}

export class JetSkiScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uS: { value: 0 }, uT: { value: 0 }, uSpray: { value: 0 }, uOff: { value: new THREE.Vector2() } });
    this.world = new THREE.Group();
    this.group.add(this.world);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uS; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 sun = normalize(vec3(0.35, 0.22, -1.0)); float s = max(dot(d, sun), 0.0);
          vec3 c = mix(vec3(0.42, 0.48, 0.55), vec3(0.1, 0.18, 0.3), smoothstep(0.0, 0.6, h));
          c += vec3(1.0, 0.85, 0.6) * (pow(s, 8.0) * 0.35 + pow(s, 500.0) * 3.0);
          // fast, torn storm clouds with the sun breaking through
          vec2 q = d.xz / (h + 0.18) * 0.9 + vec2(0.0, uS * 0.004 + uTime * 0.01);
          float cl = fbm(vec3(q, uTime * 0.02)), cl2 = fbm(vec3(q * 2.5 + cl, 3.0));
          float cov = smoothstep(0.4, 0.75, cl * 0.7 + cl2 * 0.3) * smoothstep(0.0, 0.12, h);
          vec3 cc = mix(vec3(0.12, 0.13, 0.16), vec3(0.75, 0.72, 0.7), cl2) + vec3(1.0, 0.8, 0.55) * pow(s, 4.0) * 0.6;
          c = mix(c, cc, cov * 0.85);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.world.add(sky);

    // the sea: a wide sheet displaced by the swells, rolling toward you as you ride
    const g = new THREE.PlaneGeometry(280, 280, 240, 240);
    g.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: /* glsl */ `uniform float uS, uT; uniform vec2 uOff; varying vec3 vW; varying vec3 vN; varying float vH;
        const vec4 WV[5] = vec4[5](${GLSL_WAVES});
        void main(){ vec3 p = position; float h = 0.0; vec2 grad = vec2(0.0);
          float fall = 1.0 - smoothstep(60.0, 130.0, length(p.xz));
          for (int i = 0; i < 5; i++) { vec4 w = WV[i]; float ph = w.y * (p.x + uOff.x) + w.z * (p.z + uOff.y) + w.w * uT; float s = sin(ph), c = cos(ph);
            h += w.x * (s + 0.35 * s * abs(s)); float dh = w.x * c * (1.0 + 0.7 * abs(s)); grad += dh * w.yz; }
          p.y = h * fall; vH = h;
          vN = normalize(vec3(-grad.x * fall, 1.0, -grad.y * fall));
          vW = (modelMatrix * vec4(p, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uS; uniform vec2 uOff; varying vec3 vW; varying vec3 vN; varying float vH; ${NOISE} ${GRADE}
        void main(){ vec3 V = normalize(cameraPosition - vW);
          vec2 tp = (vW.xz + uOff) * 0.6;
          vec3 n = normalize(vN + vec3(vnoise(vec3(tp, uTime * 0.6)) - 0.5, 0.0, vnoise(vec3(tp + 9.0, uTime * 0.6)) - 0.5) * 0.35);
          vec3 sun = normalize(vec3(0.35, 0.22, -1.0));
          float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
          vec3 R = reflect(-V, n);
          vec3 skyc = mix(vec3(0.38, 0.44, 0.52), vec3(0.12, 0.2, 0.32), smoothstep(0.0, 0.6, R.y));
          vec3 deep = vec3(0.01, 0.06, 0.09), sss = vec3(0.04, 0.3, 0.3);
          vec3 c = mix(deep + sss * smoothstep(0.2, 1.4, vH) * 0.5, skyc, fres);
          c += vec3(1.0, 0.85, 0.6) * pow(max(dot(R, sun), 0.0), 220.0) * 3.0;
          // foam on the crests, streaked by the wind
          float fn = fbm(vec3((vW.xz + uOff) * vec2(0.5, 0.25), uTime * 0.2));
          float foam = smoothstep(0.9, 1.5, vH + fn * 0.8);
          c = mix(c, vec3(0.82, 0.86, 0.88), foam * 0.8);
          // haze into the horizon
          float dist = length(vW.xz);
          c = mix(c, vec3(0.4, 0.46, 0.53), smoothstep(40.0, 125.0, dist));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sea.renderOrder = -6;
    this.sea = sea;
    this.world.add(sea);

    // spray thrown up when the ski crashes into a swell
    this.spray = particles(U, { count: 600, min: [-3.5, -0.2, -7], max: [3.5, 3, 1.5], vel: [0, 1.2, 7], sway: 0.6, size: [0.02, 0.05], colors: ['#ffffff', '#dff4ff', '#cfe8ee'], alpha: 0, normal: true });
    this.group.add(this.spray);

    // the jet ski you're riding: nose and handlebars, steady in front of you
    const ski = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20), litMat(U, '#0b5c66', '#e8ecef'));
    hull.scale.set(0.42, 0.2, 1.1); hull.position.set(0, 0.42, -1.0);
    const cowl = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), litMat(U, '#11161c', '#1d2a33'));
    cowl.scale.set(0.24, 0.13, 0.32); cowl.position.set(0, 0.6, -0.55);
    const black = litMat(U, '#121418', '#22262c');
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.74, 12), black);
    bar.rotation.z = Math.PI / 2; bar.position.set(0, 0.86, -0.42);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.3, 12), black);
    stem.position.set(0, 0.72, -0.47); stem.rotation.x = -0.35;
    const grips = [-0.33, 0.33].map((x) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.13, 12), litMat(U, '#2a2f36', '#3a4048')); m.rotation.z = Math.PI / 2; m.position.set(x, 0.86, -0.42); return m; });
    this.bars = new THREE.Group();
    this.bars.position.set(0, 0.86, -0.42);
    for (const m of [bar, ...grips]) { m.position.y -= 0.86; m.position.z += 0.42; this.bars.add(m); }
    ski.add(hull, cowl, stem, this.bars);
    // your hands, drawn as glowing joints and bones whenever the headset sees them
    const CH = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8, 9], [0, 10, 11, 12, 13, 14], [0, 15, 16, 17, 18, 19], [0, 20, 21, 22, 23, 24]];
    this.bones = []; for (const ch of CH) for (let k = 0; k < ch.length - 1; k++) this.bones.push([ch[k], ch[k + 1]]);
    this.handViz = [0, 1].map(() => {
      const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(25 * 3), 3));
      const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.bones.length * 6), 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff1dc, size: 0.016, transparent: true, opacity: 0.95, depthWrite: false }));
      const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffd9b0, transparent: true, opacity: 0.7, depthWrite: false }));
      const g = new THREE.Group(); g.add(pts, lines); g.visible = false; this.group.add(g);
      for (const o of [pts, lines]) o.frustumCulled = false;
      return { g, pg, lg };
    });
    this.yaw = 0; this.steer = 0; this.off = new THREE.Vector2();
    this.ski = ski;
    this.group.add(ski);

    this.S = 0; this.T = 0; this.speed = 9; this.target = 9; this.next = 6;
    this.hc = height(0, 0, 0, 0, 0); this.vy = 0; this.air = false; this.spray0 = 0;
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }

  // show your hands, and steer with the handlebars when both hands hold them
  _hands(dt, hands = INPUT.hands || [], pointers = INPUT.pointers) {
    this.handViz.forEach((v, i) => {
      const h = hands[i];
      v.g.visible = !!h;
      if (!h) return;
      const pa = v.pg.attributes.position, la = v.lg.attributes.position;
      h.joints.forEach((j, k) => { if (j) pa.setXYZ(k, j.x, j.y, j.z); });
      this.bones.forEach(([a, b], k) => { const A = h.joints[a], B = h.joints[b]; if (A && B) { la.setXYZ(k * 2, A.x, A.y, A.z); la.setXYZ(k * 2 + 1, B.x, B.y, B.z); } });
      pa.needsUpdate = true; la.needsUpdate = true;
    });
    // where are the two grips held? hands (palm centre) or controllers
    const grips = hands.map((h) => h.joints[10] || h.joints[0]).filter(Boolean);
    if (grips.length < 2) for (const p of pointers) if (!p.tip) grips.push(p.origin);
    let target = 0;
    if (grips.length >= 2) {
      const [a, b] = grips.slice(0, 2).sort((p, q) => p.x - q.x);
      const centre = new THREE.Vector3(0, 0.86, -0.42);
      const near = a.distanceTo(centre) < 0.6 && b.distanceTo(centre) < 0.6;
      if (near) target = Math.max(-0.7, Math.min(0.7, Math.atan2(a.z - b.z, b.x - a.x)));
    }
    this.steer = damp(this.steer, target, 6, dt);
    this.bars.rotation.y = this.steer * 0.8;
  }

  update(dt) {
    const U = this.uniforms;
    // throttle: cruise, then open up across the swells
    this.next -= dt;
    if (this.next <= 0) { this.target = [6, 8, 10, 13][Math.floor(Math.random() * 4)]; this.next = 7 + Math.random() * 8; }
    this.speed = damp(this.speed, this.target, 0.4, dt);
    if (!this.testHands) this._hands(dt); else this._hands(dt, this.testHands, []);
    // steering turns your heading; you travel along it
    this.yaw += this.steer * dt * (0.5 + this.speed * 0.05);
    const fx = Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = Math.sin(this.yaw);
    this.off.x += fx * this.speed * dt; this.off.y += fz * this.speed * dt;
    this.S += this.speed * dt; this.T += dt;
    U.uS.value = this.S; U.uT.value = this.T; U.uOff.value.copy(this.off);
    const H = (x, z) => height(x, z, this.off.x, this.off.y, this.T);
    // ride the water under the ski: follow the surface, but leave it briefly over the crests
    const h = H(fx * 0.6, fz * 0.6);
    const hAhead = H(fx * 2.6, fz * 2.6), hSide = H(rx * 0.8 + fx * 0.6, rz * 0.8 + fz * 0.6) - H(-rx * 0.8 + fx * 0.6, -rz * 0.8 + fz * 0.6);
    const g = 9.8;
    if (!this.air) {
      const vy = (h - this.hc) / Math.max(dt, 1e-3);
      this.hc = h;
      if (this.vy > 1.6 && vy < this.vy - 0.8) this.air = true;   // launched off a crest
      this.vy = vy;
    } else {
      this.vy -= g * dt * 0.55;
      this.hc += this.vy * dt;
      if (this.hc <= h) {
        // crash down into the next swell
        const hit = Math.min(1, Math.abs(this.vy) / 4);
        this.air = false; this.hc = h; this.vy = 0;
        this.spray0 = 0.6 + hit * 0.6;
        this._sfx('thud', { pan: 0, gain: 0.7 + hit, decay: 0.4 });
        this._sfx('hiss', { pan: Math.random() - 0.5, gain: 0.35 + hit * 0.3, dur: 1.4, freq: 2500 });
      }
    }
    // the sea heaves and tilts gently around the steady ski
    this.world.position.y = damp(this.world.position.y, -this.hc - 0.12, 8, dt);
    const pitch = Math.atan2(hAhead - h, 2.0) * 0.45, roll = Math.atan(hSide / 1.6) * 0.35;
    this.world.rotation.order = 'XZY';
    this.world.rotation.y = this.yaw;
    this.world.rotation.x = damp(this.world.rotation.x, -pitch, 3, dt);
    this.world.rotation.z = damp(this.world.rotation.z, -roll - this.steer * 0.12, 3, dt);   // lean into the turn
    this.ski.position.y = damp(this.ski.position.y, Math.sin(this.T * 7) * 0.006 * this.speed / 10, 10, dt);
    // spray bursts on each crash, with a fine mist at speed
    this.spray0 *= Math.exp(-dt * 1.8);
    this.spray.userData.u.uAlpha.value = Math.min(0.9, this.spray0 + (this.speed - 6) * 0.015);
    this.spray.userData.u.uBoost.value = this.speed * 0.15;
  }
}
