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

function signTexture(text, hue, dead) {
  if (dead === 'broken') {
    // a cracked red warning sign, lit from inside
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#2a0303'; c.fillRect(0, 0, 1024, 256);
    c.strokeStyle = '#ff3a2a'; c.lineWidth = 10; c.strokeRect(12, 12, 1000, 232);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '700 110px Jost, system-ui, sans-serif';
    c.shadowColor = '#ff2a1a'; c.shadowBlur = 40; c.fillStyle = '#ff5a40'; c.fillText('OUT OF ORDER', 512, 134);
    c.shadowBlur = 0; c.strokeStyle = 'rgba(0,0,0,0.7)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(620, 20); c.lineTo(660, 110); c.lineTo(640, 160); c.lineTo(700, 240); c.stroke();
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
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

function stencilTexture(i) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '700 84px "Courier New", monospace';
  const deck = 'ABCDEFGHK'[i % 9];
  c.fillText(`${deck}-${String(10 + ((i * 37) % 89)).padStart(2, '0')}`, 128, 66);
  // stencil gaps
  c.globalCompositeOperation = 'destination-out';
  c.fillRect(0, 60, 256, 6);
  const t = new THREE.CanvasTexture(cv);
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
    const sessions = HUB.tracks.length ? HUB.tracks : [{ title: 'Begin' }];
    // a couple of doors are out of order, and a couple are taped off
    const tracks = sessions.slice();
    [[3, 'broken'], [8, 'taped'], [13, 'broken'], [17, 'taped']].forEach(([at, dead]) => tracks.splice(Math.min(at, tracks.length), 0, { title: dead === 'broken' ? 'OUT OF ORDER' : 'SEALED', dead }));
    const n = Math.max(12, Math.ceil(tracks.length / 2) * 2);
    this.span = (n / 2) * GAP;               // the length after which the doors repeat
    this.doors = [];
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x2a2018 });
    for (let i = 0; i < n; i++) {
      const tr = tracks[i % tracks.length];
      const hue = tr.dead ? '#ff2a1a' : (tr.palette && tr.palette[1]) || '#a493ff';
      const look = [Math.random(), Math.floor(Math.random() * 5), tr.dead === 'broken' ? 1 : tr.dead === 'taped' ? 2 : 0, Math.floor(Math.random() * 3)];
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
        uniforms: { ...U, uHot: { value: 0 }, uCol: { value: new THREE.Color(hue) }, uLook: { value: new THREE.Vector4(...look) }, uStencil: { value: stencilTexture(i) } },
        vertexShader: 'varying vec3 vP; varying vec3 vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uHot, uFade, uTime; uniform vec3 uCol; uniform vec4 uLook; uniform sampler2D uStencil; varying vec3 vP; varying vec3 vN; ${NOISE} ${GRADE}
          float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          // fine scratches: short random strokes at a few angles
          float scratches(vec2 q, float s){
            float k = 0.0;
            for (int i = 0; i < 3; i++) {
              float a = h2(vec2(s, float(i))) * 3.14;
              vec2 r = mat2(cos(a), -sin(a), sin(a), cos(a)) * q * vec2(1.0, 30.0);
              vec2 c = floor(r), f = fract(r);
              float on = step(0.93, h2(c + s + float(i) * 7.0));
              k = max(k, on * smoothstep(0.12, 0.0, abs(f.y - 0.5)) * step(0.15, f.x) * step(f.x, 0.15 + h2(c + 3.0) * 0.8));
            }
            return k;
          }
          void main(){ vec2 q = vP.xy; float seed = uLook.x, kind = uLook.y, dead = uLook.z, port = uLook.w;
            float age = fbm(vec3(q * 2.5, seed * 20.0)), age2 = fbm(vec3(q * 7.0, seed * 30.0 + 4.0));
            // the door's own finish: worn brass, bare steel, or chipped paint in one of three colours
            vec3 metal = kind < 1.5 ? mix(vec3(0.36, 0.25, 0.1), vec3(0.62, 0.46, 0.22), smoothstep(0.3, 0.8, age2))
                                    : mix(vec3(0.2, 0.21, 0.22), vec3(0.36, 0.37, 0.38), smoothstep(0.3, 0.8, age2));
            vec3 paint = kind < 2.5 ? metal : kind < 3.5 ? vec3(0.32, 0.07, 0.05) : kind < 4.5 ? vec3(0.13, 0.2, 0.12) : vec3(0.06, 0.2, 0.22);
            float chipped = smoothstep(0.55, 0.62, fbm(vec3(q * 4.0, seed * 9.0)));
            vec3 c = kind > 2.5 ? mix(paint * (0.8 + 0.3 * age2), metal * 0.8, chipped) : metal;
            // rust blooming at the bottom and round the rivets, grime, verdigris on brass
            float low = smoothstep(0.9, 0.0, q.y);
            c = mix(c, vec3(0.3, 0.11, 0.035) * (0.6 + 0.6 * age2), smoothstep(0.5, 0.75, age + low * 0.35) * 0.75);
            if (kind < 1.5) c = mix(c, vec3(0.14, 0.28, 0.24), smoothstep(0.62, 0.82, age) * 0.6);
            c *= 1.0 - low * 0.35;
            // dents catch the light unevenly; scratches show bright bare metal
            float dent = fbm(vec3(q * 3.0, seed * 50.0)) - 0.5;
            c *= 1.0 + dent * 0.5;
            c += vec3(0.5, 0.48, 0.44) * scratches(q * 1.6, seed * 91.0) * 0.35;
            // a scorch mark on some
            c *= 1.0 - smoothstep(0.35, 0.0, length((q - vec2(0.2 + seed * 0.6, 0.4 + fract(seed * 7.0) * 1.2)) * vec2(1.0, 0.6))) * step(0.6, fract(seed * 13.0)) * 0.7;
            // panels: plain, vertical ribs, a cross-brace or horizontal bands
            float lay = floor(fract(seed * 17.0) * 4.0);
            float edge = 1.0 - step(0.06, q.x) * step(q.x, ${(DW - 0.06).toFixed(2)}) * step(0.06, q.y) * step(q.y, ${(DH - 0.06).toFixed(2)});
            float panel = lay < 1.0 ? 0.0
              : lay < 2.0 ? step(abs(fract(q.x / 0.25) - 0.5), 0.06)
              : lay < 3.0 ? step(min(abs(q.y - q.x * ${(DH / DW).toFixed(3)}), abs(q.y - (${DW.toFixed(2)} - q.x) * ${(DH / DW).toFixed(3)})), 0.06)
              : step(abs(fract(q.y / 0.45) - 0.5), 0.05);
            c *= 1.0 - panel * 0.25;
            c *= 1.0 + edge * 0.15;
            // rivets round the edge
            vec2 e = vec2(min(q.x, ${DW.toFixed(2)} - q.x), min(q.y, ${DH.toFixed(2)} - q.y));
            float along = e.x < e.y ? q.y : q.x;
            float rivet = smoothstep(0.016, 0.009, length(vec2(min(abs(e.x - 0.035), abs(e.y - 0.035)), (fract(along / 0.11) - 0.5) * 0.11))) * step(min(e.x, e.y), 0.06);
            c += vec3(0.3, 0.27, 0.22) * rivet * 0.5;
            // the window: round, square or a narrow slot; dark if the door is dead
            vec2 ph = q - vec2(${(DW / 2).toFixed(3)}, 1.6);
            float d = port < 0.5 ? length(ph) - 0.16 : port < 1.5 ? max(abs(ph.x), abs(ph.y)) - 0.14 : max(abs(ph.x) - 0.3, abs(ph.y) - 0.045);
            float glass = smoothstep(0.004, -0.004, d), bezel = smoothstep(0.045, 0.035, d) * (1.0 - glass);
            c = mix(c, metal * 0.7, bezel);
            vec3 beyond = dead > 0.5 ? vec3(0.02, 0.02, 0.025) + vec3(0.06) * fbm(vec3(ph * 30.0, 1.0)) : uCol * (0.55 + 0.9 * uHot) + vec3(1.0, 0.95, 0.85) * smoothstep(0.1, -0.15, d) * 0.3;
            beyond += vec3(0.2) * smoothstep(0.02, 0.0, abs(ph.x + ph.y * 0.6 - 0.05)) * glass * step(0.5, fract(seed * 23.0));   // a crack in the glass
            c = mix(c, beyond, glass);
            // handle, and a stencilled number
            c = mix(c, metal * 0.9, step(abs(q.x - ${(DW - 0.15).toFixed(2)}), 0.028) * step(abs(q.y - 1.0), 0.15));
            vec2 su = (q - vec2(0.18, 0.55)) / vec2(0.7, 0.35);
            if (su.x > 0.0 && su.x < 1.0 && su.y > 0.0 && su.y < 1.0) c = mix(c, vec3(0.85, 0.82, 0.7) * (0.7 + 0.3 * age2), texture2D(uStencil, su).a * (1.0 - chipped * 0.6) * 0.8);
            // hazard tape across the sealed doors
            if (dead > 1.5) {
              float t1 = abs(q.y - 0.4 - q.x * 1.3), t2 = abs(q.y - 1.75 + q.x * 1.3);
              float tape = step(min(t1, t2), 0.08);
              float stripes = step(0.5, fract((q.x + q.y) * 6.0));
              c = mix(c, mix(vec3(0.02), vec3(0.85, 0.65, 0.05), stripes) * (0.8 + 0.2 * age2), tape);
            }
            float lit = 0.35 + 0.65 * smoothstep(0.0, ${DH.toFixed(1)}, q.y);
            c *= lit;
            c += uCol * edge * uHot * (dead > 0.5 ? 0.15 : 0.5);
            gl_FragColor = vec4(grade(c), uFade); }`,
      }));
      hinge.add(leaf);
      // the sign: the session's name
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.325), new THREE.ShaderMaterial({
        transparent: true, uniforms: { ...U, uTex: { value: signTexture(tr.title || 'Session', hue, tr.dead) }, uDead: { value: tr.dead === 'broken' ? 1 : 0 }, uHot: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: 'uniform sampler2D uTex; uniform float uHot, uFade, uDead, uTime; varying vec2 vUv; void main(){ vec4 t = texture2D(uTex, vUv); float fl = uDead > 0.5 ? 0.55 + 0.45 * step(0.3, fract(sin(floor(uTime * 9.0) * 12.9898) * 43758.5)) : 1.0; gl_FragColor = vec4(t.rgb * (0.6 + 0.6 * uHot) * fl * uFade, 1.0); }',
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
    if (this.hover.tr.dead) { if (this.fade > 0.5) SFX.play('thud', { pan: this.hover.side * 0.6, gain: 0.8, decay: 0.3 }); return; }
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
