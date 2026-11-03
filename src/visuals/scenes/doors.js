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
  c.fillStyle = '#05060a'; c.fillRect(0, 0, 1024, 256);
  c.strokeStyle = hue; c.lineWidth = 8; c.globalAlpha = 0.8;
  c.strokeRect(14, 14, 996, 228);
  c.globalAlpha = 1;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  let size = 92;
  c.font = `300 ${size}px Comfortaa, Jost, system-ui, sans-serif`;
  while (c.measureText(text).width > 920 && size > 40) { size -= 4; c.font = `300 ${size}px Comfortaa, Jost, system-ui, sans-serif`; }
  c.shadowColor = hue; c.shadowBlur = 30;
  c.fillStyle = '#ffffff';
  c.fillText(text, 512, 132);
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
          if (n.y < -0.5) {
            // ceiling: a long strip of soft light down the middle, with cross-lights
            float strip = smoothstep(0.22, 0.12, abs(vW.x));
            float cross = smoothstep(0.08, 0.02, abs(fract(z / ${GAP.toFixed(1)}) - 0.5)) * smoothstep(${W.toFixed(1)}, 0.4, abs(vW.x));
            c = vec3(0.03, 0.03, 0.035) + vec3(0.9, 0.92, 1.0) * strip * 0.9 + vec3(0.6, 0.65, 0.75) * cross * 0.25;
          } else if (n.y > 0.5) {
            // floor: polished, catching the ceiling light
            float sheen = smoothstep(0.6, 0.0, abs(vW.x)) * 0.12;
            float joint = step(0.98, fract(z / 1.2)) + step(0.985, fract(vW.x / 1.2 + 0.5));
            c = vec3(0.025, 0.026, 0.03) + vec3(0.5, 0.52, 0.6) * sheen + vec3(0.01) * joint;
          } else {
            // walls: pale concrete panels, lit from above
            vec2 q = vec2(z, vW.y);
            float panel = step(0.985, fract(q.x / 1.2)) + step(0.99, fract(q.y / 1.5));
            float conc = 0.85 + 0.15 * fbm(vec3(q * 2.0, 3.0));
            c = vec3(0.11, 0.115, 0.125) * conc * (0.55 + 0.45 * smoothstep(0.0, ${H.toFixed(1)}, vW.y)) - vec3(0.03) * panel;
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
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x1a1b20 });
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
          void main(){ vec2 q = vP.xy;
            float inset = step(0.12, q.x) * step(q.x, ${(DW - 0.12).toFixed(2)}) * step(0.14, q.y) * step(q.y, ${(DH - 0.14).toFixed(2)});
            float edge = 1.0 - step(0.03, q.x) * step(q.x, ${(DW - 0.03).toFixed(2)}) * step(0.03, q.y) * step(q.y, ${(DH - 0.03).toFixed(2)});
            vec3 c = vec3(0.16, 0.165, 0.18) * (0.75 + 0.25 * smoothstep(0.0, ${DH.toFixed(1)}, q.y)) * (inset > 0.5 ? 0.85 : 1.0);
            c += vec3(0.6) * step(abs(q.x - ${(DW - 0.12).toFixed(2)}), 0.025) * step(abs(q.y - 1.05), 0.12) * 0.4;   // handle
            c += uCol * edge * (0.25 + 1.4 * uHot);
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
    this.glide = 0; this.speed = 0.35; this.chosen = null; this.t = 0;
    this.ray = new THREE.Raycaster();
    this.wantsPointer = true;
  }

  // a press while pointing at a door opens it
  onSelect() {
    if (this.chosen || !this.hover) return;
    this.chosen = this.hover; this.t = 0;
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
    this.speed = damp(this.speed, this.chosen ? 0 : hover ? 0 : 0.35, 1.5, dt);
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
      // glide toward the doorway
      const k = Math.max(0, Math.min(1, (this.t - 0.8) / 2.2));
      const target = new THREE.Vector3(d.side * W * 0.7, 0, d.g.position.z);
      this.hall.position.x = -target.x * k * k;
      this.hall.position.z = -target.z * k * k;
      U.uWhite.value = Math.max(0, (this.t - 2.2) / 1.0);
      if (this.t > 3.1 && !this.done) { this.done = true; HUB.onChoose?.(d.tr); }
    }
  }
}
