import * as THREE from 'three';
import { BaseScene, POINT_SIZE, additive, damp, easeInOut } from '../common.js';

// Sacred geometry: the Flower of Life draws itself circle by circle as the
// session deepens, Metatron's Cube appears at the peak, and two great
// wireframe solids turn around you a step on every bar.
export class GeometryScene extends BaseScene {
  constructor() {
    super();
    this.front = new THREE.Group();
    this.front.position.set(0, 1.65, -3.6);
    this.group.add(this.front);

    // Flower of life centres (hex rings 0,1,2)
    const R = 0.42;
    const centres = [[0, 0]];
    for (let ring = 1; ring <= 2; ring++) {
      for (let side = 0; side < 6; side++) {
        const a0 = (side * Math.PI) / 3, a1 = ((side + 1) * Math.PI) / 3;
        for (let k = 0; k < ring; k++) {
          const f = k / ring;
          const x = R * ring * ((1 - f) * Math.cos(a0) + f * Math.cos(a1));
          const y = R * ring * ((1 - f) * Math.sin(a0) + f * Math.sin(a1));
          centres.push([x, y]);
        }
      }
    }
    this.circles = centres.map(([x, y], i) => {
      const pts = [];
      for (let k = 0; k <= 128; k++) { const a = (k / 128) * Math.PI * 2 + Math.atan2(y, x); pts.push(new THREE.Vector3(x + Math.cos(a) * R, y + Math.sin(a) * R, 0)); }
      const g = new THREE.BufferGeometry().setFromPoints(pts);
      g.setDrawRange(0, 0);
      const m = new THREE.Line(g, new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      m.userData = { draw: 0, flash: 0, order: i };
      this.front.add(m);
      return m;
    });
    // enclosing circles
    for (const rr of [R * 3, R * 3.08]) {
      const pts = [];
      for (let k = 0; k <= 256; k++) { const a = (k / 256) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, 0)); }
      const m = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
      m.userData = { draw: 0, flash: 0, order: 100 };
      m.geometry.setDrawRange(0, 0);
      this.front.add(m);
      this.circles.push(m);
    }

    // Metatron's cube: 13 points (centre + 2 hex rings at R*sqrt3? use R*2 and R*4/ ... ) joined all-to-all
    const mp = [[0, 0]];
    for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; mp.push([Math.cos(a) * R * 1.732, Math.sin(a) * R * 1.732]); }
    for (let k = 0; k < 6; k++) { const a = (k * Math.PI) / 3 + Math.PI / 6; mp.push([Math.cos(a) * R * 3.464 * 0.82, Math.sin(a) * R * 3.464 * 0.82]); }
    const seg = [];
    for (let i = 0; i < mp.length; i++) for (let j = i + 1; j < mp.length; j++) seg.push(mp[i][0], mp[i][1], 0.01, mp[j][0], mp[j][1], 0.01);
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.metatron = new THREE.LineSegments(mg, new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
    this.front.add(this.metatron);
    this.metaOn = 0;

    // node glows
    const ng = new THREE.BufferGeometry();
    ng.setAttribute('position', new THREE.Float32BufferAttribute(centres.flatMap(([x, y]) => [x, y, 0.02]), 3));
    this.nodes = new THREE.Points(ng, additive({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `uniform float uViewH, uBreath; ${POINT_SIZE}
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = pointPx(0.08 + uBreath * 0.06, mv); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */ `uniform vec3 uC2; uniform float uFade, uEnergy;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; gl_FragColor = vec4(uC2 * exp(-d*d*6.0) * (0.4 + uEnergy * 0.6) * uFade, 1.0); }`,
    }));
    this.front.add(this.nodes);

    // great solids around the listener
    this.solids = [
      new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(7, 0)), new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
      new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(5.2, 0)), new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
      new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(9.5, 0)), new THREE.LineBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
    ];
    this.solids.forEach((s, i) => {
      s.position.y = 1.6;
      s.userData = { rot: new THREE.Euler(i * 0.4, i * 0.9, 0), target: new THREE.Euler(i * 0.4, i * 0.9, 0), glow: 0 };
      this.group.add(s);
    });
    this.reveal = 1;
    this.active = 0;
    this.spin = 0;
  }

  onEvent(e) {
    if (e.type === 'section') {
      this.reveal = [1, 7, 19, 21, 21][e.index] ?? 21;
      this.metaTarget = e.index === 3 ? 1 : e.index === 2 ? 0.35 : 0;
    }
    if (e.type === 'bar') {
      const s = this.solids[e.bar % 3];
      s.userData.target.y += Math.PI / 5;
      s.userData.target.x += Math.PI / 10;
    }
    if (e.type === 'chord') { this.active = (this.active + 1) % 3; this.solids[this.active].userData.glow = 1; }
    if (e.type === 'note') {
      const visible = this.circles.filter((c) => c.userData.draw > 0.5 && c.userData.order < 100);
      if (visible.length) visible[Math.floor(e.u * (visible.length - 0.001))].userData.flash = 1;
    }
  }

  update(dt, t, s) {
    const c1 = this.uniforms.uC1.value, c2 = this.uniforms.uC2.value;
    const f = this.fade;
    this.circles.forEach((c, i) => {
      const want = (c.userData.order < 100 ? i < this.reveal : this.reveal >= 19) ? 1 : 0;
      c.userData.draw = damp(c.userData.draw, want, 0.9, dt);
      const n = c.geometry.attributes.position.count;
      c.geometry.setDrawRange(0, Math.floor(easeInOut(c.userData.draw) * n));
      c.userData.flash *= Math.exp(-dt * 2.5);
      c.material.color.copy(c2).lerp(new THREE.Color(1, 1, 1), c.userData.flash * 0.6);
      c.material.opacity = f * (0.35 + s.energy * 0.35 + c.userData.flash * 0.6 + s.breath * 0.15);
    });
    this.metaOn = damp(this.metaOn, this.metaTarget || 0, 0.6, dt);
    this.metatron.material.color.copy(c1).lerp(c2, 0.5);
    this.metatron.material.opacity = this.metaOn * f * 0.5;
    this.front.rotation.z += dt * 0.02;
    this.front.scale.setScalar(1 + s.breath * 0.06);
    this.solids.forEach((so) => {
      const u = so.userData;
      u.rot.x = damp(u.rot.x, u.target.x, 1.2, dt);
      u.rot.y = damp(u.rot.y, u.target.y, 1.2, dt);
      so.rotation.copy(u.rot);
      u.glow *= Math.exp(-dt * 0.5);
      so.material.color.copy(c1).lerp(c2, u.glow);
      so.material.opacity = f * (0.12 + s.energy * 0.18 + u.glow * 0.35);
    });
  }
}
