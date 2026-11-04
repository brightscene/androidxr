import * as THREE from 'three';
import { SYMBOLS } from '../visuals/strobe.js';
import { BACKGROUNDS, SCENES } from '../visuals/scenes/index.js';
import SCENE_PALETTES from './scenePalettes.json';
import { PRICES } from '../journeys.js';

// In-headset UI: canvas-textured panels you point at and pinch (hands) or
// trigger (controllers). Works with any WebXR input that has a target ray,
// which on Android XR includes hand pinch and eye-gaze+pinch transient input.
//
// Tabs: Journeys · Sound · Lights · Voice. Everything on the flat-screen menu
// is reachable here too. During a session, pinch on empty space (or the ☰ orb)
// to bring the menu back.

const FONT = '"Inter", "Segoe UI", system-ui, sans-serif';

class Button {
  constructor(w, h, draw, onSelect, px = 900) {
    this.w = w; this.h = h; this.draw = draw; this.onSelect = onSelect;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(px * w);
    this.canvas.height = Math.round(px * h);
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, depthTest: false })
    );
    this.mesh.renderOrder = 1000;
    this.mesh.userData.button = this;
    this.hover = false;
    this.redraw();
  }
  redraw() {
    const c = this.canvas.getContext('2d');
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.draw(c, this.canvas.width, this.canvas.height, this);
    this.tex.needsUpdate = true;
  }
  setHover(h) { if (h !== this.hover) { this.hover = h; this.redraw(); } }
  dispose() { this.tex.dispose(); this.mesh.geometry.dispose(); this.mesh.material.dispose(); this.mesh.removeFromParent(); }
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

const val = (v) => (typeof v === 'function' ? v() : v);

function pill(label, isOn) {
  return (c, w, h, b) => {
    const on = isOn ? isOn() : false;
    roundRect(c, 4, 4, w - 8, h - 8, (h - 8) / 2);
    c.fillStyle = on ? 'rgba(255,255,255,0.92)' : b.hover ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    c.fill();
    c.strokeStyle = b.hover ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)';
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = on ? '#111' : '#fff';
    let size = Math.round(h * 0.4);
    c.font = `500 ${size}px ${FONT}`;
    const text = val(label);
    while (c.measureText(text).width > w - 24 && size > 10) { size -= 2; c.font = `500 ${size}px ${FONT}`; }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
  };
}

