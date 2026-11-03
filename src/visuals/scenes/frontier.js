import * as THREE from 'three';
import { BaseScene, NOISE, GRADE, STARS, SFX, damp } from '../common.js';

// ===================================================================== Final frontier
// An astronaut's view of a launch. The countdown on your panel, the rumble
// building, then lift-off: the tower drops away, the coast falls below you,
// you punch up through the clouds as the blue sky deepens to indigo and then
// black, the stage separates with a jolt, the stars come out and you coast in
// orbit above the glowing curve of the Earth. Then it all begins again.
const R = 6371;                  // Earth radius, km
const COUNT = 10, ASCENT = 130, ORBIT = 75, CYCLE = COUNT + ASCENT + ORBIT + 6;
const altAt = (t) => (t <= 0 ? 0.002 : t >= ASCENT ? 400 : 0.002 + 400 * Math.pow(t / ASCENT, 2.3));

export class FinalFrontierScene extends BaseScene {
  constructor() {
    super();
    const U = this.uniforms;
    Object.assign(U, { uAlt: { value: 0.002 }, uFlash: { value: 0 }, uDark: { value: 1 }, uSun: { value: new THREE.Vector3(0.55, 0.25, -0.8).normalize() } });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 96, 64), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, transparent: true, uniforms: U,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */ `uniform float uTime, uFade, uAlt, uFlash, uDark; uniform vec3 uSun; varying vec3 vDir; ${NOISE} ${GRADE} ${STARS}
        // where a ray from you meets a sphere around the Earth's centre (km)
        // hs: your height above that sphere (keeps the maths precise near the ground)
        float hitSphere(vec3 o, vec3 d, float r, float hs){ float b = dot(o, d), c = hs * (2.0 * r + hs), h = b * b - c; if (h < 0.0) return -1.0; h = sqrt(h); float t = -b - h; return t > 0.0 ? t : (-b + h > 0.0 ? -b + h : -1.0); }
        vec3 surface(vec3 p){
          // the Earth's face: oceans, coasts and land, coarse from space, fields near the ground
          vec2 q = p.xz;
          float land = fbm(vec3(q * 0.004, 1.0)) + 0.35 * fbm(vec3(q * 0.03, 2.0)) - 0.62 + smoothstep(8.0, -8.0, q.x) * 0.35;
          vec3 sea = mix(vec3(0.02, 0.1, 0.25), vec3(0.05, 0.25, 0.4), fbm(vec3(q * 0.05, 3.0)));
          vec3 ground = mix(vec3(0.16, 0.28, 0.1), vec3(0.42, 0.36, 0.22), fbm(vec3(q * 0.02, 4.0)));
          ground *= 0.85 + 0.25 * fbm(vec3(q * 0.25, 5.0));
          return mix(sea, ground, smoothstep(0.0, 0.02, land));
        }
        void main(){ vec3 d = normalize(vDir);
          float h = uAlt;
          vec3 o = vec3(0.0, R_ + h, 0.0);
          float space = smoothstep(15.0, 90.0, h);
          // the sky: bright blue near the ground, deepening to indigo and black with height
          vec3 skyLo = mix(vec3(0.62, 0.78, 0.95), vec3(0.1, 0.18, 0.45), smoothstep(2.0, 30.0, h));
          vec3 skyHi = mix(vec3(0.25, 0.48, 0.88), vec3(0.0), smoothstep(5.0, 60.0, h));
          float horizonEl = -acos(clamp(R_ / (R_ + h), 0.0, 1.0));   // the horizon dips as you climb
          float el = asin(clamp(d.y, -1.0, 1.0));
          vec3 c = mix(skyLo, skyHi, smoothstep(horizonEl, horizonEl + mix(0.6, 0.15, space), el));
          // stars once you're above the air
          vec2 st = starDot(d, 260.0, 0.985);
          c += vec3(0.9, 0.95, 1.0) * st.x * space * (0.7 + 0.3 * sin(uTime * (1.0 + st.y * 3.0) + st.y * 40.0));
          // the sun
          float mu = max(dot(d, uSun), 0.0);
          c += vec3(1.0, 0.95, 0.85) * (pow(mu, 900.0) * 6.0 + pow(mu, 40.0) * mix(0.35, 0.15, space));
          // the Earth below
          float tg = hitSphere(o, d, R_, h);
          if (tg > 0.0) {
            vec3 p = o + d * tg;
            vec3 n = normalize(p);
            vec3 col = surface(p) * (0.25 + 0.85 * max(dot(n, uSun), 0.0));
            // cloud cover, seen from above or below
            float tc = hitSphere(o, d, R_ + 4.0, h - 4.0);
            float cl = 0.0;
            if (h > 4.0 && tc > 0.0 && tc < tg) { vec3 pc = o + d * tc; cl = smoothstep(0.5, 0.75, fbm(vec3(pc.xz * 0.02, 7.0)) * 0.7 + fbm(vec3(pc.xz * 0.12, 8.0)) * 0.3); }
            col = mix(col, vec3(0.95) * (0.5 + 0.6 * max(dot(n, uSun), 0.0)), cl * 0.9);
            // haze thickens toward the horizon
            float haze = 1.0 - exp(-tg * mix(0.02, 0.0006, space));
            col = mix(col, mix(vec3(0.6, 0.75, 0.95), vec3(0.3, 0.5, 0.95), space), haze);
            c = col;
          }
          // the thin blue glow of the atmosphere along the curve of the Earth
          float limb = exp(-abs(el - horizonEl) * 60.0) * space;
          c += vec3(0.25, 0.5, 1.0) * limb * 0.9 + vec3(0.6, 0.8, 1.0) * exp(-abs(el - horizonEl - 0.004) * 400.0) * space * 0.4;
          // clouds overhead while you're still below them
          if (h < 4.0 && d.y > 0.0) {
            float tc = hitSphere(o, d, R_ + 4.0, h - 4.0);
            vec3 pc = o + d * tc;
            float cl = smoothstep(0.5, 0.75, fbm(vec3(pc.xz * 0.02, 7.0)) * 0.7 + fbm(vec3(pc.xz * 0.12, 8.0)) * 0.3);
            c = mix(c, vec3(0.92, 0.94, 0.97), cl * 0.85 * exp(-tc * 0.02));
          }
          // passing through the cloud layer: a whiteout
          c = mix(c, vec3(0.9, 0.92, 0.95), exp(-pow((h - 4.0) / 0.8, 2.0)) * 0.9);
          c += vec3(1.0, 0.85, 0.6) * uFlash;
          gl_FragColor = vec4(grade(c * uDark), uFade); }`.replace(/R_/g, R.toFixed(1)),
    }));
    sky.renderOrder = -10;
    this.group.add(sky);

    // the launch tower beside you, dropping away at lift-off
    const iron = new THREE.MeshBasicMaterial({ color: 0x5a4a3a });
    this.tower = new THREE.Group();
    for (let k = 0; k < 4; k++) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 70, 0.25), iron); leg.position.set((k % 2) * 2.4, -30, Math.floor(k / 2) * 2.4); this.tower.add(leg); }
    for (let y = -64; y < 5; y += 3) { const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.15, 0.15), iron); bar.position.set(1.2, y, 0); this.tower.add(bar); const bar2 = bar.clone(); bar2.position.z = 2.4; this.tower.add(bar2); }
    this.tower.position.set(6, 0, -3);
    this.group.add(this.tower);

    // your instrument panel: countdown, altitude, speed
    this.cv = document.createElement('canvas'); this.cv.width = 512; this.cv.height = 160;
    this.tex = new THREE.CanvasTexture(this.cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.25), new THREE.MeshBasicMaterial({ map: this.tex, transparent: true }));
    panel.position.set(0, 0.95, -0.8); panel.rotation.x = -0.6;
    this.group.add(panel);
    const sill = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.5), new THREE.MeshBasicMaterial({ color: 0x15171c }));
    sill.position.set(0, 0.84, -0.85);
    this.group.add(sill);

    this.t = -COUNT; this.prev = 0; this.nextRumble = 0; this.lastSec = 99; this.staged = false;
  }
  _sfx(kind, o) { if (this.fade > 0.5) SFX.play(kind, o); }
  _panel(text, alt, spd) {
    const c = this.cv.getContext('2d');
    c.clearRect(0, 0, 512, 160);
    c.fillStyle = 'rgba(8,12,18,0.85)'; c.fillRect(0, 0, 512, 160);
    c.strokeStyle = 'rgba(120,200,255,0.5)'; c.lineWidth = 3; c.strokeRect(4, 4, 504, 152);
    c.fillStyle = '#9fe0ff'; c.font = '600 46px Jost, system-ui, sans-serif'; c.textAlign = 'center';
    c.fillText(text, 256, 64);
    c.font = '400 30px Jost, system-ui, sans-serif'; c.fillStyle = '#cfe8ff';
    c.fillText(`ALT ${alt}   ·   SPD ${spd}`, 256, 124);
    this.tex.needsUpdate = true;
  }
  update(dt) {
    const U = this.uniforms;
    this.t += dt;
    if (this.t > CYCLE - COUNT) { this.t = -COUNT; this.staged = false; }
    const t = this.t;
    const h = altAt(t);
    U.uAlt.value = h;
    const speed = Math.max(0, (h - this.prev) / Math.max(dt, 1e-3)) * 3600;   // km/h
    this.prev = h;
    // fade to dark at the end of the cycle, and back
    U.uDark.value = t > ASCENT + ORBIT ? Math.max(0, 1 - (t - ASCENT - ORBIT) / 4) : Math.min(1, (t + COUNT) / 2);
    // the tower drops away as you rise
    this.tower.position.y = -h * 1000;
    this.tower.visible = h < 0.12;
    // a rumble that builds before lift-off and shakes you through the climb, then silence
    const shake = t < 0 ? Math.max(0, (t + 4) / 4) * 0.4 : t < 75 ? 1 - t / 90 : 0;
    this.group.position.set((Math.random() - 0.5) * 0.008 * shake, (Math.random() - 0.5) * 0.008 * shake, 0);
    this.nextRumble -= dt;
    if (shake > 0.05 && this.nextRumble <= 0) { this._sfx('thud', { pan: (Math.random() - 0.5) * 0.4, gain: 0.25 + shake * 0.5, decay: 0.9 }); this.nextRumble = 0.35 + Math.random() * 0.2; }
    if (t > 0 && t - dt <= 0) this._sfx('whoosh', { pan: 0, dur: 6, gain: 0.7 });
    // stage separation: a flash and a jolt
    if (t > 62 && !this.staged) { this.staged = true; U.uFlash.value = 0.6; this._sfx('thud', { pan: 0, gain: 1.4, decay: 1.2 }); }
    U.uFlash.value *= Math.exp(-dt * 3);
    // the panel
    const sec = Math.ceil(-t);
    let label;
    if (t < 0) label = sec > 0 ? `T − ${sec}` : 'IGNITION';
    else if (t < 3) label = 'LIFT-OFF';
    else if (t < 60) label = 'ASCENT';
    else if (t < 68) label = 'STAGE SEPARATION';
    else if (t < ASCENT) label = 'ORBIT INSERTION';
    else label = 'IN ORBIT';
    const key = `${label}${Math.round(h * 10)}${Math.round(speed / 50)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this._panel(label, h < 1 ? `${Math.round(h * 1000)} m` : `${h.toFixed(h < 10 ? 1 : 0)} km`, t < ASCENT ? `${Math.round(speed).toLocaleString()} km/h` : '27,600 km/h');
    }
  }
}
