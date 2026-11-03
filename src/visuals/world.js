import * as THREE from 'three';
import { U, NOISE, GRADE, POINT_SIZE, SOFT_DOT, additive, damp } from './common.js';
import { Voyage } from './voyage.js';

// Persistent environment: sky dome, stars, drifting motes, and the
// spatial "sparks" that bloom wherever a note is placed in 3D audio space.
export class World {
  constructor(scene, camera) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.nebula = { value: 0.5 };
    this._sky();
    this._stars();
    this._lasers();
    this.voyage = new Voyage(scene, camera);
    this._motes();
    this.sparks = new Sparks(this.root);
  }

  setPassthrough(on) {
    this.passthrough = on;
    this.stars.material.uniforms.uDim.value = on ? 0.35 : 1;
    this._apply();
  }

  // 'full' everything; 'stars' a quiet starry sky only; 'off' nothing at all (black, or your room in passthrough)
  setMode(mode) {
    this.mode = mode;
    this._apply();
  }

  _apply() {
    const m = this.mode || 'full';
    const space = m === 'full' || m === 'stars';
    this.sky.visible = !this.passthrough && space;
    this.stars.visible = space;
    for (const o of [this.lasers, this.motes, this.voyage.stars, this.voyage.streaks]) o.visible = m === 'full';
    this.sparks.points.visible = m === 'full';
    if (!this.sparks.points.visible) for (const r of this.sparks.rings) r.visible = false;
  }

  _sky() {
    const geo = new THREE.SphereGeometry(80, 48, 32);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { ...U, uNeb: this.nebula },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      // Aura-projector style: slowly turning, domain-warped nebula in three hues.
      fragmentShader: /* glsl */ `
        uniform vec3 uC0, uC1, uC2; uniform float uTime, uEnergy, uBreath, uTravel, uNeb, uDive;
        varying vec3 vDir;
        ${NOISE}
        ${GRADE}
        vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }
        void main(){
          vec3 d = rotY(vDir, uTime * 0.006 + uTravel * 0.0012);
          float h = vDir.y;
          vec3 col = mix(uC0 * 0.5, uC0, smoothstep(-0.5, 0.3, h));
          vec3 q = d * 1.8 + vec3(0.0, uTime * 0.004, 0.0);
          vec3 w = vec3(fbm(q + 1.7), fbm(q + 9.2), fbm(q + 4.1));
          float n = fbm(q + w * 1.6 + uTravel * 0.002);
          float n2 = fbm(d * 6.0 + w * 2.0);
          float cloud = smoothstep(0.38, 0.85, n);
          vec3 tint = mix(uC1, uC2, smoothstep(0.3, 0.8, w.x));
          tint = mix(tint, vec3(uC1.b, uC1.r * 0.6, uC2.g) * 1.2, smoothstep(0.55, 0.9, w.y) * 0.5);
          float glow = cloud * (0.35 + 0.65 * n2);
          col += tint * glow * uNeb * (0.35 + uEnergy * 0.35 + uBreath * 0.1 + uDive * 0.4);
          col += uC2 * pow(cloud, 3.0) * uNeb * 0.25;
          col += uC1 * pow(max(0.0, 1.0 - abs(h)), 6.0) * 0.1;
          gl_FragColor = vec4(grade(col), 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.root.add(this.sky);
  }

  _stars() {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.9 + 0.05 * (Math.random() - 0.5);
      v.normalize().multiplyScalar(55 + Math.random() * 15);
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = additive({
      uniforms: { ...U, uDim: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uViewH; varying float vA;
        ${POINT_SIZE}
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.4 + aSeed * 1.6) + aSeed * 40.0));
          gl_PointSize = max(1.0, pointPx(0.10 + aSeed * 0.22, mv));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC2; uniform float uDim; varying float vA;
        ${SOFT_DOT}
        void main(){ gl_FragColor = vec4(mix(vec3(1.0), uC2, 0.3) * softDot() * vA * uDim, 1.0); }`,
    });
    this.stars = new THREE.Points(g, mat);
    this.stars.renderOrder = -9;
    this.root.add(this.stars);
  }

  // Laser-projector stars: tiny sharp points on the dome that sparkle.
  _lasers() {
    const n = 1400;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3().randomDirection();
      v.y = Math.abs(v.y) * 0.95 + 0.02;
      v.normalize().multiplyScalar(30);
      pos.set([v.x, v.y, v.z], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.lasers = new THREE.Points(g, additive({
      uniforms: { ...U, uNeb: this.nebula },
      vertexShader: /* glsl */ `attribute float aSeed; uniform float uTime, uViewH, uTravel; varying float vA; varying float vS;
        ${POINT_SIZE}
        void main(){
          float a = uTime * 0.006 + uTravel * 0.0012;
          vec3 p = vec3(cos(a)*position.x + sin(a)*position.z, position.y, -sin(a)*position.x + cos(a)*position.z);
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          float tw = sin(uTime * (1.5 + aSeed * 4.0) + aSeed * 60.0);
          vA = smoothstep(0.2, 1.0, tw) ;
          vS = aSeed;
          gl_PointSize = max(1.5, pointPx(0.05, mv));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `uniform vec3 uC2; uniform float uNeb; varying float vA; varying float vS;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d);
          vec3 c = vS < 0.55 ? vec3(0.45, 1.0, 0.6) : (vS < 0.8 ? uC2 : vec3(1.0));
          gl_FragColor = vec4(c * a * vA * (0.4 + uNeb * 0.6), 1.0); }`,
    }));
    this.root.add(this.lasers);
  }

  setNebula(v) { this.nebulaTarget = v; }

  _motes() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = 1.2 + Math.random() * 9;
      const a = Math.random() * Math.PI * 2;
      pos.set([Math.cos(a) * r, Math.random() * 5, Math.sin(a) * r], i * 3);
      seed[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = additive({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime, uViewH, uBreath, uEnergy; varying float vA;
        ${POINT_SIZE}
        void main(){
          vec3 p = position;
          p.y = mod(p.y + uTime * (0.03 + aSeed * 0.05), 5.0);
          p.x += sin(uTime * 0.2 + aSeed * 30.0) * 0.3;
          p.z += cos(uTime * 0.17 + aSeed * 21.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vA = smoothstep(0.0, 0.8, p.y) * smoothstep(5.0, 3.5, p.y) * (0.25 + uEnergy * 0.5 + uBreath * 0.25);
          gl_PointSize = pointPx(0.025 + aSeed * 0.03, mv);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC2; varying float vA;
        ${SOFT_DOT}
        void main(){ gl_FragColor = vec4(uC2 * softDot() * vA, 1.0); }`,
    });
    this.motes = new THREE.Points(g, mat);
    this.root.add(this.motes);
  }

  update(dt, t, head) {
    this.nebula.value = damp(this.nebula.value, this.mode && this.mode !== 'full' ? 0 : this.nebulaTarget ?? 0.5, 0.6, dt);
    this.voyage.update(dt);
    this.sky.position.copy(head);
    this.stars.position.copy(head);
    this.lasers.position.copy(head);
    this.sparks.update(dt, t, head);
  }
}

