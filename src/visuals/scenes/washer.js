import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== Inside the washing machine
// You float at the heart of a front-loader's drum. Perforated stainless steel
// curves all around you with its lifting paddles; ahead the round glass door
// shows a warm, blurry room outside. Water floods in with suds, the drum turns
// one way then the other and the washing tumbles past, then it drains and
// spins up, pressing everything to the wall, before slowing to a stop. The
// door and the water stay level, so it stays comfortable.
const R = 2.3, FRONT = -3.2, BACK = 2.6, EYE = 1.6;
const PHASES = [['fill', 14], ['wash', 42], ['drain', 8], ['spin', 18], ['slow', 7], ['rest', 5]];
const CYCLE = PHASES.reduce((s, p) => s + p[1], 0);

export class WasherScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uAng: { value: 0 }, uSpin: { value: 0 }, uLevel: { value: -R }, uSlosh: { value: 0 } });
    this.rig = new THREE.Group();
    this.rig.position.y = EYE;
    this.group.add(this.rig);

    // the drum: brushed, perforated steel with three lifting paddles
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(R, R, BACK - FRONT, 96, 16, true).rotateX(Math.PI / 2).translate(0, 0, (BACK + FRONT) / 2), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: U,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uAng, uSpin, uLevel; varying vec3 vP; ${NOISE} ${GRADE}
        void main(){
          float a = atan(vP.y, vP.x) - uAng;                 // the drum's own angle, turning
          float u = a * ${R.toFixed(2)}, z = vP.z;
          // perforations: little dimpled holes in neat rows, smeared as it spins fast
          vec2 g = vec2(u / 0.16, z / 0.16); vec2 f = fract(g) - 0.5;
          f.x *= 1.0 + uSpin * 6.0;
          float hole = smoothstep(0.17, 0.12, length(f));
          float brushed = 0.9 + 0.1 * vnoise(vec3(u * 40.0, z * 2.0, 1.0));
          // light from the door glows on the steel, brighter toward the front
          float lightF = 0.35 + 0.65 * smoothstep(${BACK.toFixed(1)}, ${FRONT.toFixed(1)}, z);
          float top = 0.6 + 0.4 * smoothstep(-1.0, 1.0, vP.y);
          vec3 c = vec3(0.62, 0.65, 0.7) * brushed * lightF * top;
          c = mix(c, vec3(0.05, 0.06, 0.08), hole * (1.0 - uSpin * 0.7));
          c += vec3(1.0, 0.97, 0.9) * pow(max(0.0, sin(a * 2.0 + 1.0)), 30.0) * 0.25 * lightF;   // a soft sheen
          // the three paddles
          float pd = abs(fract(a / 6.28318 * 3.0) - 0.5);
          c = mix(c, vec3(0.78, 0.8, 0.84) * lightF, smoothstep(0.035, 0.02, pd) * (1.0 - uSpin * 0.6));
          // below the water line the steel looks blue-green and wavers
          float under = smoothstep(uLevel + 0.02, uLevel - 0.02, vP.y);
          c = mix(c, c * vec3(0.45, 0.7, 0.8) + vec3(0.0, 0.05, 0.07), under);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    this.rig.add(drum);
    // the back of the drum: steel with a turning star of ribs
    const back = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.ShaderMaterial({
      uniforms: U, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uAng, uLevel; varying vec2 vP; ${NOISE} ${GRADE}
        void main(){ float r = length(vP), a = atan(vP.y, vP.x) - uAng;
          float rib = smoothstep(0.06, 0.0, abs(fract(a / 6.28318 * 6.0) - 0.5) - 0.42) * smoothstep(0.3, 0.5, r);
          vec3 c = vec3(0.3, 0.32, 0.35) * (0.8 + 0.2 * vnoise(vec3(vP * 20.0, 2.0))) + vec3(0.12) * rib;
          c += vec3(0.25) * smoothstep(0.3, 0.25, r);
          c = mix(c, c * vec3(0.45, 0.7, 0.8), smoothstep(uLevel + 0.02, uLevel - 0.02, vP.y));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    back.position.z = BACK; back.rotation.y = Math.PI;
    this.rig.add(back);
    // the door: a rubber seal round thick curved glass, a warm room blurred beyond
    const seal = new THREE.Mesh(new THREE.TorusGeometry(R - 0.15, 0.22, 16, 96), new THREE.MeshBasicMaterial({ color: 0x1e2226 }));
    seal.position.z = FRONT;
    this.rig.add(seal);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(R - 0.3, 96), new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uLevel, uSpin; varying vec2 vP; ${NOISE} ${GRADE}
        void main(){ float r = length(vP) / ${(R - 0.3).toFixed(2)};
          // a warm laundry room, out of focus: a window, a lamp, tiled walls
          vec3 room = mix(vec3(0.75, 0.62, 0.45), vec3(0.95, 0.86, 0.7), smoothstep(-1.0, 1.0, vP.y));
          room += vec3(1.0, 0.85, 0.6) * exp(-length(vP - vec2(0.7, 0.9)) * 2.5) * 0.8;
          room = mix(room, vec3(0.7, 0.85, 1.0), smoothstep(0.5, 0.45, abs(vP.x + 0.8)) * smoothstep(0.6, 0.5, abs(vP.y - 0.5)) * 0.6);
          room *= 0.85 + 0.15 * fbm(vec3(vP * 1.5, 2.0));
          // the glass bowl: darker and greener at its thick rim, a bright reflection arc
          vec3 c = room * mix(1.0, 0.45, smoothstep(0.6, 1.0, r)) * vec3(0.9, 1.0, 0.97);
          c += vec3(1.0) * smoothstep(0.02, 0.0, abs(r - 0.78)) * smoothstep(0.2, 0.9, vP.y / ${R.toFixed(1)} + 0.5) * 0.35;
          // water and suds splashing on the inside of the glass
          float wet = smoothstep(0.55, 0.75, fbm(vec3(vP * 3.0, uTime * 0.5))) * smoothstep(uLevel + 0.6, uLevel - 0.2, vP.y);
          c = mix(c, vec3(0.85, 0.92, 0.95), wet * 0.5);
          c = mix(c, vec3(0.3, 0.5, 0.55), smoothstep(uLevel + 0.02, uLevel - 0.02, vP.y) * 0.5);
          gl_FragColor = vec4(grade(c), 0.92 * uFade); }`,
    }));
    glass.position.z = FRONT + 0.05;
    this.rig.add(glass);

    // the water: a level surface that rises and drains, sloshing, foamy
    const water = new THREE.Mesh(new THREE.PlaneGeometry(2 * R, BACK - FRONT, 60, 60).rotateX(-Math.PI / 2).translate(0, 0, (BACK + FRONT) / 2), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: U,
      vertexShader: /* glsl */ `uniform float uLevel, uSlosh, uTime; varying vec3 vP; ${NOISE}
        void main(){ vec3 p = position; p.y = uLevel + sin(p.x * 1.5 + uTime * 2.0) * 0.05 * uSlosh + p.x * 0.12 * uSlosh * sin(uTime * 0.8) + (vnoise(vec3(p.xz * 2.0, uTime)) - 0.5) * 0.06;
          vP = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uLevel; varying vec3 vP; ${NOISE} ${GRADE}
        void main(){ if (vP.x * vP.x + vP.y * vP.y > ${(R * R * 0.995).toFixed(3)} || uLevel < -${(R - 0.05).toFixed(2)}) discard;
          float foam = smoothstep(0.5, 0.7, fbm(vec3(vP.xz * 2.5, uTime * 0.3)));
          vec3 c = mix(vec3(0.25, 0.55, 0.65), vec3(0.92, 0.95, 0.97), foam * 0.8);
          c += vec3(1.0) * pow(vnoise(vec3(vP.xz * 8.0, uTime * 2.0)), 12.0) * 0.6;
          gl_FragColor = vec4(grade(c), (0.6 + foam * 0.35) * uFade); }`,
    }));
    this.rig.add(water);
    this.suds = particles(U, { count: 260, min: [-1.8, -2.2, -3], max: [1.8, -0.4, 2.4], vel: [0, 0.15, 0], sway: 0.3, size: [0.02, 0.07], shape: 'bubble', colors: ['#ffffff', '#e8f6ff'], alpha: 0 });
    this.rig.add(this.suds);

    // the washing: soft lumps of fabric in different colours and prints
    const fabric = (base, stripe) => new THREE.ShaderMaterial({
      uniforms: { ...U, uA: { value: new THREE.Color(base) }, uB: { value: new THREE.Color(stripe) } },
      vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uA, uB; uniform float uFade; varying vec3 vN; varying vec3 vP; ${NOISE} ${GRADE}
        void main(){ float l = 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(0.0, 0.3, 1.0))), 0.0);
          vec3 c = mix(uA, uB, step(0.5, fract(vP.x * 6.0 + vP.y * 2.0))) * l * (0.85 + 0.15 * vnoise(vP * 30.0));
          gl_FragColor = vec4(grade(c), uFade); }`,
    });
    const looks = [['#c0392b', '#e8e8e8'], ['#2e86de', '#2e86de'], ['#f5f5f5', '#f5f5f5'], ['#27ae60', '#f1c40f'], ['#8e44ad', '#ff8fc8'], ['#f39c12', '#f39c12'], ['#34495e', '#e0e0e0']];
    this.clothes = looks.map(([a, b], i) => {
      const g = new THREE.SphereGeometry(0.42, 24, 16);
      const pa = g.attributes.position;
      for (let k = 0; k < pa.count; k++) {
        const x = pa.getX(k), y = pa.getY(k), zz = pa.getZ(k);
        const n = 0.55 + 0.45 * Math.sin(x * 7 + i) * Math.cos(y * 6 + i * 2) + 0.2 * Math.sin(zz * 9);
        pa.setXYZ(k, x * (1.2 + 0.4 * Math.sin(i)), y * 0.45 * n, zz * (0.9 + 0.3 * Math.cos(i)));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, fabric(a, b));
      this.rig.add(m);
      return { m, phase: i / looks.length * Math.PI * 2, z: FRONT + 0.9 + (i % 4) * 1.2, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()) };
    });

    this.t = 0; this.ang = 0; this.vel = 0; this.dir = 1; this.flip = 8; this.phaseName = '';
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }
  update(dt) {
    const U = this.uniforms;
    this.t = (this.t + dt) % CYCLE;
    let k = this.t, ph = 'fill', pt = 0;
    for (const [name, len] of PHASES) { if (k < len) { ph = name; pt = k / len; break; } k -= len; }
    if (ph !== this.phaseName) {
      this.phaseName = ph;
      if (ph === 'fill') this._sfx('hiss', { pan: 0, gain: 0.35, dur: 12, freq: 900 });
      if (ph === 'spin') this._sfx('whoosh', { pan: 0, dur: 6, gain: 0.5 });
      if (ph === 'drain') this._sfx('hiss', { pan: 0.3, gain: 0.25, dur: 7, freq: 500 });
    }
    // water level: fills, holds, drains
    const full = -R + 0.9, empty = -R - 0.1;
    const level = ph === 'fill' ? empty + (full - empty) * pt : ph === 'wash' ? full : ph === 'drain' ? full + (empty - full) * pt : empty;
    U.uLevel.value = damp(U.uLevel.value, level, 2, dt);
    // drum speed (radians/s): gentle back-and-forth tumbling, then a fast spin
    let target = 0;
    if (ph === 'fill') target = 0.6 * this.dir;
    if (ph === 'wash') { this.flip -= dt; if (this.flip <= 0) { this.dir *= -1; this.flip = 7 + Math.random() * 3; } target = 1.6 * this.dir; }
    if (ph === 'drain') target = 0.8;
    if (ph === 'spin') target = 2 + 5 * Math.min(1, pt * 2);
    if (ph === 'slow') target = 7 * (1 - pt);
    this.vel = damp(this.vel, target, ph === 'wash' ? 1.2 : 0.8, dt);
    this.ang += this.vel * dt;
    U.uAng.value = this.ang;
    U.uSpin.value = Math.min(1, Math.max(0, (Math.abs(this.vel) - 2) / 5));
    U.uSlosh.value = damp(U.uSlosh.value, Math.min(1, Math.abs(this.vel)), 1, dt);
    this.suds.userData.u.uAlpha.value = U.uLevel.value > -R + 0.2 ? 0.6 : 0.1;
    // the washing: lifted by the paddles, tumbling back down; pressed to the wall in the spin
    const pinned = U.uSpin.value;
    for (const c of this.clothes) {
      const lift = (this.ang * 0.9 + c.phase) % (Math.PI * 2);
      const tumbleA = -Math.PI / 2 + Math.sin(lift) * 1.4;                    // rises up the side, then falls back
      const wallA = this.ang + c.phase;                                       // stuck to the turning wall
      const a = tumbleA * (1 - pinned) + wallA * pinned;
      const r = (R - 0.55) * (0.75 + 0.25 * pinned) + Math.sin(lift * 2) * 0.15 * (1 - pinned);
      c.m.position.set(Math.cos(a) * r, Math.sin(a) * r, c.z + Math.sin(this.ang * 0.3 + c.phase) * 0.3);
      c.m.rotation.x += dt * c.spin.x * (1.5 - pinned);
      c.m.rotation.y += dt * c.spin.y * (1.5 - pinned);
      c.m.rotation.z = pinned ? a + Math.PI / 2 : c.m.rotation.z + dt * c.spin.z;
    }
  }
}
