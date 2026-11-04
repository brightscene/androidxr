import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, SFX, INPUT } from '../common.js';
import { textPlane } from './imagecycle.js';

// ===================================================================== Bells
// Two bell journeys you play with your hands.
//
// Handbells: eight brass handbells, C to C, stand in an arc on a velvet table
// in a candlelit room, snow falling past the window. Tap a bell to ring it, or
// pinch its handle to lift it and flick your wrist, as handbell ringers do.
// Touch a ringing bell down onto the table to damp it.
//
// Church bells: a tower ringing room. Six ropes hang in front of you, each with
// its striped woolly sally; high above, through the open ceiling, six bells
// rest mouth-up in their frame. Pull a rope and its bell swings right over and
// speaks. A soft glow on the next sally leads you through rounds, treble to
// tenor, or ring them however you like.
//
// The bells' voices are made live from their partials, as real bells sound.

const pointerDist = (o, d, c) => { const v = c.clone().sub(o); const t = Math.max(0, v.dot(d)); return { off: v.addScaledVector(d, -t).length(), t }; };

// one-shot partials into a bell's own output: [ratio, weight, seconds to fade, beat Hz]
function strikeVoice(N, f, partials, gain, click) {
  const { ctx } = N;
  const now = ctx.currentTime;
  for (const [ratio, w, dur, beat] of partials) {
    const pair = beat ? [-0.5, 0.5] : [0];
    for (const d of pair) {
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = f * ratio + d * (beat || 0);
      const g = ctx.createGain();
      const peak = gain * w / pair.length;
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(peak, now + 0.004);
      g.gain.setTargetAtTime(0, now + 0.004, dur / 4.6);
      o.connect(g).connect(N.out);
      o.start(now); o.stop(now + dur + 0.2);
      o.onended = () => { try { g.disconnect(); } catch (_) {} };
    }
  }
  // the clapper's strike: a tiny burst of bright noise
  if (N.noise && click) {
    const n = ctx.createBufferSource(); n.buffer = N.noise;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = Math.min(9000, f * click); bp.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.5, now); g.gain.setTargetAtTime(0, now, 0.012);
    n.connect(bp).connect(g).connect(N.out);
    n.start(now, Math.random() * 1.5, 0.12);
  }
}

function bellOut(scene, pan, wet) {
  if (scene.muted) return null;
  const A = SFX.audio();
  if (!A) return null;
  const { ctx } = A;
  const out = ctx.createGain(); out.gain.value = 1;
  const p = ctx.createStereoPanner(); p.pan.value = pan;
  const master = ctx.createGain(); master.gain.value = scene.fade;
  out.connect(p).connect(master).connect(A.out);
  const send = ctx.createGain(); send.gain.value = wet; master.connect(send).connect(A.reverb);
  return { ctx, out, master, send, p, noise: A.noise };
}

const brassMat = (u, crystalTint) => new THREE.ShaderMaterial({
  side: THREE.DoubleSide, uniforms: u,
  vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vP = position; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
  fragmentShader: /* glsl */ `uniform float uFade, uRing, uTime; uniform vec3 uCol, uMetal; varying vec3 vN; varying vec3 vV; varying vec3 vP; ${NOISE}
    void main(){ vec3 n = normalize(vN); if (!gl_FrontFacing) n = -n;
      vec3 L = normalize(vec3(-0.3, 0.8, 0.5));
      float dif = 0.3 + 0.7 * max(dot(n, L), 0.0);
      vec3 R = reflect(-normalize(vV), n);
      float spec = pow(max(dot(R, L), 0.0), 30.0) + 0.35 * pow(max(dot(R, normalize(vec3(0.6, 0.3, 0.7))), 0.0), 12.0);
      float fr = pow(1.0 - abs(dot(n, normalize(vV))), 3.0);
      vec3 metal = uMetal * (0.85 + 0.3 * fbm(vP * 40.0));
      metal *= gl_FrontFacing ? 1.0 : 0.45;
      vec3 c = metal * dif + vec3(1.0, 0.88, 0.65) * (spec * 0.8 + fr * 0.3);
      c += uCol * uRing * (0.5 + fr * 1.5) * (0.8 + 0.2 * sin(uTime * 30.0));
      gl_FragColor = vec4(c * uFade, 1.0); }`,
});