// --------------------------------------------------------------------------
// Sparks: a glow, an expanding ring and a burst of particles at a 3D point.
class Sparks {
  constructor(parent) {
    this.t = 0;
    // particle burst pool (GPU-animated)
    this.N = 1600;
    this.cursor = 0;
    const g = new THREE.BufferGeometry();
    this.aOrigin = new THREE.BufferAttribute(new Float32Array(this.N * 3), 3);
    this.aVel = new THREE.BufferAttribute(new Float32Array(this.N * 3), 3);
    this.aBirth = new THREE.BufferAttribute(new Float32Array(this.N).fill(-999), 1);
    this.aSize = new THREE.BufferAttribute(new Float32Array(this.N), 1);
    for (const a of [this.aOrigin, this.aVel, this.aBirth, this.aSize]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aOrigin);
    g.setAttribute('aVel', this.aVel);
    g.setAttribute('aBirth', this.aBirth);
    g.setAttribute('aSize', this.aSize);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1000);
    this.points = new THREE.Points(g, additive({
      uniforms: { ...U },
      vertexShader: /* glsl */ `
        attribute vec3 aVel; attribute float aBirth, aSize;
        uniform float uTime, uViewH; varying float vA; varying float vK;
        ${POINT_SIZE}
        void main(){
          float age = uTime - aBirth;
          float life = 3.2;
          vec3 p = position + aVel * (1.0 - exp(-age * 1.6)) / 1.6 + vec3(0.0, age * 0.05, 0.0);
          vec4 mv = modelViewMatrix * vec4(p,1.0);
          vA = age < 0.0 ? 0.0 : (1.0 - smoothstep(0.0, life, age)) * smoothstep(0.0, 0.05, age);
          vK = aSize;
          gl_PointSize = pointPx(aSize, mv);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uC1, uC2; varying float vA; varying float vK;
        ${SOFT_DOT}
        void main(){ vec3 c = mix(uC2, vec3(1.0), step(0.2, vK) * 0.4); gl_FragColor = vec4(c * softDot() * vA, 1.0); }`,
    }));
    parent.add(this.points);

    // ring pool
    this.rings = [];
    const rg = new THREE.RingGeometry(0.92, 1, 64);
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false;
      m.userData.birth = -999;
      parent.add(m);
      this.rings.push(m);
    }
    this.ringCursor = 0;
  }

  emit(pos, vel = 0.7, color) {
    const t = this.t;
    const count = Math.round(10 + vel * 18);
    for (let k = 0; k < count; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.N;
      const d = new THREE.Vector3().randomDirection().multiplyScalar(0.15 + Math.random() * 0.45 * vel);
      this.aOrigin.setXYZ(i, pos[0], pos[1], pos[2]);
      this.aVel.setXYZ(i, d.x, d.y, d.z);
      this.aBirth.setX(i, t + Math.random() * 0.04);
      this.aSize.setX(i, k === 0 ? 0.35 + vel * 0.3 : 0.02 + Math.random() * 0.03);
    }
    for (const a of [this.aOrigin, this.aVel, this.aBirth, this.aSize]) a.needsUpdate = true;

    const ring = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % this.rings.length;
    ring.position.set(pos[0], pos[1], pos[2]);
    ring.userData.birth = t;
    ring.userData.vel = vel;
    ring.material.color.copy(color || U.uC2.value);
    ring.visible = true;
  }

  update(dt, t, head) {
    this.t = t;
    for (const r of this.rings) {
      if (!r.visible) continue;
      const age = t - r.userData.birth;
      if (age > 2.5) { r.visible = false; continue; }
      const s = 0.04 + (1 - Math.exp(-age * 1.4)) * 0.42 * (0.5 + r.userData.vel);
      r.scale.setScalar(s);
      r.material.opacity = (1 - age / 2.5) ** 2 * 0.55;
      r.lookAt(head);
    }
  }
}