function textDraw(text, { size = 0.42, weight = 400, alpha = 0.7, align = 'left' } = {}) {
  return (c, w, h) => {
    c.fillStyle = `rgba(255,255,255,${alpha})`;
    c.font = `${weight} ${Math.round(h * size)}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillText(val(text), align === 'left' ? 6 : align === 'center' ? w / 2 : w - 6, h / 2 + 2);
  };
}

// wrap text into at most n lines that fit width w
function wrap(c, text, w, n) {
  const out = []; let line = '';
  for (const word of text.split(/\s+/)) {
    const t = line ? line + ' ' + word : word;
    if (c.measureText(t).width <= w) { line = t; continue; }
    if (line) out.push(line);
    line = word;
    if (out.length === n) break;
  }
  if (out.length < n && line) out.push(line);
  if (out.length === n && out.join(' ').length < text.length) {
    let l = out[n - 1]; while (l && c.measureText(l + '…').width > w) l = l.slice(0, -1);
    out[n - 1] = l.trimEnd() + '…';
  }
  return out;
}

// A journey preview: 100 frames (10×10 sheet, 5 per second) played on the GPU,
// cross-fading between frames so it moves smoothly. Works inside immersive
// mode, where HTML video elements are often paused by the browser.
function previewMaterial(tint, planes) {
  return new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, clipping: true, clippingPlanes: planes,
    uniforms: { map: { value: null }, uT: { value: 0 }, uTint: { value: new THREE.Color(tint) } },
    vertexShader: `#include <clipping_planes_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <clipping_planes_vertex>
      }`,
    fragmentShader: `#include <clipping_planes_pars_fragment>
      uniform sampler2D map; uniform float uT; uniform vec3 uTint; varying vec2 vUv;
      vec2 cell(float i, vec2 uv) {
        float col = mod(i, 10.0), row = floor(i / 10.0);
        uv = mix(vec2(0.004), vec2(0.996), uv);            // keep clear of the neighbouring frame
        return vec2((col + uv.x) / 10.0, 1.0 - (row + 1.0 - uv.y) / 10.0);
      }
      void main() {
        #include <clipping_planes_fragment>
        // rounded corners
        vec2 q = abs(vUv - 0.5) * vec2(0.26, 0.146) - (vec2(0.13, 0.073) - 0.014);
        float rr = length(max(q, 0.0)) - 0.014;
        if (rr > 0.0) discard;
        float f = mod(uT * 5.0, 100.0), i0 = floor(f), i1 = mod(i0 + 1.0, 100.0);
        vec3 c = mix(texture(map, cell(i0, vUv)).rgb, texture(map, cell(i1, vUv)).rgb, smoothstep(0.0, 1.0, fract(f)));
        // until the frames arrive, a soft glow in the journey's colour
        vec2 d = vUv - 0.5;
        vec3 wait = uTint * (0.25 + 0.5 * exp(-dot(d, d) * 8.0));
        c = textureSize(map, 0).x > 4 ? c : wait;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}

const TABS = ['Journeys', 'Scene', 'Sound', 'Session', 'Lights', 'Voice'];
const MARK = typeof Image !== 'undefined' ? Object.assign(new Image(), { src: 'icons/mark.svg' }) : {};
const W = 1.56, H = 1.34;
const ROW0 = 0.33, ROWH = 0.1, LX = -0.74, PX = -0.4;
const J_TOP = 0.435, J_BOT = -0.47;   // the journey list window, with room beneath the logo and version

export class XRMenu {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.buttons = [];
    this.visible = true;
    this.tab = 'Journeys';
    this.raycaster = new THREE.Raycaster();
    this.controllers = [];
    this._build();
  }

  _btn(parent, btn, x, y, dynamic = true) {
    btn.mesh.position.set(x, y, 0);
    btn.dynamic = dynamic;
    parent.add(btn.mesh);
    this.buttons.push(btn);
    return btn;
  }

  // A labelled row of option pills. opts: [[label, value], ...]
  _row(parent, i, label, opts, get, set, widths) {
    const y = ROW0 - i * ROWH;
    this._btn(parent, new Button(0.32, 0.07, textDraw(label, { alpha: 0.65 })), LX + 0.16, y, false);
    let x = PX;
    opts.forEach(([text, v], k) => {
      const w = (widths && widths[k]) || 0.17;
      this._btn(parent, new Button(w, 0.07, pill(text, () => get() === v), () => set(v)), x + w / 2, y);
      x += w + 0.014;
    });
  }

  _build() {
    const app = this.app;
    this.panel = new THREE.Group();
    this.group.add(this.panel);

    const bg = new Button(W, H, (c, w, h) => {
      const k = w / 650;
      roundRect(c, 0, 0, w, h, 56 * k);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(10,10,28,0.93)');
      g.addColorStop(1, 'rgba(10,10,28,0.86)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.lineWidth = 4 * k;
      c.stroke();
      // the brand: light-tunnel mark, then "mind" + gradient "lyte", version beneath
      if (MARK.complete && MARK.naturalWidth) c.drawImage(MARK, 22 * k, 20 * k, 56 * k, 56 * k);
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.font = `300 ${28 * k}px Comfortaa, Jost, system-ui, sans-serif`;
      c.fillStyle = '#e9e4ff';
      const x0 = 86 * k, yb = 54 * k;
      c.fillText('mind', x0, yb);
      const mw = c.measureText('mind').width;
      c.font = `500 ${28 * k}px Comfortaa, Jost, system-ui, sans-serif`;
      const lw = c.measureText('lyte').width;
      const lg = c.createLinearGradient(x0 + mw, 0, x0 + mw + lw, 0);
      lg.addColorStop(0, '#5ED6D0'); lg.addColorStop(0.55, '#A493FF'); lg.addColorStop(1, '#F29BD0');
      c.fillStyle = lg;
      c.fillText('lyte', x0 + mw, yb);
      c.font = `400 ${11 * k}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillText(`v${__BUILD__}`, x0 + 2 * k, yb + 18 * k);
    }, null, 1300);
    // redraw once the logo and brand font have loaded
    const again = () => bg.redraw();
    if (!MARK.complete) MARK.addEventListener('load', again, { once: true });
    document.fonts?.load('500 40px Comfortaa').then(again, () => {});
    document.fonts?.load('300 40px Comfortaa').then(again, () => {});
    bg.mesh.position.set(0, -0.02, -0.01);
    bg.mesh.renderOrder = 999;
    this.panel.add(bg.mesh);

    // an invisible target over the logo: a long pinch on it switches Premium on or off (testing)
    this.brandBtn = this._btn(this.panel, new Button(0.46, 0.14, () => {}, () => {}), -0.53, 0.55, false);

    // tabs
    TABS.forEach((name, i) => {
      this._btn(this.panel, new Button(0.148, 0.075, pill(name, () => this.tab === name), () => this.setTab(name)), -0.125 + i * 0.155, 0.53);
    });

    this.pages = {};
    for (const t of TABS) { this.pages[t] = new THREE.Group(); this.panel.add(this.pages[t]); }

    this._buildJourneys();
    this._buildScene();
    this._buildSound();
    this._buildSession();
    this._buildLights();
    this._buildVoice();

    // footer
    const fy = -0.6;
    this._btn(this.panel, new Button(0.27, 0.09, pill('Center View'), () => app.recentre()), -0.58, fy);
    this.endBtn = this._btn(this.panel, new Button(0.24, 0.09, pill('End session'), () => app.stop()), -0.12, fy);
    this.closeBtn = this._btn(this.panel, new Button(0.17, 0.09, pill('Close'), () => this.show(false)), 0.1, fy);
    this._btn(this.panel, new Button(0.28, 0.09, pill('Exit Immersive'), () => app.exitXR()), 0.6, fy);
    // on the other tabs: start (or go back to) the selected journey and close the menu
    this.beginBtn = this._btn(this.panel, new Button(0.22, 0.09, (c, w, h, b) => {
      roundRect(c, 4, 4, w - 8, h - 8, (h - 8) / 2);
      c.fillStyle = b.hover ? '#fff' : 'rgba(255,255,255,0.86)'; c.fill();
      c.fillStyle = '#111'; c.font = `600 ${Math.round(h * 0.36)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(!app.playing && !app.selected.free && !app.premium ? 'Unlock' : 'Begin', w / 2, h / 2 + 2);
    }, () => app.beginOrResume()), 0.33, fy);

    // toggle orb shown during a session
    this.orb = new Button(0.14, 0.17, (c, w, h, b) => {
      // the brand mark, with "Menu" beneath it
      c.beginPath();
      c.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
      c.fillStyle = b.hover ? 'rgba(40,36,80,0.85)' : 'rgba(10,10,28,0.6)';
      c.fill();
      if (b.hover) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 4; c.stroke(); }
      if (MARK.complete && MARK.naturalWidth) c.drawImage(MARK, w * 0.12, w * 0.12, w * 0.76, w * 0.76);
      c.font = `500 ${Math.round(h * 0.15)}px ${FONT}`;
      c.textAlign = 'center';
      c.fillStyle = '#fff';
      c.fillText('Menu', w / 2, h - 8);
    }, () => this.show(true));
    if (!MARK.complete) MARK.addEventListener('load', () => this.orb.redraw(), { once: true });
    this.group.add(this.orb.mesh);
    this.buttons.push(this.orb);
    // the orb lives on your left wrist during a session: a short note says so, where it used to be
    // beside it on the wrist: the sound mixer, one tap away
    this.soundBtn = new Button(0.1, 0.1, (c, w, h, b) => {
      c.beginPath(); c.arc(w / 2, h / 2, w / 2 - 5, 0, Math.PI * 2);
      c.fillStyle = b.hover ? 'rgba(40,36,80,0.85)' : 'rgba(10,10,28,0.6)'; c.fill();
      c.strokeStyle = 'rgba(200,190,255,0.6)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#fff';   // a little speaker with sound waves
      c.beginPath(); c.moveTo(w * 0.24, h * 0.42); c.lineTo(w * 0.34, h * 0.42); c.lineTo(w * 0.48, h * 0.3); c.lineTo(w * 0.48, h * 0.7); c.lineTo(w * 0.34, h * 0.58); c.lineTo(w * 0.24, h * 0.58); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 4;
      for (const r of [0.12, 0.2]) { c.beginPath(); c.arc(w * 0.48, h * 0.5, w * r, -0.8, 0.8); c.stroke(); }
    }, () => { this.show(true); this.setTab('Sound'); }, 600);
    this.soundBtn.mesh.visible = false;
    this.group.add(this.soundBtn.mesh);
    this.buttons.push(this.soundBtn);
    this.wristNote = new Button(0.62, 0.075, (c, w, h) => {
      roundRect(c, 3, 3, w - 6, h - 6, (h - 6) / 2);
      c.fillStyle = 'rgba(12,10,30,0.55)'; c.fill();
      c.strokeStyle = 'rgba(190,170,255,0.6)'; c.lineWidth = 3; c.stroke();
      c.fillStyle = '#fff'; c.font = `400 ${Math.round(h * 0.36)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('Menu: raise your left wrist and look at it', w / 2, h / 2 + 2);
    }, null, 800);
    this.wristNote.mesh.material.opacity = 0;
    this.wristNote.mesh.visible = false;
    this.group.add(this.wristNote.mesh);
    this.wristNoteT = 99;
    this.orbWanted = false;

    // breathing cue / captions
    this.cue = new Button(0.8, 0.14, (c, w, h) => {
      const s = this.cueState || {};
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.textAlign = 'center';
      let size = Math.round(h * 0.38);
      c.font = `300 ${size}px ${FONT}`;
      while (c.measureText(s.text || '').width > w - 20 && size > 14) { size -= 2; c.font = `300 ${size}px ${FONT}`; }
      c.fillText(s.text || '', w / 2, h * 0.48);
      c.font = `400 ${Math.round(h * 0.17)}px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillText(s.sub || '', w / 2, h * 0.86);
    }, null, 800);
    this.cue.mesh.material.opacity = 0;
    this.group.add(this.cue.mesh);

    this._buildWarning();
    this.setTab('Journeys');
  }

  // Journeys: two cards side by side in one scrolling list, in two sections,
  // Free and Premium. Each card has a moving preview on the left. Scroll by
  // pinching and dragging the list, or with the thumbstick.
  _buildJourneys() {
    const app = this.app, page = this.pages.Journeys;
    const J = app.journeys;
    this.jList = new THREE.Group();
    page.add(this.jList);
    this.jScroll = 0; this.jVel = 0;
    this.sheets = new Map();
    this.jCards = [];
    // clip the list to its window (planes are refreshed in world space each frame)
    this.clipPlanes = [new THREE.Plane(), new THREE.Plane()];
    const clipMat = (m) => { m.clippingPlanes = this.clipPlanes; m.clipIntersection = false; return m; };
    const CW = 0.73, CH = 0.2, GAP = 0.02, PVW = 0.26, PVH = 0.146;
    let y = J_TOP;
    const head = (label) => {
      const h = this._btn(this.jList, new Button(1.48, 0.085, (c, w, hh) => {
        c.textAlign = 'left'; c.fillStyle = '#fff';
        c.font = `600 ${Math.round(hh * 0.55)}px ${FONT}`;
        c.fillText(label, 10, hh * 0.7);
        if (label === 'Premium Interactive') {
          c.font = `400 ${Math.round(hh * 0.4)}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.7)';
          c.fillText('Play with your hands', 520, hh * 0.68);
        }
        if (label === 'Premium') {
          c.font = `400 ${Math.round(hh * 0.4)}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.7)';
          c.fillText(app.premium ? 'Unlocked · thank you' : `${PRICES.month}  ·  ${PRICES.year}`, 280, hh * 0.68);
        }
      }), 0, y - 0.0425);
      clipMat(h.mesh.material); h.mesh.userData.clip = true;
      this.jCards.push({ b: h, y: y - 0.0425, h: 0.085 });
      if (label === 'Premium') {
        this.jUnlock = this._btn(this.jList, new Button(0.26, 0.065, pill('Unlock Premium'), () => this.showUnlock(true)), 0.6, y - 0.0425);
        clipMat(this.jUnlock.mesh.material); this.jUnlock.mesh.userData.clip = true;
        this.jCards.push({ b: this.jUnlock, y: y - 0.0425, h: 0.065, unlock: true });
      }
      y -= 0.095;
    };
    const cards = (list) => {
      list.forEach((tr, i) => {
        const col = i % 2, cy = y - Math.floor(i / 2) * (CH + GAP) - CH / 2;
        const card = this._btn(this.jList, new Button(CW, CH, (c, w, h, b) => {
          const sel = app.selected === tr, locked = !tr.free && !app.premium;
          roundRect(c, 5, 5, w - 10, h - 10, 26);
          const g = c.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, tr.palette[0]); g.addColorStop(0.6, tr.palette[1]); g.addColorStop(1, tr.palette[2]);
          c.globalAlpha = sel ? 1 : b.hover ? 0.92 : 0.62; c.fillStyle = g; c.fill(); c.globalAlpha = 1;
          c.lineWidth = sel ? 8 : b.hover ? 6 : 3; c.strokeStyle = sel || b.hover ? '#fff' : 'rgba(255,255,255,0.3)'; c.stroke();
          const x0 = w * ((GAP + PVW + 0.022) / CW), tw = w - x0 - 22;
          c.textAlign = 'left'; c.fillStyle = '#fff';
          let fs = Math.round(h * 0.15); c.font = `600 ${fs}px ${FONT}`;
          while (c.measureText(tr.title).width > tw && fs > 16) { fs -= 1; c.font = `600 ${fs}px ${FONT}`; }
          c.fillText(tr.title, x0, h * 0.27);
          c.font = `400 ${Math.round(h * 0.1)}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.9)';
          wrap(c, tr.intent, tw, 2).forEach((l, k) => c.fillText(l, x0, h * (0.47 + k * 0.13)));
          const kind = tr.free ? 'Free' : tr.plain ? 'Music' : tr.strobe || tr.stream ? 'Light & sound' : tr.guided ? `Guided · ~${Math.round(tr.estimate / 60)} min` : `Soundscape · ${tr.freq} Hz`;
          c.font = `500 ${Math.round(h * 0.095)}px ${FONT}`;
          c.fillStyle = tr.free ? '#7ff0c8' : locked ? '#ffd27a' : '#d8ccff';
          c.fillText(tr.free ? 'FREE' : locked ? `🔒 ${kind}` : kind, x0, h * 0.85);
        }, () => { if (!this.jDragged) { app.playJourney(tr); this.refresh(); } }), (col - 0.5) * (CW + GAP), cy);
        clipMat(card.mesh.material); card.mesh.userData.clip = true;
        // the moving preview: a sheet of 100 frames, cross-faded on the GPU
        const pv = new THREE.Mesh(new THREE.PlaneGeometry(PVW, PVH), previewMaterial(tr.palette[1], this.clipPlanes));
        pv.position.set(-CW / 2 + GAP + PVW / 2, 0, 0.002);
        pv.renderOrder = 1001;
        card.mesh.add(pv);
        this.jCards.push({ b: card, y: cy, h: CH, pv, scene: tr.scene });
      });
      y -= Math.ceil(list.length / 2) * (CH + GAP) + 0.01;
    };
    head('Free'); cards(J.free);
    head('Premium'); cards(J.premium);
    head('Premium Interactive'); cards(J.interactive);
    this.jHeight = J_TOP - y;
    // a slim scroll bar on the right edge
    this.jBar = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false }));
    this.jBar.renderOrder = 1001;
    page.add(this.jBar);
    this._buildUnlock();
    this._layoutJourneys();
  }

  _sheet(scene) {
    if (!this.sheets.has(scene)) {
      const tex = new THREE.TextureLoader().load(`previews/${scene}.jpg`);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
      this.sheets.set(scene, tex);
    }
    return this.sheets.get(scene);
  }

  // place the list at its scroll position; only cards in the window are shown
  _layoutJourneys() {
    if (!this.jList) return;
    const maxS = Math.max(0, this.jHeight - (J_TOP - J_BOT));
    this.jScroll = Math.max(0, Math.min(maxS, this.jScroll));
    this.jList.position.y = this.jScroll;
    const on = this.visible && this.tab === 'Journeys';
    for (const c of this.jCards) {
      const wy = c.y + this.jScroll;
      const seen = wy - c.h / 2 < J_TOP && wy + c.h / 2 > J_BOT;
      c.b.mesh.visible = seen && (!c.unlock || !this.app.premium);
      if (c.pv && seen && on && !c.pv.material.uniforms.map.value) {
        c.pv.material.uniforms.map.value = this._sheet(c.scene);
      }
    }
    const vh = J_TOP - J_BOT, frac = Math.min(1, vh / this.jHeight);
    this.jBar.visible = frac < 1;
    this.jBar.scale.y = vh * frac;
    this.jBar.position.set(0.763, J_TOP - vh * frac / 2 - (maxS ? (this.jScroll / maxS) * vh * (1 - frac) : 0), 0);
  }

  // per frame: scrolling, preview frames and clip planes
  _tickJourneys(dt) {
    if (!this.jList || !this.visible || this.tab !== 'Journeys') return;
    this.panel.updateMatrixWorld();
    const m = this.panel.matrixWorld;
    this.clipPlanes[0].set(new THREE.Vector3(0, -1, 0), J_TOP).applyMatrix4(m);
    this.clipPlanes[1].set(new THREE.Vector3(0, 1, 0), -J_BOT).applyMatrix4(m);
    // thumbstick (either hand) scrolls the list
    let stick = 0;
    for (const ctl of this.controllers) {
      const gp = ctl.userData.source?.gamepad;
      if (gp && gp.axes.length >= 4 && Math.abs(gp.axes[3]) > 0.15) stick += gp.axes[3];
    }
    if (stick) this.jVel = stick * 0.9;
    else if (!this.jDrag) this.jVel *= Math.pow(0.02, dt);    // glide to a stop after a flick
    if (!this.jDrag && Math.abs(this.jVel) > 0.002) { this.jScroll += this.jVel * dt; this._layoutJourneys(); }
    this.jT = (this.jT || 0) + dt;
    for (const c of this.jCards) if (c.pv && c.b.mesh.visible) c.pv.material.uniforms.uT.value = this.jT;
  }

  // the Premium offer
  _buildUnlock() {
    const app = this.app;
    this.unlockGroup = new THREE.Group();
    this.unlockGroup.visible = false;
    this.unlockGroup.position.z = 0.01;
    this.panel.add(this.unlockGroup);
    const add = (btn, x, y) => { btn.mesh.position.set(x, y, 0); btn.mesh.renderOrder = 1100; this.unlockGroup.add(btn.mesh); this.buttons.push(btn); return btn; };
    add(new Button(1.2, 0.9, (c, w, h) => {
      roundRect(c, 0, 0, w, h, 40); c.fillStyle = 'rgba(12,10,32,0.97)'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 4; c.stroke();
      c.textAlign = 'center'; c.fillStyle = '#fff';
      c.font = `600 ${Math.round(h * 0.075)}px ${FONT}`; c.fillText('MindLyte Premium', w / 2, h * 0.16);
      c.font = `400 ${Math.round(h * 0.042)}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.85)';
      ['Every journey: light & sound tracks, guided sessions,', 'solfeggio soundscapes, image cycling and the affirmation field.', 'New journeys as they arrive.'].forEach((l, i) => c.fillText(l, w / 2, h * (0.28 + i * 0.07)));
      c.fillStyle = this.unlockMsg ? '#ffd27a' : 'rgba(255,255,255,0.5)';
      c.fillText(this.unlockMsg || 'Cancel any time.', w / 2, h * 0.84);
    }), 0, 0);
    const buy = (label) => () => { this.unlockMsg = 'Payments are coming soon. Thank you for your interest!'; this.unlockCard.redraw(); };
    this.unlockCard = this.buttons[this.buttons.length - 1];
    add(new Button(0.42, 0.11, pill(PRICES.month), buy('month')), -0.23, -0.12);
    add(new Button(0.42, 0.11, pill(PRICES.year), buy('year')), 0.23, -0.12);
    add(new Button(0.24, 0.08, pill('Not now'), () => this.showUnlock(false)), 0, -0.3);
  }

  showUnlock(on) {
    this.unlockGroup.visible = on;
    if (this.jList) this.jList.visible = !on;
    this.unlockMsg = '';
    this.unlockCard.redraw();
  }

  _buildScene() {
    const app = this.app, p = this.pages.Scene;
    // scenes are grouped into categories, so the list never spills over the controls below
    const GROUPS = ['Simple', 'Space', 'Dimensions', 'Mind', 'Nature', 'Sky & water', 'Light journeys'];
    const groupOf = (v) => (v === 'auto' ? 'Simple' : SCENES[v]?.group || 'Simple');
    this.sceneGroup = groupOf(app.background);
    const gw = 0.2;
    GROUPS.forEach((g, i) => {
      this._btn(p, new Button(gw, 0.065, pill(g, () => this.sceneGroup === g), () => { this.sceneGroup = g; this.scenePage = 0; this._layoutScenes(); }), LX + gw / 2 + i * (gw + 0.012), 0.42);
    });
    // scenes as coloured cards, in the style of the journey cards: twelve to a page
    this.scenePage = 0;
    this.sceneBtns = BACKGROUNDS.map(([v, label]) => {
      const pal = SCENE_PALETTES[v === 'auto' ? 'galaxy' : v] || ['#0a0a1a', '#3a3a7a', '#c0c8ff'];
      const btn = new Button(0.35, 0.197, (c, w, h, b) => {
        const sel = app.background === v;
        roundRect(c, 6, 6, w - 12, h - 12, 30);
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, pal[0]); g.addColorStop(0.6, pal[1]); g.addColorStop(1, pal[2]);
        c.globalAlpha = sel ? 1 : b.hover ? 0.92 : 0.62;
        c.fillStyle = g; c.fill();
        c.globalAlpha = 1;
        c.lineWidth = sel ? 9 : b.hover ? 6 : 3;
        c.strokeStyle = sel || b.hover ? '#fff' : 'rgba(255,255,255,0.35)';
        c.stroke();
        c.fillStyle = '#fff'; c.textAlign = 'left';
        const name = v === 'auto' ? 'Auto' : label;
        let fs = Math.round(h * 0.17);
        c.font = `600 ${fs}px ${FONT}`;
        while (c.measureText(name).width > w - 56 && fs > 14) { fs -= 2; c.font = `600 ${fs}px ${FONT}`; }
        c.fillText(name, 28, h * 0.42);
        c.font = `400 ${Math.round(h * 0.11)}px ${FONT}`;
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.fillText(v === 'auto' ? "each journey's own world" : (SCENES[v]?.group || ''), 28, h * 0.72);
      }, () => app.pickScene(v));
      return { g: groupOf(v), b: this._btn(p, btn, 0, 0) };
    });
    const pageBtn = (txt, d) => this._btn(p, new Button(0.09, 0.055, pill(txt), () => { this.scenePage += d; this._layoutScenes(); }), 0, 0);
    this.prevPage = pageBtn('‹', -1);
    this.nextPage = pageBtn('›', 1);
    this.pageLabel = this._btn(p, new Button(0.16, 0.05, textDraw(() => `${this.scenePage + 1} / ${this.scenePages || 1}`, { alpha: 0.7 })), 0, -0.27, false);
    this._layoutScenes = () => {
      const mine = this.sceneBtns.filter((x) => x.g === this.sceneGroup);
      this.scenePages = Math.max(1, Math.ceil(mine.length / 12));
      this.scenePage = Math.max(0, Math.min(this.scenePages - 1, this.scenePage));
      for (const { b } of this.sceneBtns) b.mesh.visible = false;
      mine.slice(this.scenePage * 12, this.scenePage * 12 + 12).forEach(({ b }, i) => {
        b.mesh.visible = true;
        b.mesh.position.set((i % 4 - 1.5) * 0.37, 0.278 - Math.floor(i / 4) * 0.205, 0);
      });
      const paged = this.scenePages > 1;
      this.prevPage.mesh.visible = this.nextPage.mesh.visible = this.pageLabel.mesh.visible = paged;
      this.prevPage.mesh.position.set(-0.13, -0.27, 0); this.nextPage.mesh.position.set(0.13, -0.27, 0);
      this.pageLabel.redraw?.();
    };
    this._layoutScenes();
    this._row(p, 6.7, 'Deep dives', [['Gentle', 'gentle'], ['Full speed', 'full'], ['Fast', 'fast'], ['Insanely fast', 'insane'], ['Off', 'off']], () => app.dives, (v) => app.setDives(v));
    this._row(p, 7.6, 'Visual quality', [['Smooth', 'smooth'], ['Balanced', 'balanced'], ['Sharp', 'sharp']], () => app.quality, (v) => app.setQuality(v));
    this._btn(p, new Button(1.46, 0.06, textDraw(() => {
      const b = app.background;
      if (b === 'off') return app.xrMode === 'immersive-ar' ? 'Off: only your room and the lights.' : 'Off: pure black. Only the lights (and this menu) are shown.';
      if (b === 'stars') return 'White stars: a living night sky of twinkling stars, the Milky Way and shooting stars.';
      if (b === 'auto') return `Auto: each track uses its own scene (${(app.playing ? app.playingTrack : app.selected).scene} for the selected track).`;
      return 'This scene is used for every track until you switch back to Auto.';
    }, { alpha: 0.6, size: 0.46 })), 0, ROW0 - 8.5 * ROWH);
  }

  // the sound mixer: quick mixes, then a row per layer (on/off, level, and its kind)
  _buildSound() {
    const app = this.app, p = this.pages.Sound;
    this._row(p, 0, 'Quick mix', [['Everything', 'all'], ['Music only', 'music'], ['Tones only', 'tones'], ['Scene only', 'scene'], ['Silent', 'silent']], () => null, (v) => { app.mixPreset(v); this.refresh(); }, [0.17, 0.17, 0.16, 0.17, 0.12]);
    const layer = (i, label, k, extras = [], get, set) => {
      const y = ROW0 - i * ROWH;
      this._btn(p, new Button(0.32, 0.07, textDraw(label, { alpha: 0.65 })), LX + 0.16, y, false);
      let x = PX;
      const add = (w, b) => { this._btn(p, b, x + w / 2, y); x += w + 0.012; };
      add(0.12, new Button(0.12, 0.07, pill(() => (app.layerOn(k) ? 'On' : 'Off'), () => app.layerOn(k)), () => { app.setLayerOn(k, !app.layerOn(k)); this.refresh(); }));
      const step = (d) => () => { app.setLayerLevel(k, Math.round((app.mixLevels[k] + d) * 10) / 10); this.refresh(); };
      add(0.07, new Button(0.07, 0.07, pill('\u2212', () => false), step(-0.1)));
      add(0.11, new Button(0.11, 0.07, pill(() => `${Math.round(app.mixLevels[k] * 100)}%`, () => false), () => {}));
      add(0.07, new Button(0.07, 0.07, pill('+', () => false), step(0.1)));
      x += 0.02;
      for (const [t, v, w] of extras) add(w, new Button(w, 0.07, pill(t, () => get() === v), () => { set(v); this.refresh(); }));
    };
    layer(1, 'Music', 'music');
    layer(2, 'Brainwave tones', 'tones', [['Binaural', 'binaural', 0.15], ['Isochronic', 'isochronic', 0.16], ['Both', 'both', 0.1]], () => app.toneType, (v) => app.setToneType(v));
    layer(3, 'Solfeggio tone', 'sol');
    layer(4, 'Nature', 'nature', [['Soft rain', 'rain', 0.15], ['Ocean', 'ocean', 0.12]], () => app.natureType, (v) => app.setNatureType(v));
    layer(5, 'Voice', 'voice');
    layer(6, 'Scene & instrument', 'scene');
    this._row(p, 7, 'Volume', [['\u2212', 'down'], [() => `${Math.round(app.volume * 100)}%`, 'x'], ['+', 'up']], () => null,
      (v) => { if (v !== 'x') { app.setVolume(Math.min(1, Math.max(0, Math.round((app.volume + (v === 'up' ? 0.1 : -0.1)) * 10) / 10))); this.refresh(); } }, [0.1, 0.14, 0.1]);
    this._btn(p, new Button(1.4, 0.05, textDraw('Binaural tones need headphones; isochronic works on speakers. Changes apply straight away.', { alpha: 0.5, size: 0.48 }), null), 0, ROW0 - 7.75 * ROWH, false);
  }

  // how a session runs: its length, the brainwave journey, and the deep dives
  _buildSession() {
    const app = this.app, p = this.pages.Session;
    this._row(p, 0, 'Length', [['5 min', 5], ['10 min', 10], ['20 min', 20], ['30 min', 30]], () => (app.selected.guided ? -1 : app.minutes), (v) => app.setMinutes(v));
    this._row(p, 1, 'Brainwave journey', [['Auto', 'auto'], ['Relax', 'relax'], ['Meditate', 'meditate'], ['Sleep', 'sleep'], ['Focus', 'focus'], ['Restore', 'restore']], () => app.journey, (v) => app.setJourney(v), [0.12, 0.13, 0.16, 0.12, 0.13, 0.15]);
    this._row(p, 2, 'Deep dives', [['Gentle', 'gentle'], ['Full speed', 'full'], ['Fast', 'fast'], ['Insanely fast', 'insane'], ['Off', 'off']], () => app.dives, (v) => app.setDives(v));
    this._btn(p, new Button(1.4, 0.05, textDraw('Length and the brainwave journey apply from the next session; deep dives straight away.', { alpha: 0.5, size: 0.48 }), null), 0, ROW0 - 3 * ROWH + 0.02, false);
  }

  _buildLights() {
    const app = this.app, p = this.pages.Lights;
    this._btn(p, new Button(1.46, 0.06, textDraw(() => {
      const tr = app.playing ? app.playingTrack : app.selected;
      if (!app.strobeAccepted) return 'Turn Lights on to read the flashing-lights safety warning first.';
      if (tr.strobe) return `${tr.title}: ${tr.strobe.format === 'spectrastrobe' ? 'SpectraStrobe (full colour)' : 'AudioStrobe'} light encoding. Lights will follow the track.`;
      return app.lightsGenerated ? `${tr.title} has no light encoding. Lights will pulse with the brainwave tones.` : `${tr.title} has no light encoding. Turn on "Pulse with tones", or import an encoded track.`;
    }, { alpha: 0.75, size: 0.46 })), 0, ROW0 + 0.01);
    const r = (i, ...a) => this._row(p, i * 0.8 + 0.72, ...a);
    const style = (v) => app.setLightOpt('lightStyle', v);
    r(0, 'Lights', [['On', true], ['Off', false]], () => app.lights, (v) => app.setLights(v));
    r(1, 'Solid lights', [['Glowing orb', 'orb'], ['Chrome ball', 'chrome'], ['Neon ring', 'ring'], ['Crystal', 'crystal']], () => app.lightStyle, style, [0.2, 0.2, 0.18, 0.15]);
    r(2, 'Symbols & LEDs', [['Symbol + glow', 'both'], ['Symbol', 'symbol'], ['Glow', 'field'], ['Wide', 'wide'], ['LED starfield', 'leds'], ['Pandora panel', 'pandora']], () => app.lightStyle, style, [0.19, 0.12, 0.1, 0.1, 0.19, 0.19]);
    r(3, 'Symbol', [['Cycle', -1], ...SYMBOLS.map((n, i) => [n.replace(' of ', ' '), i])], () => app.lightSymbol, (v) => app.setLightOpt('lightSymbol', v), [0.12, 0.15, 0.15, 0.12, 0.14, 0.13, 0.14]);
    r(4, 'Colours', [['Vivid', 'vivid'], ['Palette', 'palette'], ['White', 'white'], ['Amber', 'amber'], ['Violet', 'violet'], ['Rainbow', 'rainbow']], () => app.lightColour, (v) => app.setLightOpt('lightColour', v), [0.14, 0.14, 0.14, 0.14, 0.14, 0.15]);
    r(5, 'Flashing', [['Exact', 'exact'], ['Softened', 'soft']], () => app.lightMode, (v) => app.setLightOpt('lightMode', v));
    r(6, 'Brightness', [['−', 'down'], [() => `${Math.round(app.lightMax * 100)}%`, 'x'], ['+', 'up']], () => null,
      (v) => { if (v !== 'x') app.setLightOpt('lightMax', Math.min(1, Math.max(0.1, Math.round((app.lightMax + (v === 'up' ? 0.1 : -0.1)) * 10) / 10))); }, [0.1, 0.14, 0.1]);
    r(7, 'Pulse with tones', [['On', true], ['Off', false]], () => app.lightsGenerated, (v) => app.setLightOpt('lightsGenerated', v));
    r(8, 'Eyes', [['Both eyes see both', 'sides'], ['Each eye its own', 'eyes'], ['Each eye, centred', 'eyesc']], () => app.lightLayout, (v) => app.setLightOpt('lightLayout', v), [0.27, 0.25, 0.25]);
    r(9, 'Dim background', [['Off', 0], ['30%', 0.3], ['50%', 0.5], ['70%', 0.7], ['85%', 0.85]], () => app.lightDim, (v) => app.setLightOpt('lightDim', v), [0.12, 0.12, 0.12, 0.12, 0.12]);
  }

  _buildVoice() {
    const app = this.app, p = this.pages.Voice;
    this._row(p, 0, 'Soundscape voice', [['Off', false], ['On', true]], () => app.whispers, (v) => app.setWhispers(v));
    this._row(p, 1, 'Captions', [['On', true], ['Off', false]], () => app.captions, (v) => app.setCaptions(v));
    this._row(p, 4, 'Guided voice', [['On', true], ['Off', false]], () => app.guideVoice, (v) => app.setGuideVoice(v));
    const choices = () => ['auto', ...app.voice.englishVoices().map((v) => v.voiceURI)];
    const nameOf = (uri) => {
      if (uri === 'auto') return app.voice.hasRecorded ? `Recorded: ${app.voice.recordedName}` : 'Auto (Irish if available)';
      const v = app.voice.englishVoices().find((x) => x.voiceURI === uri);
      return v ? `${v.name} (${v.lang})` : uri;
    };
    this._btn(p, new Button(0.32, 0.07, textDraw('Guide voice', { alpha: 0.65 })), LX + 0.16, ROW0 - 2 * ROWH, false);
    const step = (d) => { const c = choices(); const i = Math.max(0, c.indexOf(app.voiceChoice)); app.setVoice(c[(i + d + c.length) % c.length]); };
    this._btn(p, new Button(0.1, 0.07, pill('‹'), () => step(-1)), PX + 0.05, ROW0 - 2 * ROWH);
    this._btn(p, new Button(0.8, 0.07, pill(() => nameOf(app.voiceChoice), () => false), null), PX + 0.12 + 0.4, ROW0 - 2 * ROWH);
    this._btn(p, new Button(0.1, 0.07, pill('›'), () => step(1)), PX + 0.94 + 0.05, ROW0 - 2 * ROWH);
    this._btn(p, new Button(0.32, 0.07, pill('Hear the voice'), () => app.previewVoice()), PX + 0.16, ROW0 - 3 * ROWH);
    this._row(p, 5, 'My affirmations', [['Off', false], ['On', true]], () => app.mineOn, (v) => app.setMine(v));
    // record a new affirmation right here in the headset (the mic is only used while recording)
    this.recMsg = '';
    this._btn(p, new Button(0.42, 0.07, pill(() => (app.mine.recording ? `■ Stop  ${Math.floor(this.recS || 0)} s` : this.recMsg || '● Record a new one'), () => app.mine.recording), async () => {
      if (app.mine.recording) { app.mine.stop(); return; }
      this.recS = 0; this.recMsg = '';
      try {
        const clip = await app.mine.record((sec) => { this.recS = sec; this.refresh(); });
        this.recMsg = clip ? 'Saved ✓  Record another' : 'Too short, try again';
        if (clip && !app.mineOn) app.setMine(true);
      } catch (_) {
        this.recMsg = 'Mic blocked: allow it outside VR';
      }
      app.ui.drawMine?.();
      this.refresh();
    }), PX + 0.368 + 0.23, ROW0 - 5 * ROWH);
    this._row(p, 6, 'Breathing guide', [['Off', false], ['On', true]], () => app.breathText, (v) => app.setBreathText(v));
  }

  _buildWarning() {
    const app = this.app;
    this.warn = new THREE.Group();
    this.warn.position.z = 0.03;
    this.warn.visible = false;
    this.panel.add(this.warn);
    const card = new Button(1.16, 0.66, (c, w, h) => {
      roundRect(c, 0, 0, w, h, 40);
      c.fillStyle = 'rgba(18,14,30,0.98)'; c.fill();
      c.strokeStyle = 'rgba(255,200,120,0.6)'; c.lineWidth = 5; c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'left';
      c.font = `500 44px ${FONT}`; c.fillText('Flashing lights warning', 50, 76);
      c.font = `400 26px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.88)';
      [
        'Lights flash at about 1–40 times a second. This can trigger',
        'seizures in people with photosensitive epilepsy.',
        '',
        "Don't use if you or your family have had epilepsy or seizures,",
        'have a serious eye, head or heart condition, or are pregnant.',
        'Stop straight away if you feel unwell or disoriented.',
        'Never use while driving or after alcohol or drugs.',
      ].forEach((l, i) => c.fillText(l, 50, 132 + i * 38));
    }, null, 800);
    card.mesh.renderOrder = 1001;
    card.mesh.position.y = 0.05;
    this.warn.add(card.mesh);
    this.warnButtons = [
      new Button(0.44, 0.08, pill('I understand, turn on lights'), () => app.acceptStrobe()),
      new Button(0.2, 0.08, pill('Not now'), () => app.declineStrobe()),
    ];
    this.warnButtons[0].mesh.position.set(-0.13, -0.2, 0.01);
    this.warnButtons[1].mesh.position.set(0.24, -0.2, 0.01);
    for (const b of this.warnButtons) { b.mesh.renderOrder = 1002; this.warn.add(b.mesh); }
  }

  setTab(name) {
    this.tab = name;
    if (this.beginBtn) this.beginBtn.mesh.visible = name !== 'Journeys';
    for (const [t, g] of Object.entries(this.pages)) g.visible = t === name;
    this._layoutJourneys?.();   // start or pause the journey previews
    if (name === 'Scene' && this._layoutScenes) {
      const v = this.app.background;
      this.sceneGroup = v === 'auto' ? 'Simple' : SCENES[v]?.group || this.sceneGroup;
      this._layoutScenes();
    }
    this.refresh();
  }

  refresh() {
    for (const b of this.buttons) if (b.dynamic !== false) b.redraw();
    if (this.endBtn) {
      this.endBtn.mesh.visible = this.app.playing;
      this.closeBtn.mesh.visible = this.app.playing;
    }
  }

  // Place the panel in front of where the user is looking (yaw only).
  placeInFront(head, forward) {
    const yaw = Math.atan2(-forward.x, -forward.z);
    this.panel.position.set(head.x - Math.sin(yaw) * 1.5, Math.max(1.0, head.y - 0.1), head.z - Math.cos(yaw) * 1.5);
    this.panel.rotation.set(0, yaw, 0);
    this.orb.mesh.position.set(head.x - Math.sin(yaw) * 0.95, head.y - 0.42, head.z - Math.cos(yaw) * 0.95);
    this.orb.mesh.rotation.set(-0.4, yaw, 0, 'YXZ');
    this.orbHome = { pos: this.orb.mesh.position.clone(), rot: this.orb.mesh.rotation.clone() };
    this.wristNote.mesh.position.set(head.x - Math.sin(yaw) * 1.1, head.y - 0.3, head.z - Math.cos(yaw) * 1.1);
    this.wristNote.mesh.rotation.set(-0.25, yaw, 0, 'YXZ');
    this.cue.mesh.position.set(head.x - Math.sin(yaw) * 1.7, head.y - 0.38, head.z - Math.cos(yaw) * 1.7);
    this.cue.mesh.rotation.set(0, yaw, 0);
  }

  show(on) {
    this.visible = on;
    this.panel.visible = on;
    this._layoutJourneys?.();
    const wanted = !on && (this.app.playing || this.app.xrIdle);
    if (wanted && !this.orbWanted && !this.wristNoteShown) { this.wristNoteT = 0; this.wristNoteShown = true; }   // once per session
    this.orbWanted = wanted;
    this.orb.mesh.visible = wanted;
    if (!on) this.warn.visible = false;
    this.app.getHead((h, f) => this.placeInFront(h, f));
    if (on) this.refresh();
  }

  showWarning(on) {
    if (on && !this.visible) this.show(true);
    this.warn.visible = on;
  }

  setCue(text, sub, alpha) {
    if (!this.cueState || this.cueState.text !== text || this.cueState.sub !== sub) {
      this.cueState = { text, sub };
      this.cue.redraw();
    }
    this.cue.mesh.material.opacity += (alpha - this.cue.mesh.material.opacity) * 0.05;
    this.cue.mesh.visible = this.cue.mesh.material.opacity > 0.01;
  }

  // ---- input
  attachControllers(renderer, scene) {
    for (let i = 0; i < 2; i++) {
      const ctl = renderer.xr.getController(i);
      // a glowing light-saber pointer: a bright core inside a soft coloured
      // glow, fading in from a small emitter at your hand to a glowing tip
      const ray = makeSaber();
      ray.visible = false;
      ctl.add(ray);
      const dot = makeTip();
      dot.visible = false;
      scene.add(dot);
      ctl.userData = { ray, dot, connected: false };
      ctl.addEventListener('connected', (e) => { ctl.userData.connected = true; ctl.userData.mode = e.data.targetRayMode; ctl.userData.source = e.data; });
      // pinch (or trigger) and drag on the journey list to scroll it
      ctl.addEventListener('selectstart', () => {
        this.jDragged = false;
        if (!this.visible || this.tab !== 'Journeys' || this.unlockGroup.visible) return;
        const y = this._panelY(ctl);
        if (y != null && y < J_TOP && y > J_BOT) this.jDrag = { ctl, y, s: this.jScroll, t: performance.now() };
      });
      ctl.addEventListener('selectend', () => { if (this.jDrag?.ctl === ctl) this.jDrag = null; if (this.brandHold?.ctl === ctl) this.brandHold = null; });
      ctl.addEventListener('selectstart', () => { if (this.visible && this._hit(ctl) === this.brandBtn) this.brandHold = { ctl, t: performance.now() }; });
      ctl.addEventListener('disconnected', () => { ctl.userData.connected = false; ray.visible = false; dot.visible = false; });
      ctl.addEventListener('select', () => {
        if (this.jDragged) { this.jDragged = false; return; }   // that was a scroll, not a press
        const hit = this._hit(ctl);
        if (hit && hit.onSelect) hit.onSelect();
        // pinch on empty space during a session opens the menu
        // (not while tracing in an interactive scene: there the Menu orb opens it)
        else if (!hit && !this.visible && this.app.playing && !this.app._wants(this.controllers.indexOf(ctl))) this.show(true);
        // in the hall of doors, a press opens the door you're pointing at
        else if (!hit && !this.visible && this.app.active?.onSelect) this.app.active.onSelect();
      });
      scene.add(ctl);
      this.controllers.push(ctl);
    }
  }

  _isShown(obj) {
    for (let o = obj; o; o = o.parent) if (!o.visible) return false;
    return true;
  }

  _interactive() {
    if (this.warn.visible && this.panel.visible) return this.warnButtons.map((b) => b.mesh);
    const list = [];
    for (const b of this.buttons) if (b.onSelect && this._isShown(b.mesh)) list.push(b.mesh);
    return list;
  }

  // hits, ignoring the parts of list cards scrolled out of the window
  _hits() {
    return this.raycaster.intersectObjects(this._interactive(), false).filter((h) => {
      if (!h.object.userData.clip) return true;
      const y = this.panel.worldToLocal(h.point.clone()).y;
      return y < J_TOP && y > J_BOT;
    });
  }

  _hit(ctl) {
    this.raycaster.setFromXRController(ctl);
    const hits = this._hits();
    return hits.length ? hits[0].object.userData.button : null;
  }

  // where a controller's ray meets the panel, in panel space (y only)
  _panelY(ctl) {
    this.raycaster.setFromXRController(ctl);
    this.panel.updateMatrixWorld();
    const n = new THREE.Vector3(0, 0, 1).transformDirection(this.panel.matrixWorld);
    const o = new THREE.Vector3().setFromMatrixPosition(this.panel.matrixWorld);
    const pl = new THREE.Plane().setFromNormalAndCoplanarPoint(n, o);
    const p = this.raycaster.ray.intersectPlane(pl, new THREE.Vector3());
    return p ? this.panel.worldToLocal(p).y : null;
  }

  // The Menu orb sits on your left wrist, like a watch: it shows when you raise
  // your wrist and look at it. With no hand or controller tracked it stays in
  // its old place, low in front of you.
  _wristOrb(dt) {
    const o = this.orb.mesh;
    if (!this.orbWanted || this.visible) { this.soundBtn.mesh.visible = false; return; }
    const xr = this.app.renderer.xr;
    let wrist = null;
    for (let i = 0; i < 2; i++) {
      const ctl = this.controllers[i];
      const side = ctl?.userData.source?.handedness;
      if (!ctl?.userData.connected || (side && side !== 'left') || (!side && i !== 0)) continue;
      const j = xr.getHand(i)?.joints?.wrist;
      if (j && j.visible) { wrist = new THREE.Vector3().setFromMatrixPosition(j.matrixWorld); break; }
      if (ctl.userData.mode === 'tracked-pointer') { wrist = new THREE.Vector3().setFromMatrixPosition(ctl.matrixWorld); break; }
    }
    if (!wrist) {   // nothing to wear it on: back to its spot in front of you
      if (this.orbHome) { o.position.copy(this.orbHome.pos); o.rotation.copy(this.orbHome.rot); }
      o.scale.setScalar(1); o.visible = true; this.orbOnWrist = false;
      const sb = this.soundBtn.mesh;
      sb.visible = true; sb.scale.setScalar(1); sb.quaternion.copy(o.quaternion);
      sb.position.copy(o.position).add(new THREE.Vector3(0.13, 0.02, 0).applyQuaternion(o.quaternion));
      return;
    }
    this.orbOnWrist = true;
    const { pos: head, fwd } = this.app.getHead();
    const to = wrist.clone().sub(head);
    const dist = to.length();
    const looking = dist < 0.75 && to.normalize().dot(fwd) > Math.cos(0.6);
    this._wristA = Math.max(0, Math.min(1, (this._wristA || 0) + (looking ? dt * 5 : -dt * 4)));
    o.visible = this._wristA > 0.02;
    // just above the wrist, turned to face you
    o.position.copy(wrist).add(new THREE.Vector3(0, 0.07, 0));
    o.lookAt(head);
    o.scale.setScalar(0.55 * (0.6 + 0.4 * this._wristA));
    // the sound button just beside it
    const sb = this.soundBtn.mesh;
    sb.visible = o.visible;
    sb.quaternion.copy(o.quaternion);
    sb.position.copy(o.position).add(new THREE.Vector3(0.075, -0.012, 0).applyQuaternion(o.quaternion));
    sb.scale.copy(o.scale);
  }

  update(dt = 1 / 72) {
    if (this.app.renderer.xr.isPresenting) this._wristOrb(dt);
    // the one-time note saying where the menu went
    this.wristNoteT += dt;
    const nA = this.orbWanted && !this.visible && this.orbOnWrist !== false ? Math.max(0, Math.min(1, this.wristNoteT / 0.8, (8 - this.wristNoteT) / 1.5)) : 0;
    this.wristNote.mesh.material.opacity = nA * 0.95;
    this.wristNote.mesh.visible = nA > 0.01;
    if (this.jDrag) {
      const y = this._panelY(this.jDrag.ctl);
      if (y != null) {
        const d = y - this.jDrag.y;
        if (Math.abs(d) > 0.02) this.jDragged = true;
        if (this.jDragged) {
          const now = performance.now(), prev = this.jScroll;
          this.jScroll = this.jDrag.s + d;
          this._layoutJourneys();
          this.jVel = (this.jScroll - prev) / Math.max(0.005, (now - (this.jDrag.last || now - 16)) / 1000);
          this.jDrag.last = now;
        }
      }
    }
    this._tickJourneys(dt);
    if (this.brandHold && performance.now() - this.brandHold.t > 800) {
      if (this._hit(this.brandHold.ctl) === this.brandBtn) this.app.togglePremium();
      this.brandHold = null;
    }
    const hovered = new Set();
    const hide = this.app.active?.hideRays;   // a scene can hide a beam while it's over something you play
    for (const [ci, ctl] of this.controllers.entries()) {
      const u = ctl.userData;
      if (!u.connected) continue;
      const quiet = !this.visible && !this.orb.mesh.visible && !!hide?.has(ci);   // over something you play: just a small marker at the hand
      const showRay = this.visible || this.orb.mesh.visible || this.app._wants(ci);
      this.raycaster.setFromXRController(ctl);
      const hits = this._hits();
      u.ray.visible = showRay && u.mode !== 'gaze' && u.mode !== 'transient-pointer';
      u.ray.userData.beam.visible = !quiet;
      u.ray.userData.emitter.scale.setScalar(quiet ? 0.7 : 1);
      const len = hits.length ? hits[0].distance : 1.6;
      u.ray.userData.beam.scale.z = len;
      if (hits.length) hovered.add(hits[0].object.userData.button);
      // the glowing tip sits where the beam ends (on a button, or at full length)
      u.dot.position.copy(this.raycaster.ray.origin).addScaledVector(this.raycaster.ray.direction, len);
      u.dot.visible = u.ray.visible && !quiet;
      u.dot.scale.setScalar(hits.length ? 1.25 : 1);
    }
    for (const b of [...this.buttons, ...this.warnButtons]) if (b.onSelect) b.setHover(hovered.has(b));
  }
}

// ---- light-saber pointer pieces
const SABER_GLOW = new THREE.Color(0.62, 0.55, 1.0);
function makeSaber() {
  const g = new THREE.Group();
  const geo = (r) => { const c = new THREE.CylinderGeometry(r, r, 1, 20, 1, true); c.rotateX(-Math.PI / 2); c.translate(0, 0, -0.5); return c; };
  const mat = (core) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: core ? new THREE.Color(1, 1, 1) : SABER_GLOW }, uCore: { value: core ? 1 : 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vZ; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vZ = -position.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 uCol; uniform float uCore; varying vec3 vN; varying vec3 vV; varying float vZ;
      void main(){
        float face = abs(dot(normalize(vN), normalize(vV)));          // bright in the middle, soft at the edges
        float a = uCore > 0.5 ? pow(face, 1.5) : pow(face, 2.2) * 1.1;
        a *= smoothstep(0.0, 0.06, vZ);                                // fades in just in front of your hand
        gl_FragColor = vec4(uCol * a, 1.0);
      }`,
  });
  const core = new THREE.Mesh(geo(0.0035), mat(true));
  const glow = new THREE.Mesh(geo(0.02), mat(false));
  core.renderOrder = 1002; glow.renderOrder = 1001;
  core.frustumCulled = glow.frustumCulled = false;
  g.add(glow, core);
  // the emitter at your hand: a small glowing ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0018, 8, 24), new THREE.MeshBasicMaterial({ color: SABER_GLOW, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  ring.position.z = -0.01;
  const holder = new THREE.Group();
  holder.add(g);
  // the emitter stays unscaled on the holder; only the beam stretches to length
  holder.userData.beam = g;
  holder.add(ring);
  holder.userData.emitter = ring;
  return holder;
}
function makeTip() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.006, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 14), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: SABER_GLOW } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(abs(dot(normalize(vN), normalize(vV))), 2.5); gl_FragColor = vec4(uCol * f * 1.4, 1.0); }',
  }));
  core.renderOrder = 1004; halo.renderOrder = 1003;
  g.add(halo, core);
  return g;
}