const plainMat = (U, col, extra = '') => new THREE.ShaderMaterial({
  uniforms: { uFade: U.uFade, uCol: { value: new THREE.Color(col) } },
  vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform float uFade; uniform vec3 uCol; varying vec3 vN; varying vec3 vP; ${NOISE}
    void main(){ float l = 0.35 + 0.65 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.8, 0.5))), 0.0); vec3 c = uCol * l; ${extra} gl_FragColor = vec4(c * uFade, 1.0); }`,
});

// an expanding ring of coloured light, for each strike
function haloMesh(u, r) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.9, r * 1.05, 48), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uFade: u.uFade, uCol: u.uCol, uA: { value: 0 } },
    vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uFade, uA; uniform vec3 uCol; void main(){ gl_FragColor = vec4(uCol * uA * uFade, 1.0); }',
  }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 8;
  return m;
}

class BellScene extends BaseScene {
  constructor() {
    super();
    this.wantsPointer = true;
    this.rig = new THREE.Group();
    this.group.add(this.rig);
    this.placeNext = true;
    this.hintA = 1;
  }

  _place() {
    const h = INPUT.head;
    if (!h) return false;
    const f = new THREE.Vector3(h.fwd.x, 0, h.fwd.z);
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1);
    f.normalize();
    this.rig.position.copy(h.pos);
    this.rig.rotation.set(0, Math.atan2(-f.x, -f.z), 0);
    return true;
  }

  // pointers in rig space: origin, direction, fingertip
  _local(p, inv) {
    return { id: p.id, o: p.origin.clone().applyMatrix4(inv), d: p.dir.clone().transformDirection(inv), tip: p.tip ? p.tip.clone().applyMatrix4(inv) : null, press: INPUT.presses.includes(p.id) || p.press, held: INPUT.held.has(p.id) || p.held };
  }

  _hint(dt, t) {
    if (this.hintA < 1) this.hintA = Math.max(0, this.hintA - dt * 0.25);
    this.hint.material.uniforms.uA.value = (0.25 + 0.4 * Math.min(1, t * 0.5)) * this.hintA;
  }

  _quiet(N) {
    if (!N) return;
    N.master.gain.setTargetAtTime(0, N.ctx.currentTime, 0.08);
    setTimeout(() => { try { N.master.disconnect(); N.send.disconnect(); } catch (_) {} }, 600);
  }

  silence() { for (const b of this.bells || []) { this._quiet(b.N); b.N = null; } this.muted = true; }
  setFade(f) {
    super.setFade(f);
    for (const b of this.bells || []) if (b.N) b.N.master.gain.setTargetAtTime(f, b.N.ctx.currentTime, 0.1);
    if (f < 0.01) for (const b of this.bells || []) { this._quiet(b.N); b.N = null; }
  }
  dispose() { for (const b of this.bells || []) { this._quiet(b.N); b.N = null; } super.dispose(); }
}

// ===================================================================== Handbells
const HB_NOTES = [['C', 523.25], ['D', 587.33], ['E', 659.25], ['F', 698.46], ['G', 783.99], ['A', 880.0], ['B', 987.77], ['C', 1046.5]];
// a handbell: a strong fundamental and its tuned twelfth, with a few bright, quick partials
const HB_PARTIALS = [[1, 1, 5.5, 0.8], [3.0, 0.45, 3.0, 0], [4.18, 0.1, 1.3, 0], [5.42, 0.09, 0.9, 0], [6.8, 0.05, 0.6, 0], [2.0, 0.04, 2.0, 0]];
const HB_TABLE = -0.5, HB_D = 0.52;

export class HandbellsScene extends BellScene {
  constructor() {
    super();
    this.viewPitch = -0.35;
    const U = this.uniforms;

    // a candlelit room; snow falling past a tall window behind the table
    this.group.add(new THREE.Mesh(new THREE.SphereGeometry(30, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){ vec3 d = normalize(vDir);
          float az = atan(d.x, -d.z), el = asin(clamp(d.y, -1.0, 1.0));
          // warm panelled walls, darker up high
          float panel = smoothstep(0.02, 0.0, abs(fract(az * 4.0) - 0.5) - 0.47) * step(el, 0.1);
          vec3 c = mix(vec3(0.07, 0.035, 0.02), vec3(0.025, 0.012, 0.01), smoothstep(-0.2, 0.8, el));
          c *= 0.85 + 0.3 * fbm(vec3(az * 6.0, el * 30.0, 1.0));
          c += vec3(0.05, 0.025, 0.01) * panel;
          // the window: night sky, a village's lights and falling snow
          vec2 w = vec2(az / 0.55, (el - 0.28) / 0.3);
          float win = step(abs(w.x), 1.0) * step(abs(w.y), 1.0) * step(length(vec2(w.x, max(w.y - 0.6, 0.0) * 2.5)), 1.0);
          if (win > 0.5) {
            vec3 s = mix(vec3(0.03, 0.05, 0.12), vec3(0.08, 0.1, 0.2), smoothstep(-1.0, 1.0, w.y));
            float hills = -0.55 + 0.12 * sin(w.x * 3.0) + 0.06 * sin(w.x * 7.0 + 1.0);
            if (w.y < hills) {
              s = vec3(0.16, 0.18, 0.24) * (0.8 + 0.2 * fbm(vec3(w * 8.0, 2.0)));   // snow on the hills
              vec2 lc = floor(vec2(w.x * 18.0, w.y * 30.0));
              if (h21(lc) > 0.93 && w.y > hills - 0.25) s += vec3(1.0, 0.7, 0.35) * 0.7 * smoothstep(0.35, 0.0, length(fract(vec2(w.x * 18.0, w.y * 30.0)) - 0.5));
            }
            for (int L = 0; L < 3; L++) {
              float fl = float(L), sc = 14.0 + fl * 10.0;
              vec2 g = vec2(w.x * sc + sin(uTime * 0.4 + w.y * 3.0 + fl) * 0.6, w.y * sc + uTime * (0.8 + fl * 0.35));
              vec2 id = floor(g), f = fract(g) - 0.5;
              float r = h21(id + fl * 7.0);
              s += vec3(0.85, 0.9, 1.0) * smoothstep(0.12 - fl * 0.02, 0.0, length(f - (vec2(h21(id + 3.1), h21(id + 5.7)) - 0.5) * 0.6)) * step(0.55, r) * (0.7 - fl * 0.15);
            }
            // glazing bars
            s *= 1.0 - 0.8 * (smoothstep(0.02, 0.0, abs(w.x)) + smoothstep(0.02, 0.0, abs(w.y - 0.1)));
            c = s;
          }
          // the window's frame and candle glows around the room
          c += vec3(0.25, 0.12, 0.04) * smoothstep(0.08, 0.0, abs(max(abs(w.x), abs(w.y)) - 1.02)) * step(abs(w.y), 1.4) * 0.4;
          for (int i = 0; i < 6; i++) {
            float fi = float(i), a = -1.4 + fi * 0.56 + (fi > 2.5 ? 0.0 : 0.0);
            vec2 q = vec2(az - a, el + 0.05 - 0.04 * sin(fi * 2.0));
            float fl = 0.85 + 0.15 * sin(uTime * (7.0 + fi) + fi * 3.0);
            c += vec3(1.0, 0.6, 0.25) * exp(-dot(q, q) * 900.0) * 1.2 * fl + vec3(0.6, 0.3, 0.1) * exp(-dot(q, q) * 40.0) * 0.08 * fl;
          }
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));

    this.group.add(this.rig);
    // the table: dark wood with a deep blue velvet cover
    const table = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.04, 64, 1, false, -1.25, 2.5), plainMat(U, '#1a2250', 'c *= 0.75 + 0.35 * fbm(vP * 60.0); c += vec3(0.1, 0.1, 0.25) * pow(1.0 - abs(normalize(vN).y), 3.0);'));
    table.rotation.y = Math.PI;
    table.position.set(0, HB_TABLE - 0.02, 0);
    const gap = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.06, 32), plainMat(U, '#000000'));   // you stand in the curve
    gap.position.set(0, HB_TABLE - 0.02, 0);
    this.rig.add(table, gap);

    // the bells
    this.bells = HB_NOTES.map(([note, f], k) => {
      const a = (k - (HB_NOTES.length - 1) / 2) * 0.2;
      const r = 0.058 - k * 0.0034, h = r * 1.3, handle = 0.085;
      const col = new THREE.Color().setHSL(k / HB_NOTES.length * 0.85, 0.85, 0.6);
      const u = { ...U, uRing: { value: 0 }, uCol: { value: col }, uMetal: { value: new THREE.Color(0.78, 0.58, 0.26) } };
      const pts = [[1, 0], [0.97, 0.05], [0.86, 0.17], [0.75, 0.38], [0.7, 0.62], [0.62, 0.84], [0.42, 0.97], [0, 1.0]].map(([x, y]) => new THREE.Vector2(Math.max(0.001, x * r), -h + y * h));
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), brassMat(u));
      body.position.y = -handle;
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, handle, 16), plainMat(U, '#3a1a0e', 'c *= 0.8 + 0.3 * fbm(vP * 200.0);'));
      grip.position.y = -handle / 2;
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 8, 20), plainMat(U, '#2a120a'));
      loop.position.y = 0.012;
      const clapper = new THREE.Mesh(new THREE.SphereGeometry(r * 0.18, 12, 8), plainMat(U, '#2a2420'));
      clapper.position.y = -handle - h * 0.88;
      const halo = haloMesh(u, r);
      halo.position.y = -handle - h;
      g.add(body, grip, loop, clapper, halo);
      const home = new THREE.Vector3(Math.sin(a) * HB_D, HB_TABLE + h + handle, -Math.cos(a) * HB_D);
      g.position.copy(home);
      this.rig.add(g);
      const label = textPlane(U, 0.06, 0.03);
      label.userData.set(note);
      label.material.uniforms.uA.value = 0.4;
      label.position.set(Math.sin(a) * (HB_D - r - 0.04), HB_TABLE + 0.004, -Math.cos(a) * (HB_D - r - 0.04));
      label.rotation.set(-Math.PI / 2 + 0.3, -a, 0, 'YXZ');
      this.rig.add(label);
      return { k, note, f, r, h, handle, a, g, u, halo, home, centre: () => g.position.clone().add(new THREE.Vector3(0, -handle - h * 0.5, 0)),
        ring: 0, haloT: 9, holder: null, grab: 0, prev: null, vel: new THREE.Vector3(), peak: 0, armed: false, tilt: new THREE.Quaternion(), tipIn: new Map(), N: null };
    });

    this.hint = textPlane(U, 0.9, 0.06);
    this.hint.position.set(0, HB_TABLE + 0.32, -0.95);
    this.hint.userData.set('Tap a bell to ring it · pinch its handle to lift it, then flick to ring');
    this.rig.add(this.hint);
  }

  _ring(b, strength) {
    if (!b.N || !b.N.ctx || b.N.dead) b.N = bellOut(this, Math.max(-0.8, Math.min(0.8, Math.sin(b.a) * 2.2)), 0.5);
    const N = b.N;
    if (!N) { b.ring = 1; b.haloT = 0; return; }
    N.out.gain.cancelScheduledValues(N.ctx.currentTime);
    N.out.gain.setValueAtTime(1, N.ctx.currentTime);
    strikeVoice(N, b.f, HB_PARTIALS, 0.12 * Math.min(1.3, 0.45 + strength), 6);
    b.ring = 1; b.haloT = 0;
    this.hintA = Math.min(this.hintA, 0.99);
  }

  _damp(b) {
    if (b.N) b.N.out.gain.setTargetAtTime(0, b.N.ctx.currentTime, 0.06);
    b.ring = Math.min(b.ring, 0.1);
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const pointers = (this.demo ? this._demoPointers(t) : INPUT.pointers).map((p) => this._local(p, inv));

    for (const p of pointers) {
      const holding = this.bells.find((b) => b.holder === p.id);
      if (holding) {
        if (!p.held) { holding.holder = null; continue; }   // let go: it settles back on the table
        const at = p.tip ? p.tip.clone() : p.o.clone().addScaledVector(p.d, holding.grab);
        holding.g.position.lerp(at, 1 - Math.exp(-dt * 30));
        continue;
      }
      // which bell is this pointer on?
      let best = null, bd = Infinity;
      for (const b of this.bells) {
        if (b.holder != null) continue;
        const c = b.centre();
        let off;
        if (p.tip) off = Math.min(p.tip.distanceTo(c) / (b.r * 1.7), p.tip.distanceTo(b.g.position) / 0.05);
        else { const q = pointerDist(p.o, p.d, c); off = q.off / (b.r * 1.25); }
        if (off < 1 && off < bd) { bd = off; best = b; }
        // a fingertip tapping into a bell (no pinch needed)
        if (p.tip) {
          const inside = p.tip.distanceTo(c) < b.r * 1.1;
          const prev = b.tipIn.get(p.id);
          if (inside && prev && !prev.inside) {
            const sp = prev.pos.distanceTo(p.tip) / Math.max(dt, 1e-3);
            if (sp > 0.3) this._ring(b, Math.min(1, sp / 1.5));
          }
          b.tipIn.set(p.id, { inside, pos: p.tip.clone() });
        }
      }
      if (best && p.press) {
        this._ring(best, 0.5);
        // and pick it up while the pinch is held
        best.holder = p.id;
        best.grab = p.tip ? 0 : best.g.position.distanceTo(p.o);
        best.prev = null; best.peak = 0; best.armed = false;
      }
    }

    for (const b of this.bells) {
      if (b.holder == null) {
        // settle home; touching down on the table damps it
        const d = b.g.position.distanceTo(b.home);
        if (d > 0.002) { b.g.position.lerp(b.home, 1 - Math.exp(-dt * 7)); if (b.g.position.distanceTo(b.home) < 0.01 && b.ring > 0.05 && b.wasHeld) { this._damp(b); } }
        else b.wasHeld = false;
        b.vel.multiplyScalar(Math.exp(-dt * 6));
      } else {
        b.wasHeld = true;
        // a flick: the bell speeds up, then stops sharply; that's when the clapper strikes
        if (b.prev) {
          const v = b.g.position.clone().sub(b.prev).divideScalar(Math.max(dt, 1e-3));
          b.vel.lerp(v, 1 - Math.exp(-dt * 25));
          const sp = b.vel.length();
          if (sp > 0.9) { b.armed = true; b.peak = Math.max(b.peak, sp); }
          if (b.armed && sp < b.peak * 0.45) { this._ring(b, Math.min(1, b.peak / 3)); b.armed = false; b.peak = 0; }
          // lowered onto the table: damped
          if (b.g.position.y - b.handle - b.h < HB_TABLE + 0.01 && b.ring > 0.05) this._damp(b);
        }
        b.prev = b.g.position.clone();
      }
      // the bell swings behind your hand as you move it
      const sw = b.vel.clone().multiplyScalar(-0.35);
      sw.y = 0;
      const ang = Math.min(0.9, sw.length());
      const q = new THREE.Quaternion();
      if (ang > 1e-3) q.setFromAxisAngle(new THREE.Vector3(0, 1, 0).cross(sw).normalize(), -ang);
      b.tilt.slerp(q, 1 - Math.exp(-dt * 10));
      b.g.quaternion.copy(b.tilt);
      // light
      b.ring *= Math.exp(-dt / 1.2);
      b.haloT += dt;
      b.u.uRing.value = b.ring;
      const hs = 1 + b.haloT * 5;
      b.halo.scale.set(hs, hs, hs);
      b.halo.material.uniforms.uA.value = Math.max(0, 1 - b.haloT / 0.9) * 0.9;
    }
    this._hint(dt, t);
  }

  // for previews: a simple tune tapped on the bells
  _demoPointers(t) {
    const TUNE = [0, 2, 4, 5, 4, 2, 4, 7, 4, 2, 0, 4];
    const step = Math.floor(t / 0.5), k = TUNE[step % TUNE.length];
    const b = this.bells[k];
    const c = b.centre().applyMatrix4(this.rig.matrixWorld);
    const press = step !== this._demoStep; this._demoStep = step;
    return [{ id: 'demo', origin: c.clone().add(new THREE.Vector3(0, 0.4, 0.3)), dir: new THREE.Vector3(0, -0.4, -0.3).normalize(), tip: null, press, held: false }];
  }
}

// ===================================================================== Church bells
// a ring of six in D: nominal frequencies, treble to tenor
const CB_NOTES = [['Treble', 987.77], ['2', 880.0], ['3', 783.99], ['4', 739.99], ['5', 659.25], ['Tenor', 587.33]];
// a church bell's partials relative to its nominal: hum, prime, minor-third tierce, quint, nominal and above
const CB_PARTIALS = [[0.25, 0.5, 14, 0.6], [0.5, 0.45, 9, 0.9], [0.595, 0.5, 7, 0], [0.75, 0.16, 4, 0], [1.0, 1.0, 5, 1.3], [1.25, 0.25, 2.6, 0], [1.5, 0.28, 2.0, 0], [2.0, 0.2, 1.3, 0], [2.52, 0.12, 0.9, 0], [3.0, 0.07, 0.6, 0]];
const ROPE_R = 0.6, BELL_R = 1.65, BELL_Y = 4.1, CEIL = 2.0, FLOOR = -1.6, SWING = (172 / 180) * Math.PI, SWING_T = 1.5;

export class ChurchBellsScene extends BellScene {
  constructor() {
    super();
    this.viewPitch = 0.0;
    const U = this.uniforms;

    // the tower: stone walls with lancet windows, a timber ceiling open in the
    // middle, and the belfry above, its louvres letting in the dusk
    this.rig.add(new THREE.Mesh(new THREE.SphereGeometry(20, 48, 32), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade; varying vec3 vDir; ${NOISE} ${GRADE}
        const float WR = 3.0, CEIL = ${CEIL.toFixed(2)}, FLOOR = ${FLOOR.toFixed(2)}, TOP = 6.5, HOLE = 2.0;
        vec3 dusk(vec3 d){ return mix(vec3(0.95, 0.5, 0.28), vec3(0.18, 0.2, 0.42), smoothstep(-0.05, 0.5, d.y)) + vec3(1.0, 0.75, 0.4) * pow(max(dot(d, normalize(vec3(-0.6, 0.1, -0.8))), 0.0), 40.0); }
        vec3 stone(vec3 p){ vec2 b = vec2(atan(p.x, -p.z) * WR, p.y); b.x += step(1.0, mod(floor(b.y / 0.3), 2.0)) * 0.22;
          vec2 f = fract(b / vec2(0.45, 0.3)); float m = smoothstep(0.0, 0.05, min(min(f.x, 1.0 - f.x) * 0.45, min(f.y, 1.0 - f.y) * 0.3) * 3.0);
          return mix(vec3(0.08, 0.06, 0.05), vec3(0.32, 0.26, 0.2) * (0.75 + 0.4 * fbm(p * 6.0)), m); }
        void main(){ vec3 d = normalize(vDir);
          float h = length(d.xz) + 1e-4, tw = WR / h, yw = d.y * tw;
          vec3 c;
          float az = atan(d.x, -d.z);
          if (d.y < 0.0 && FLOOR / d.y < tw) {
            vec3 p = d * (FLOOR / d.y);
            float plank = fract(p.x * 4.0);
            c = vec3(0.16, 0.08, 0.04) * (0.7 + 0.4 * fbm(vec3(p.x * 4.0, p.z * 0.6, 3.0))) * (0.85 + 0.15 * smoothstep(0.0, 0.05, plank));
            c = mix(c, vec3(0.35, 0.05, 0.05) * (0.8 + 0.2 * fbm(p * 20.0)), smoothstep(1.25, 1.2, length(p.xz)));   // a red carpet ring where the ringers stand
          } else if (yw < CEIL) {
            vec3 p = d * tw;
            c = stone(p) * (0.55 + 0.45 * smoothstep(FLOOR, CEIL, yw));
            // tall lancet windows glowing with dusk, and boards with peal records between them
            float k = fract(az / 6.2832 * 5.0) - 0.5, win = abs(k) * 6.2832 / 5.0 * WR;
            float top = 1.3 + sqrt(max(0.0, 0.09 - win * win)) - 0.3;
            if (win < 0.25 && yw > 0.0 && yw < top) c = dusk(d) * 0.7 * (1.0 - 0.7 * smoothstep(0.015, 0.0, abs(win - 0.0)));
            else if (abs(k + 0.5) < 0.07 || abs(k - 0.5) < 0.07) {}
            if (abs(abs(k) - 0.28) < 0.07 && yw > 0.2 && yw < 0.9) c = vec3(0.12, 0.06, 0.03) + vec3(0.6, 0.45, 0.15) * step(0.5, fbm(vec3(az * 80.0, yw * 40.0, 1.0))) * step(fract(yw * 14.0), 0.5) * 0.4;
            c += vec3(0.45, 0.25, 0.1) * 0.12 * smoothstep(1.2, -1.2, yw);   // warm light from below
          } else {
            vec3 p = d * (CEIL / d.y);
            if (length(p.xz) > HOLE) {
              float beam = smoothstep(0.03, 0.0, abs(fract(p.x * 1.2) - 0.5) - 0.42);
              c = vec3(0.1, 0.055, 0.03) * (0.7 + 0.4 * fbm(p * 3.0)) + vec3(0.05, 0.025, 0.01) * beam;
            } else if (yw < TOP) {
              // the belfry: stone with louvred openings
              vec3 q = d * tw;
              c = stone(q) * 0.45;
              float k = fract(az / 6.2832 * 4.0 + 0.125) - 0.5, wx = abs(k) * 6.2832 / 4.0 * WR;
              if (wx < 0.45 && yw > 3.3 && yw < 5.6) {
                float louvre = step(0.45, fract(yw * 7.0));
                c = mix(dusk(d) * 0.55, vec3(0.06, 0.035, 0.02), louvre);
              }
            } else c = vec3(0.04, 0.025, 0.015) * (0.7 + 0.5 * fbm(d * 10.0));
          }
          gl_FragColor = vec4(grade(c), uFade); }`,
    })));

    // the bell frame: a ring of timber at the bells' gudgeons
    const timber = plainMat(U, '#4a2a14', 'c *= 0.8 + 0.3 * fbm(vP * 8.0);');
    const frame = new THREE.Mesh(new THREE.TorusGeometry(BELL_R, 0.07, 4, 64), timber);
    frame.rotation.x = Math.PI / 2; frame.position.y = BELL_Y + 0.02;
    this.rig.add(frame);

    const ropeMat = plainMat(U, '#c8b48a', 'c *= 0.8 + 0.3 * sin(vP.y * 300.0);');
    const segment = (a, b, r, mat) => {
      const len = a.distanceTo(b);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      return m;
    };

    this.bells = CB_NOTES.map(([name, f], k) => {
      const a = (k - (CB_NOTES.length - 1) / 2) * 0.42;
      const R = 0.22 + k * 0.022, H = R * 1.15;
      const col = new THREE.Color().setHSL(0.08 + k * 0.025, 0.9, 0.6);
      const u = { ...U, uRing: { value: 0 }, uCol: { value: col }, uMetal: { value: new THREE.Color(0.55, 0.38, 0.2) } };
      // bell in its headstock, swinging about the axis along the frame
      const mount = new THREE.Group();
      mount.position.set(Math.sin(a) * BELL_R, BELL_Y, -Math.cos(a) * BELL_R);
      mount.lookAt(0, BELL_Y, 0);
      const swing = new THREE.Group();
      mount.add(swing);
      const pts = [[1, 0], [0.96, 0.07], [0.84, 0.17], [0.72, 0.32], [0.64, 0.52], [0.61, 0.74], [0.57, 0.9], [0.4, 1.0], [0, 1.02]].map(([x, y]) => new THREE.Vector2(Math.max(0.001, x * R), -H - 0.08 + y * H));
      const body = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), brassMat(u));
      const stock = new THREE.Mesh(new THREE.BoxGeometry(R * 1.6, 0.1, 0.12), timber);
      stock.position.y = -0.03;
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(R + 0.16, 0.018, 6, 48), timber);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(R * 0.85, -0.05, 0);
      const halo = haloMesh(u, R);
      halo.position.y = -H - 0.08;
      swing.add(body, stock, wheel, halo);
      this.rig.add(mount);
      mount.updateMatrix();
      const wheelFoot = new THREE.Vector3(R * 0.85, -0.05 - (R + 0.16), 0).applyMatrix4(mount.matrix);

      // the rope: up through a hole in the ceiling to the wheel; the sally at hand height
      const x = Math.sin(a) * ROPE_R, z = -Math.cos(a) * ROPE_R;
      const guide = new THREE.Vector3(x, CEIL, z);
      this.rig.add(segment(guide, wheelFoot, 0.011, ropeMat));
      const lower = new THREE.Group();
      lower.position.set(x, 0, z);
      lower.add(segment(new THREE.Vector3(0, -0.95, 0), new THREE.Vector3(0, CEIL + 0.4, 0), 0.011, ropeMat));
      const su = { uFade: U.uFade, uTime: U.uTime, uNext: { value: 0 }, uPull: { value: 0 } };
      const sally = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.42, 20), new THREE.ShaderMaterial({
        uniforms: su,
        vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vP = position; vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: /* glsl */ `uniform float uFade, uTime, uNext, uPull; varying vec3 vN; varying vec3 vP;
          void main(){ float l = 0.45 + 0.55 * max(dot(normalize(vN), normalize(vec3(-0.3, 0.6, 0.6))), 0.0);
            float s = fract(vP.y * 9.0 + atan(vP.z, vP.x) / 6.2832);
            vec3 c = s < 0.33 ? vec3(0.75, 0.08, 0.08) : s < 0.66 ? vec3(0.9, 0.88, 0.82) : vec3(0.1, 0.2, 0.6);
            c *= l * (0.85 + 0.15 * sin(vP.y * 400.0) * sin(atan(vP.z, vP.x) * 30.0));   // woolly
            c += vec3(1.0, 0.8, 0.45) * (uNext * (0.35 + 0.25 * sin(uTime * 4.0)) + uPull * 0.6);
            gl_FragColor = vec4(c * uFade, 1.0); }`,
      }));
      sally.position.y = -0.1;
      const tail = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.011, 6, 20), ropeMat);
      tail.position.y = -0.98;
      lower.add(sally, tail);
      this.rig.add(lower);

      const label = textPlane(U, 0.16, 0.035);
      label.userData.set(name);
      label.material.uniforms.uA.value = 0.35;
      label.position.set(x * 0.8, -0.42, z * 0.8);
      label.rotation.y = -a;
      this.rig.add(label);
      return { k, name, f, a, R, u, halo, swing, lower, su, x, z, theta: SWING, from: SWING, to: SWING, st: 9, struck: true, ring: 0, haloT: 9, N: null, grab: null };
    });
    this.next = 0;
    this.rounds = 0;

    this.hint = textPlane(U, 1.0, 0.06);
    this.hint.position.set(0, 0.32, -0.95);
    this.hint.userData.set('Pull a rope to ring its bell · follow the glow to ring rounds');
    this.rig.add(this.hint);
  }

  _pull(b, strength) {
    if (b.st < SWING_T * 0.75) return;   // still swinging over
    b.from = b.theta; b.to = -Math.sign(b.theta || 1) * SWING; b.st = 0; b.struck = false; b.strength = strength;
    b.pulled = 1;
    // rounds: treble to tenor, over and over
    if (b.k === this.next) { this.next = (this.next + 1) % this.bells.length; if (this.next === 0) this.rounds++; }
    else this.next = b.k === 0 ? 1 : 0;
    this.hintA = Math.min(this.hintA, 0.99);
  }

  _strike(b) {
    if (!b.N || b.N.dead) b.N = bellOut(this, Math.max(-0.7, Math.min(0.7, Math.sin(b.a) * 0.9)), 1.0);
    if (b.N) strikeVoice(b.N, b.f, CB_PARTIALS, 0.075 * (0.7 + 0.4 * (b.strength || 0.6)), 2.5);
    b.ring = 1; b.haloT = 0;
  }

  update(dt, t) {
    if (this.placeNext) this.placeNext = !this._place();
    this.rig.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(this.rig.matrixWorld).invert();
    const pointers = (this.demo ? this._demoPointers(t) : INPUT.pointers).map((p) => this._local(p, inv));
    const over = this.hideRays ||= new Set();
    over.clear();

    for (const p of pointers) {
      // the rope nearest this pointer, between the tail end and well above the sally
      let best = null, bd = Infinity, at = null;
      for (const b of this.bells) {
        const yOff = b.lower.position.y;
        let off, y;
        if (p.tip) { off = Math.hypot(p.tip.x - b.x, p.tip.z - b.z); y = p.tip.y - yOff; off /= 0.06; }
        else {
          // closest approach of the ray to the vertical rope line
          const w = new THREE.Vector3(p.o.x - b.x, 0, p.o.z - b.z), dd = new THREE.Vector3(p.d.x, 0, p.d.z);
          const tt = dd.lengthSq() > 1e-6 ? Math.max(0, -w.dot(dd) / dd.lengthSq()) : 0;
          off = w.addScaledVector(dd, tt).length() / 0.055;
          y = p.o.y + p.d.y * tt - yOff;
        }
        if (y < -1.0 || y > 0.4) continue;
        if (off < 1 && off < bd) { bd = off; best = b; at = y; }
      }
      if (best) over.add(p.id);
      // grab and pull down; a quick press-and-release rings it too
      const grabbing = this.bells.find((b) => b.grab && b.grab.id === p.id);
      if (grabbing) {
        const y = p.tip ? p.tip.y : p.o.y + p.d.y * grabbing.grab.t;
        const drop = grabbing.grab.y - y;
        grabbing.su.uPull.value = Math.min(1, Math.max(0, drop / 0.08));
        if (drop > 0.06 || !p.held) { this._pull(grabbing, Math.min(1, drop / 0.25 + 0.4)); grabbing.grab = null; }
        continue;
      }
      if (best && p.press) {
        const tt = p.tip ? 0 : Math.hypot(best.x - p.o.x, best.z - p.o.z) / Math.max(1e-3, Math.hypot(p.d.x, p.d.z));
        best.grab = { id: p.id, y: p.tip ? p.tip.y : p.o.y + p.d.y * tt, t: tt };
        if (!p.held) { this._pull(best, 0.6); best.grab = null; }
      }
    }

    for (const b of this.bells) {
      // over the balance and back: ease in and out, the clapper speaking near the top
      b.st += dt;
      const s = Math.min(1, b.st / SWING_T);
      b.theta = b.from + (b.to - b.from) * (0.5 - 0.5 * Math.cos(Math.PI * s));
      if (!b.struck && s > 0.82) { b.struck = true; this._strike(b); }
      b.swing.rotation.x = b.theta;
      // the rope rises and falls with the wheel; the sally comes down at handstroke
      b.lower.position.y = -0.22 * (b.theta / SWING) - 0.05;
      b.pulled = (b.pulled || 0) * Math.exp(-dt * 3);
      if (!b.grab) b.su.uPull.value = b.pulled * 0.6;
      b.su.uNext.value += ((b.k === this.next ? 1 : 0) - b.su.uNext.value) * (1 - Math.exp(-dt * 5));
      b.ring *= Math.exp(-dt / 2.0);
      b.haloT += dt;
      b.u.uRing.value = b.ring * 0.6;
      const hs = 1 + b.haloT * 3;
      b.halo.scale.set(hs, hs, hs);
      b.halo.material.uniforms.uA.value = Math.max(0, 1 - b.haloT / 1.4) * 0.8;
    }
    this._hint(dt, t);
  }

  // for previews: rounds, rung steadily
  _demoPointers(t) {
    const step = Math.floor(t / 0.5), b = this.bells[step % this.bells.length];
    const press = step !== this._demoStep; this._demoStep = step;
    const p = new THREE.Vector3(b.x, b.lower.position.y - 0.1, b.z).applyMatrix4(this.rig.matrixWorld);
    return [{ id: 'demo', origin: p.clone().add(new THREE.Vector3(0, 0, 0.3)), dir: new THREE.Vector3(0, 0, -1), tip: null, press, held: false }];
  }
}
