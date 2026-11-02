import * as THREE from 'three';
import { BaseScene, POINT_SIZE, additive, damp } from '../common.js';

// A layered lotus mandala floating in front of you. Petals open toward you
// on the inhale and fold on the exhale; each ring turns a step on the bar,
// alternating direction; notes light petals on the ring matching their pitch.
export class MandalaScene extends BaseScene {
  constructor() {
    super();
    this.root = new THREE.Group();
    this.root.position.set(0, 1.6, -3.2);
    this.group.add(this.root);

    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.22, 0.25, 0.2, 0.7, 0, 1);
    shape.bezierCurveTo(-0.2, 0.7, -0.22, 0.25, 0, 0);
    const petal = new THREE.ShapeGeometry(shape, 18);
    const outline = new THREE.EdgesGeometry(petal, 1);

    const specs = [
      { n: 8, r: 0.12, s: 0.32, z: 0.12 },
      { n: 12, r: 0.32, s: 0.38, z: 0.08 },
      { n: 16, r: 0.58, s: 0.42, z: 0.04 },
      { n: 24, r: 0.88, s: 0.45, z: 0.0 },
      { n: 32, r: 1.22, s: 0.5, z: -0.06 },
      { n: 48, r: 1.62, s: 0.46, z: -0.12 },
    ];
    this.rings = specs.map((sp, ri) => {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.4 });
      const mesh = new THREE.InstancedMesh(petal, mat, sp.n);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sp.n * 3), 3);
      mesh.frustumCulled = false;
      const lineMat = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
      const lines = [];
      for (let i = 0; i < sp.n; i++) {
        const l = new THREE.LineSegments(outline, lineMat);
        l.matrixAutoUpdate = false;
        this.root.add(l);
        lines.push(l);
      }
      this.root.add(mesh);
      return { ...sp, ri, mesh, lines, lineMat, rot: 0, target: 0, flash: new Float32Array(sp.n), dir: ri % 2 ? -1 : 1 };
    });

    // centre jewel
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.15], 3));
    this.root.add(new THREE.Points(cg, additive({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `uniform float uViewH, uBreath, uBeat; ${POINT_SIZE}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = pointPx(0.7 + uBreath * 0.4 + uBeat * 0.2, mv); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uC2; uniform float uFade, uEnergy;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(mix(uC2, vec3(1.0), 0.4) * exp(-d*d*7.0) * (0.5 + uEnergy * 0.5) * uFade, 1.0); }`,
    })));

    this.open = 0.5;
    this.m = new THREE.Matrix4();
    this.tmp = new THREE.Object3D();
    this.col = new THREE.Color();
  }

  onEvent(e) {
    if (e.type === 'bar') {
      for (const r of this.rings) r.target += (r.dir * Math.PI * 2) / r.n;
    }
    if (e.type === 'chord') for (const r of this.rings) r.dir *= -1;
    if (e.type === 'note') {
      const ring = this.rings[Math.min(5, Math.floor(e.u * 6))];
      const ang = Math.atan2(-e.pos[0], e.pos[1] - 1.6);
      let idx = Math.round((((ang - ring.rot) / (Math.PI * 2)) % 1 + 1) % 1 * ring.n) % ring.n;
      for (let k = -1; k <= 1; k++) ring.flash[(idx + k + ring.n) % ring.n] = Math.max(ring.flash[(idx + k + ring.n) % ring.n], k ? 0.5 : 1);
    }
  }

  update(dt, t, s) {
    const c0 = this.uniforms.uC1.value, c1 = this.uniforms.uC2.value;
    this.open = damp(this.open, s.breath, 3, dt);
    const f = this.fade;
    for (const r of this.rings) {
      r.rot = damp(r.rot, r.target, 2.5, dt);
      const tilt = (1 - this.open) * (0.9 - r.ri * 0.08) + 0.12 + Math.sin(t * 0.5 + r.ri) * 0.04;
      for (let i = 0; i < r.n; i++) {
        const a = (i / r.n) * Math.PI * 2 + r.rot + (r.ri % 2 ? Math.PI / r.n : 0);
        const o = this.tmp;
        o.position.set(-Math.sin(a) * r.r, Math.cos(a) * r.r, r.z);
        o.rotation.set(0, 0, a);
        o.rotateX(-tilt);
        const sc = r.s * (1 + r.flash[i] * 0.15 + s.level * 0.2);
        o.scale.set(sc * (0.85 + this.open * 0.25), sc, sc);
        o.updateMatrix();
        r.mesh.setMatrixAt(i, o.matrix);
        r.lines[i].matrix.copy(o.matrix);
        r.flash[i] *= Math.exp(-dt * 2.2);
        this.col.copy(c0).lerp(c1, r.ri / 5).lerp(new THREE.Color(1, 1, 1), r.flash[i] * 0.6).multiplyScalar(0.35 + r.flash[i]);
        r.mesh.setColorAt(i, this.col);
      }
      r.mesh.instanceMatrix.needsUpdate = true;
      r.mesh.instanceColor.needsUpdate = true;
      r.mesh.material.opacity = f * (0.18 + s.energy * 0.22);
      r.lineMat.color.copy(c1).lerp(c0, r.ri / 8);
      r.lineMat.opacity = f * (0.45 + s.energy * 0.4);
    }
    this.root.rotation.z = Math.sin(t * 0.05) * 0.2;
  }
}
