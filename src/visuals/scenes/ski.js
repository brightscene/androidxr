import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, damp } from '../common.js';
import { particles } from './kit.js';
import { mergeGeos } from './nature.js';

// ===================================================================== Ski run
// High in the mountains in heavy snowfall, you carve down a wide slope at
// speed, swinging left and right in long zig-zag turns between dark pines,
// snow streaming past, peaks fading in and out of the white. Your ski tips
// stay in view below you, steady, while the slope swings around them.
const SLOPE = 0.32;      // how steep (radians)
const EYE = 1.6;

export class SkiScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uS: { value: 0 }, uX: { value: 0 }, uPitch: { value: 0.3 } });
    this.world = new THREE.Group();
    this.group.add(this.world);

    // sky: heavy grey-white snow cloud, the ghost of peaks on the horizon
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec3 vDir; ${NOISE} ${GRADE}
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 c = mix(vec3(0.62, 0.65, 0.7), vec3(0.36, 0.39, 0.45), smoothstep(0.0, 0.6, h));
          float az = atan(d.z, d.x);
          float ridge = 0.06 + 0.11 * fbm(vec3(az * 3.0, 0.0, 2.0)) + 0.05 * fbm(vec3(az * 9.0, 0.0, 5.0));
          float peaks = smoothstep(ridge + 0.004, ridge - 0.004, h + 0.12);
          vec3 rock = mix(vec3(0.42, 0.45, 0.5), vec3(0.85, 0.87, 0.9), smoothstep(0.4, 0.7, fbm(vec3(az * 20.0, h * 30.0, 1.0))));
          c = mix(c, rock, peaks * 0.55);
          c = mix(c, vec3(0.7, 0.72, 0.76), smoothstep(0.02, -0.15, h));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    // the slope: rolling snow with soft moguls, carved tracks and sparkle
    const g = new THREE.PlaneGeometry(220, 260, 160, 180).rotateX(-Math.PI / 2).translate(0, 0, -100);
    const snow = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, uniforms: U,
      vertexShader: /* glsl */ `uniform float uS, uX, uPitch; varying vec3 vW; varying float vH; varying vec2 vQ; ${NOISE}
        float hgt(vec2 q){ return (fbm(vec3(q * 0.035, 1.0)) - 0.5) * 3.0 + (vnoise(vec3(q * 0.25, 2.0)) - 0.5) * 0.5; }
        void main(){ vec3 p = position; vec2 q = vec2(p.x + uX, p.z - uS);
          float h = hgt(q) * smoothstep(1.0, 12.0, length(p.xz));   // keep it smooth under your skis
          p.y += h + p.z * tan(uPitch); vH = h; vQ = q;
          vW = (modelMatrix * vec4(p, 1.0)).xyz;
          gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uFade, uTime; varying vec3 vW; varying float vH; varying vec2 vQ; ${NOISE} ${GRADE}
        void main(){
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
          float lit = 0.75 + 0.25 * dot(n, normalize(vec3(-0.3, 1.0, 0.4)));
          vec3 c = mix(vec3(0.72, 0.78, 0.88), vec3(0.97, 0.98, 1.0), lit);
          // old ski tracks curving down the slope
          float tr = sin(vQ.x * 0.35 + sin(vQ.y * 0.05) * 3.0);
          c -= vec3(0.05, 0.04, 0.02) * smoothstep(0.96, 1.0, abs(tr)) * 0.6;
          // sparkle
          c += vec3(1.0) * pow(vnoise(vec3(vQ * 6.0, floor(uTime * 4.0))), 30.0) * 2.0;
          // snowfall haze
          float dist = length(vW - cameraPosition);
          c = mix(c, vec3(0.66, 0.69, 0.74), 1.0 - exp(-dist * 0.022));
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    snow.renderOrder = -6;
    this.world.add(snow);

    // pines along both sides of the piste, streaming past
    this.trees = [];
    // a snowy pine: a trunk and ragged, drooping tiers of branches
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.05, 0.08, 0.3, 7).translate(0, 0.15, 0);
    trunk.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(trunk.attributes.position.count).fill(0), 1));
    parts.push(trunk);
    const tiers = 6;
    for (let k = 0; k < tiers; k++) {
      const f = k / tiers;
      const r = 0.48 * (1 - f * 0.8), h = 0.42 - f * 0.12, y = 0.12 + f * 0.72;
      const cone = new THREE.ConeGeometry(r, h, 11, 2, true).translate(0, y + h / 2, 0);
      const pa = cone.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), z = pa.getZ(i), yy = pa.getY(i);
        const rr = Math.hypot(x, z);
        if (rr > r * 0.6) {
          // ragged branch tips that droop a little
          const k2 = 0.8 + Math.random() * 0.45;
          pa.setX(i, x * k2); pa.setZ(i, z * k2); pa.setY(i, yy - Math.random() * 0.06);
        }
      }
      cone.computeVertexNormals();
      cone.setAttribute('aPart', new THREE.Float32BufferAttribute(new Array(pa.count).fill(1), 1));
      parts.push(cone);
    }
    const tg = mergeGeos(parts.map((g) => { const n = g.toNonIndexed(); return n; }));
    tg.computeVertexNormals();
    const tm = new THREE.ShaderMaterial({
      uniforms: U,
      side: THREE.DoubleSide,
      vertexShader: 'attribute float aPart; varying vec3 vW; varying float vY; varying vec3 vN; varying float vPart; void main(){ vY = position.y; vPart = aPart; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal); vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vW; varying float vY; varying vec3 vN; varying float vPart; ${NOISE} ${GRADE}
        void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
          // needles: dark green, textured; snow settles wherever the branches face up
          float needles = vnoise(vW * 18.0) * 0.5 + vnoise(vW * 6.0) * 0.5;
          vec3 c = mix(vec3(0.02, 0.06, 0.035), vec3(0.07, 0.15, 0.08), needles);
          float snow = smoothstep(0.62, 0.8, vnoise(vW * 3.0) * 0.7 + vnoise(vW * 9.0) * 0.3) * smoothstep(0.5, 0.85, n.y);
          c = mix(c, vec3(0.86, 0.89, 0.94) * (0.85 + 0.15 * needles), snow * 0.85);
          c *= 0.55 + 0.45 * max(n.y, 0.0) + 0.15;
          if (vPart < 0.5) c = vec3(0.12, 0.08, 0.05) * (0.7 + 0.3 * needles);
          float dist = length(vW - cameraPosition);
          c = mix(c, vec3(0.66, 0.69, 0.74), 1.0 - exp(-dist * 0.022));
          gl_FragColor = vec4(grade(c), uFade); }`,
    });
    this.treeMesh = new THREE.InstancedMesh(tg, tm, 160);
    this.treeMesh.frustumCulled = false;
    for (let i = 0; i < 160; i++) {
      const side = i % 2 ? 1 : -1;
      const h = 6 + Math.random() * 10;
      this.trees.push({ x: side * (14 + Math.random() * 40), z: -Math.random() * 200, h, w: h * (0.32 + Math.random() * 0.12), q: new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * 0.06, Math.random() * 6.28, (Math.random() - 0.5) * 0.06)) });
    }
    this.world.add(this.treeMesh);

    // heavy snowfall rushing toward you
    this.flakes = particles(U, { count: 2600, min: [-16, -2, -40], max: [16, 14, 4], vel: [1.5, -2.5, 14], sway: 0.6, size: [0.03, 0.065], colors: ['#ffffff', '#eef4ff'], alpha: 0.85, normal: true });
    this.group.add(this.flakes);

    // your ski tips, just below and ahead
    const skiMat = new THREE.ShaderMaterial({
      uniforms: U, vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade; varying vec3 vP; ${NOISE} ${GRADE}
        void main(){ vec3 c = mix(vec3(0.9, 0.12, 0.1), vec3(0.95, 0.95, 0.97), step(0.0, sin(vP.z * 9.0))); gl_FragColor = vec4(grade(c * 0.8), uFade); }`,
    });
    this.skis = new THREE.Group();
    for (const x of [-0.13, 0.13]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 1.4).translate(0, 0, -0.7), skiMat);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.025, 0.2).translate(0, 0, -0.1), skiMat);
      tip.position.set(0, 0, -1.4); tip.rotation.x = 0.5;
      s.add(tip); s.position.set(x, 0.02, 0.1);
      this.skis.add(s);
    }
    this.group.add(this.skis);

    this.S = 0; this.X = 0; this.phase = 0; this.speed = 12; this.target = 12; this.next = 6; this.yaw = 0; this.lastSide = 0;
    this.M = new THREE.Matrix4(); this.TP = new THREE.Vector3(); this.TS = new THREE.Vector3();
    this.pitch = 0.3; this.pitchT = 0.3; this.nextPitch = 10;
  }
  update(dt, t) {
    const U = this.uniforms;
    this.next -= dt;
    if (this.next <= 0) { this.target = [9, 12, 15, 18][Math.floor(Math.random() * 4)]; this.next = 6 + Math.random() * 6; }
    // steep pitches and flatter run-outs; steeper is faster
    this.nextPitch -= dt;
    if (this.nextPitch <= 0) { this.pitchT = [0.2, 0.32, 0.42, 0.5][Math.floor(Math.random() * 4)]; this.nextPitch = 8 + Math.random() * 8; }
    this.pitch = damp(this.pitch, this.pitchT, 0.35, dt);
    this.speed = damp(this.speed, this.target * (0.6 + this.pitch * 1.6), 0.5, dt);
    // carve: long zig-zag turns across the fall line
    const turnRate = 0.42 + this.speed * 0.012;
    this.phase += dt * turnRate;
    const across = Math.sin(this.phase);
    const heading = Math.cos(this.phase) * 0.45;              // radians off straight downhill
    const vx = Math.sin(heading) * this.speed, vz = Math.cos(heading) * this.speed;
    this.X += vx * dt; this.S += vz * dt;
    U.uS.value = this.S; U.uX.value = this.X;
    // the slope turns around you as you carve, and leans a little into each turn
    this.yaw = damp(this.yaw, heading * 0.75, 4, dt);
    this.world.rotation.set(0, 0, 0);
    this.world.rotation.order = 'YXZ';
    this.world.rotation.y = this.yaw;
    this.world.rotation.x = 0;
    U.uPitch.value = this.pitch;   // the slope falls steeply away ahead of you
    this.world.rotation.z = -Math.cos(this.phase) * 0.025;
    this.skis.rotation.y = -Math.sin(this.phase) * 0.12;
    this.flakes.userData.u.uVel.value.set(-vx * 0.6 + 1.5, -2.5, vz);
    // trees stream past
    for (let i = 0; i < this.trees.length; i++) {
      const tr = this.trees[i];
      let z = ((tr.z + this.S) % 200 + 200) % 200 - 200 + 10;
      let x = tr.x - this.X;
      x = ((x + 60) % 120 + 120) % 120 - 60;
      if (Math.abs(x) < 9) x = Math.sign(x || 1) * 9;
      this.M.compose(this.TP.set(x, -0.8 + z * Math.tan(this.pitch), z), tr.q, this.TS.set(tr.w, tr.h, tr.w));
      this.treeMesh.setMatrixAt(i, this.M);
    }
    this.treeMesh.instanceMatrix.needsUpdate = true;
    // the hiss of the skis as each turn bites
    const side = Math.sign(across);
    if (side !== this.lastSide && this.fade > 0.5) { SFX.play('hiss', { pan: side * 0.5, gain: 0.3, dur: 1.6, freq: 1800 }); }
    this.lastSide = side;
  }
}
