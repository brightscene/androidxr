import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT, damp } from '../common.js';
import { particles } from './kit.js';

// ===================================================================== The hall of doors
// Between sessions in the headset you stand in a long, quiet corridor that
// runs on forever, lined with doors. Each door leads to another dimension: a
// glowing sign on it names the session waiting behind it. You drift slowly
// along; point at a door and it lights up, select it and it swings open,
// light pours out, you glide through, and that session begins.
export const HUB = { tracks: [], onChoose: null };

const W = 1.7;          // half-width of the corridor
const H = 3.0;          // its height
const GAP = 3.6;        // spacing of doors along each wall
const DW = 1.05, DH = 2.2;

function signTexture(text, hue) {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 256;
  const c = cv.getContext('2d');
  // an old brass nameplate, screwed to the bulkhead, the name lit from behind
  const bg = c.createLinearGradient(0, 0, 0, 256);
  bg.addColorStop(0, '#b08a48'); bg.addColorStop(0.5, '#8a6630'); bg.addColorStop(1, '#5e4320');
  c.fillStyle = bg; c.fillRect(0, 0, 1024, 256);
  for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '40,80,70' : '90,40,10'},${Math.random() * 0.12})`; c.beginPath(); c.arc(Math.random() * 1024, Math.random() * 256, 4 + Math.random() * 18, 0, Math.PI * 2); c.fill(); }
  c.strokeStyle = '#8a6a33'; c.lineWidth = 10; c.strokeRect(10, 10, 1004, 236);
  c.fillStyle = '#a07c40';
  for (const [x, y] of [[34, 34], [990, 34], [34, 222], [990, 222]]) { c.beginPath(); c.arc(x, y, 10, 0, Math.PI * 2); c.fill(); }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 92;
  c.font = `300 ${size}px Comfortaa, Jost, system-ui, sans-serif`;
  while (c.measureText(text).width > 920 && size > 40) { size -= 4; c.font = `300 ${size}px Comfortaa, Jost, system-ui, sans-serif`; }
  // engraved letters, lit from behind in the colour of the world beyond
  c.shadowColor = hue; c.shadowBlur = 26;
  c.fillStyle = '#2a1a08'; c.fillText(text, 514, 135);
  c.fillStyle = '#fff6e0'; c.fillText(text, 512, 132);
  c.shadowBlur = 0; c.fillText(text, 512, 132);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export class DoorHallScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uGlide: { value: 0 }, uWhite: { value: 0 } });
    this.hall = new THREE.Group();
    this.group.add(this.hall);

    // the corridor: concrete walls, a ceiling of light strips, a softly reflective floor
    const shell = new THREE.Mesh(new THREE.BoxGeometry(W * 2, H, 400, 1, 1, 1).translate(0, H / 2, -150), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: U,
      vertexShader: 'varying vec3 vW; varying vec3 vN; void main(){ vW = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uFade, uGlide, uWhite, uTime; varying vec3 vW; varying vec3 vN; ${NOISE} ${GRADE}
        void main(){ vec3 n = normalize(vN); float z = vW.z - uGlide;
          vec3 c;
          float rib = smoothstep(0.06, 0.0, abs(fract(z / 1.8) - 0.5) - 0.44);     // bulkhead ribs
          float rust = smoothstep(0.45, 0.8, fbm(vec3(vW.x * 0.8 + z * 0.3, vW.y * 1.5, 2.0)));
          if (n.y > 0.5) {
            // ceiling: dark plating, pipes along the edges, caged amber lamps
            float pipes = smoothstep(0.1, 0.0, abs(abs(vW.x) - 1.35) - 0.06) + smoothstep(0.06, 0.0, abs(abs(vW.x) - 1.1) - 0.035);
            float lamp = smoothstep(0.35, 0.0, length(vec2(vW.x, (fract(z / ${GAP.toFixed(1)}) - 0.5) * ${GAP.toFixed(1)}) * vec2(1.0, 0.6)));
            c = vec3(0.04, 0.035, 0.03) + vec3(0.18, 0.13, 0.08) * pipes * (0.6 + 0.4 * sin(z * 0.7)) + vec3(1.0, 0.65, 0.3) * lamp * 1.3;
            c -= vec3(0.02) * rib;
          } else if (n.y < -0.5) {
            // floor: iron grating over the dark, worn shiny down the middle
            vec2 g = fract(vec2(vW.x, z) / 0.12);
            float bars = max(step(0.78, g.x), step(0.78, g.y));
            float wear = smoothstep(0.7, 0.0, abs(vW.x));
            c = mix(vec3(0.01, 0.008, 0.006), vec3(0.16, 0.13, 0.1) * (0.6 + 0.6 * wear), bars);
            c += vec3(1.0, 0.6, 0.25) * 0.04 * smoothstep(1.5, 0.0, abs(vW.x));
          } else {
            // walls: riveted iron plates, rust streaks running down, warm light from above
            vec2 q = vec2(z, vW.y);
            vec2 pl = fract(q / vec2(0.9, 0.75));
            float seam = step(0.97, pl.x) + step(0.965, pl.y);
            vec2 rv = fract(q / vec2(0.9, 0.75) * vec2(1.0, 1.0)) * vec2(0.9, 0.75);
            float rivet = smoothstep(0.022, 0.012, length(vec2(min(rv.x, 0.9 - rv.x), min(rv.y, 0.75 - rv.y)) - 0.06));
            float streak = smoothstep(0.55, 0.9, fbm(vec3(z * 3.0, vW.y * 0.25, 7.0))) * smoothstep(${H.toFixed(1)}, 0.5, vW.y);
            vec3 iron = mix(vec3(0.13, 0.12, 0.11), vec3(0.2, 0.17, 0.13), fbm(vec3(q * 1.5, 3.0)));
            c = mix(iron, vec3(0.3, 0.13, 0.05), rust * 0.6 + streak * 0.5);
            c *= 0.5 + 0.6 * smoothstep(0.0, ${H.toFixed(1)}, vW.y);
            c += vec3(0.25, 0.2, 0.15) * rivet * 0.5 - vec3(0.04) * seam - vec3(0.05) * rib;
          }
          // the corridor fades into darkness both ways
          float far = abs(vW.z);
          c *= exp(-max(0.0, far - 4.0) * 0.06);
          c = mix(c, vec3(1.0, 0.97, 0.92), uWhite);
          gl_FragColor = vec4(grade(c), uFade); }`,
    }));
    shell.renderOrder = -6;
    this.hall.add(shell);
    this.group.add(particles(U, { count: 200, min: [-W, 0.2, -30], max: [W, H - 0.2, 6], vel: [0, 0.02, 0], sway: 0.2, size: [0.006, 0.014], colors: ['#ffffff', '#dfe6ff'], alpha: 0.35 }));

    // the doors
    const tracks = HUB.tracks.length ? HUB.tracks : [{ title: 'Begin' }];
    const n = Math.max(12, Math.ceil(tracks.length / 2) * 2);
    this.span = (n / 2) * GAP;               // the length after which the doors repeat
    this.doors = [];
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
    for (let i = 0; i < n; i++) {
      const tr = tracks[i % tracks.length];
      const hue = (tr.palette && tr.palette[1]) || '#a493ff';
      const side = i % 2 ? 1 : -1;
      const g = new THREE.Group();
      // the light of the other dimension, waiting behind the door
      const portal = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, uniforms: { ...U, uCol: { value: new THREE.Color(hue) }, uOpen: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform vec3 uCol; uniform float uOpen, uTime, uFade; varying vec2 vUv; ${NOISE}
          void main(){ vec2 p = vUv - 0.5; float sw = fbm(vec3(p * 3.0, uTime * 0.2));
            vec3 c = mix(uCol * 0.6, vec3(1.0, 0.97, 0.9), smoothstep(0.5, 0.0, length(p * vec2(1.0, 0.5))) * 0.7) * (0.7 + 0.5 * sw);
            gl_FragColor = vec4(c * (0.25 + 1.6 * uOpen) * uFade, 1.0); }`,
      }));
      portal.position.set(0, DH / 2, 0.012);
      // the frame, and the door leaf hung on its hinge (it opens out into the corridor)
      const frame = new THREE.Group();
      for (const [x, y, w, h] of [[-DW / 2 - 0.04, DH / 2, 0.08, DH + 0.08], [DW / 2 + 0.04, DH / 2, 0.08, DH + 0.08], [0, DH + 0.04, DW + 0.16, 0.08]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), frameMat); b.position.set(x, y, 0.03); frame.add(b);
      }
      const hole = new THREE.Group();
      const hinge = new THREE.Group();
      hinge.position.set(-DW / 2, 0, 0.04);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(DW, DH, 0.05).translate(DW / 2, DH / 2, 0), new THREE.ShaderMaterial({
        uniforms: { ...U, uHot: { value: 0 }, uCol: { value: new THREE.Color(hue) } },
        vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uHot, uFade; uniform vec3 uCol; varying vec3 vP; varying vec3 vN; ${NOISE} ${GRADE}
          void main(){ vec2 q = vP.xy; vec3 n = normalize(vN);
            // antique brass, darkened with age: verdigris in the hollows, rust bleeding from the rivets
            float age = fbm(vec3(q * 2.5, 4.0)), age2 = fbm(vec3(q * 7.0, 9.0));
            vec3 brass = mix(vec3(0.42, 0.29, 0.12), vec3(0.72, 0.53, 0.25), smoothstep(0.3, 0.8, age2));
            vec3 c = mix(brass, vec3(0.16, 0.32, 0.27), smoothstep(0.58, 0.8, age) * 0.7);
            c = mix(c, vec3(0.32, 0.12, 0.04), smoothstep(0.6, 0.85, age2) * 0.5);
            // raised frame panels and a row of rivets round the edge
            float inset = step(0.1, q.x) * step(q.x, ${(DW - 0.1).toFixed(2)}) * step(0.1, q.y) * step(q.y, ${(DH - 0.1).toFixed(2)});
            c *= inset > 0.5 ? 0.78 : 1.0;
            vec2 e = vec2(min(q.x, ${DW.toFixed(2)} - q.x), min(q.y, ${DH.toFixed(2)} - q.y));
            float rowDist = min(abs(e.x - 0.05), abs(e.y - 0.05));
            float along = e.x < e.y ? q.y : q.x;
            float rivet = smoothstep(0.018, 0.01, length(vec2(rowDist, (fract(along / 0.12) - 0.5) * 0.12))) * step(min(e.x, e.y), 0.08);
            c += vec3(0.5, 0.38, 0.18) * rivet * 0.6;
            // a round porthole glowing with the light of the world beyond
            vec2 ph = q - vec2(${(DW / 2).toFixed(3)}, 1.55);
            float r = length(ph);
            float glass = smoothstep(0.17, 0.16, r);
            float bezel = smoothstep(0.21, 0.2, r) * (1.0 - glass);
            c = mix(c, vec3(0.6, 0.45, 0.2) * (0.8 + 0.4 * ph.y * 3.0), bezel);
            c = mix(c, uCol * (0.6 + 0.9 * uHot) + vec3(1.0, 0.95, 0.85) * smoothstep(0.16, 0.0, r) * 0.35, glass);
            // a heavy lever handle
            c = mix(c, vec3(0.55, 0.42, 0.2), step(abs(q.x - ${(DW - 0.16).toFixed(2)}), 0.03) * step(abs(q.y - 1.0), 0.16));
            // light: lamp above, a soft sheen, and the door's glow when chosen
            float lit = 0.45 + 0.55 * smoothstep(0.0, ${DH.toFixed(1)}, q.y);
            c *= lit;
            c += uCol * (1.0 - inset) * uHot * 0.5;
            gl_FragColor = vec4(grade(c), uFade); }`,
      }));
      hinge.add(leaf);
      // the sign: the session's name
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), new THREE.ShaderMaterial({
        transparent: true, uniforms: { ...U, uTex: { value: signTexture(tr.title || 'Session', hue) }, uHot: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform sampler2D uTex; uniform float uHot, uFade; varying vec2 vUv; void main(){ vec4 t = texture2D(uTex, vUv); gl_FragColor = vec4(t.rgb * (0.6 + 0.6 * uHot) * uFade, 1.0); }',
      }));
      sign.position.set(0, DH + 0.36, 0.02);
      g.add(portal, frame, hole, hinge, sign);
      g.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;      // facing into the corridor
      g.position.x = side * W;
      this.hall.add(g);
      this.doors.push({ g, leaf, hinge, sign, portal, hole, tr, side, base: -2.4 - Math.floor(i / 2) * GAP - (side > 0 ? GAP / 2 : 0), hot: 0, open: 0 });
    }
    // the light you pass into: fills your view, in the colour of the chosen world
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthTest: false, depthWrite: false, uniforms: { ...U, uCol: { value: new THREE.Color(1, 1, 1) } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform float uWhite, uFade; uniform vec3 uCol; void main(){ gl_FragColor = vec4(mix(uCol, vec3(1.0, 0.97, 0.9), 0.55), uWhite * uFade); }',
    }));
    this.veil.renderOrder = 9999;
    this.veil.position.y = 1.6;
    this.group.add(this.veil);
    this.glide = 0; this.speed = 0.35; this.chosen = null; this.t = 0;
    this.ray = new THREE.Raycaster();
    this.wantsPointer = true;
  }

  // a press while pointing at a door opens it
  onSelect() {
    if (this.chosen || !this.hover) return;
    this.chosen = this.hover; this.t = 0;
    this.veil.material.uniforms.uCol.value.copy(this.hover.portal.material.uniforms.uCol.value);
    if (this.fade > 0.5) { SFX.play('whoosh', { pan: this.hover.side * 0.6, dur: 3, gain: 0.5 }); SFX.play('chime', { note: 7, pan: this.hover.side * 0.5, gain: 0.3 }); }
  }

  update(dt) {
    const U = this.uniforms;
    // which door is being pointed at
    let hover = null;
    if (!this.chosen) {
      const leaves = this.doors.map((d) => d.leaf);
      for (const p of INPUT.pointers) {
        this.ray.set(p.origin, p.dir);
        const hit = this.ray.intersectObjects(leaves, false)[0];
        if (hit && hit.distance < 14) { hover = this.doors.find((d) => d.leaf === hit.object); break; }
      }
      this.hover = hover;
    }
    // drift along the corridor; pause while choosing
    let ahead = false;
    for (const p of INPUT.pointers) if (p.dir.z < -0.9) ahead = true;   // pointing back down the corridor
    this.speed = damp(this.speed, this.chosen || hover ? 0 : ahead ? 2.4 : 0.6, 1.2, dt);
    this.glide += this.speed * dt;
    U.uGlide.value = -this.glide;
    for (const d of this.doors) {
      const z = ((d.base + this.glide + 6) % this.span + this.span) % this.span - this.span + 6;
      d.g.position.z = z;
      d.hot = damp(d.hot, d === hover || d === this.chosen ? 1 : 0, 6, dt);
      d.leaf.material.uniforms.uHot.value = d.hot;
      d.sign.material.uniforms.uHot.value = d.hot;
    }
    // the chosen door swings open, light floods out, you glide through
    if (this.chosen) {
      const d = this.chosen;
      this.t += dt;
      d.open = Math.min(1, this.t / 1.4);
      const e = d.open * d.open * (3 - 2 * d.open);
      d.hinge.rotation.y = -e * 1.6;
      d.portal.material.uniforms.uOpen.value = e;
      // turn smoothly to face the door, step in front of it, then glide straight through
      const ease = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
      const e1 = ease(this.t / 1.8), e2 = ease((this.t - 1.6) / 1.8);
      const dist = 2.4 - 3.4 * e2;                                     // in front of it, then through it
      const zd = d.g.position.z;
      const T = new THREE.Vector3(d.side * (W - dist) * e1, 0, zd * e1);
      const yaw = d.side * Math.PI / 2 * e1;
      this.hall.rotation.y = yaw;
      this.hall.position.copy(T).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).negate();
      U.uWhite.value = ease((this.t - 2.6) / 0.8);
      if (this.t > 3.4 && !this.done) { this.done = true; HUB.onChoose?.(d.tr); }
    }
  }
}
