import * as THREE from 'three';
import { SYMBOLS } from '../visuals/strobe.js';

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

const TABS = ['Journeys', 'Sound', 'Lights', 'Voice'];
const W = 1.56, H = 1.34;
const ROW0 = 0.33, ROWH = 0.1, LX = -0.74, PX = -0.4;

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
      roundRect(c, 0, 0, w, h, 56);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(10,10,28,0.93)');
      g.addColorStop(1, 'rgba(10,10,28,0.86)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = '#fff';
      c.font = `300 60px ${FONT}`;
      c.textAlign = 'left';
      c.fillText('MindLyte', 52, 88);
    }, null, 650);
    bg.mesh.position.set(0, -0.02, -0.01);
    bg.mesh.renderOrder = 999;
    this.panel.add(bg.mesh);

    // tabs
    TABS.forEach((name, i) => {
      this._btn(this.panel, new Button(0.22, 0.075, pill(name, () => this.tab === name), () => this.setTab(name)), -0.14 + i * 0.235, 0.53);
    });

    this.pages = {};
    for (const t of TABS) { this.pages[t] = new THREE.Group(); this.panel.add(this.pages[t]); }

    this._buildJourneys();
    this._buildSound();
    this._buildLights();
    this._buildVoice();

    // footer
    const fy = -0.6;
    this.beginBtn = this._btn(this.panel, new Button(0.4, 0.09, (c, w, h, b) => {
      roundRect(c, 4, 4, w - 8, h - 8, (h - 8) / 2);
      c.fillStyle = b.hover ? '#fff' : 'rgba(255,255,255,0.86)';
      c.fill();
      c.fillStyle = '#111';
      c.font = `600 ${Math.round(h * 0.36)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      const label = app.playing ? (app.playingTrack === app.selected ? 'Resume' : 'Play selected') : 'Begin';
      c.fillText(`${label}: ${app.selected.title}`.slice(0, 34), w / 2, h / 2 + 2);
    }, () => app.beginOrResume()), -0.3, fy);
    this.endBtn = this._btn(this.panel, new Button(0.24, 0.09, pill('End session'), () => app.stop()), 0.07, fy);
    this.closeBtn = this._btn(this.panel, new Button(0.18, 0.09, pill('Close'), () => this.show(false)), 0.3, fy);
    this._btn(this.panel, new Button(0.2, 0.09, pill('Exit VR'), () => app.exitXR()), 0.6, fy);

    // toggle orb shown during a session
    this.orb = new Button(0.14, 0.17, (c, w, h, b) => {
      c.beginPath();
      c.arc(w / 2, w / 2, w / 2 - 6, 0, Math.PI * 2);
      c.fillStyle = b.hover ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.14)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.7)';
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = '#fff';
      for (let k = -1; k <= 1; k++) c.fillRect(w * 0.3, w / 2 + k * w * 0.14 - 3, w * 0.4, 6);
      c.font = `500 ${Math.round(h * 0.15)}px ${FONT}`;
      c.textAlign = 'center';
      c.fillText('Menu', w / 2, h - 8);
    }, () => this.show(true));
    this.group.add(this.orb.mesh);
    this.buttons.push(this.orb);

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

  _buildJourneys() {
    const page = this.pages.Journeys;
    this.cardBtns = [];
    this.cardList = [];
    this._rebuildCards();
    this.journeyNote = this._btn(page, new Button(1.4, 0.05, textDraw(() => {
      const tr = this.app.selected;
      if (tr.strobe || tr.stream) return `${tr.title}: light & sound track. Press Begin; lights come on (see the Lights tab to adjust).`;
      if (tr.guided) return `${tr.title}: guided with voice. Voice options are in the Voice tab.`;
      return `${tr.title}: ${tr.freq} Hz · ${tr.intent}. Import your own tracks on the flat-screen menu.`;
    }, { alpha: 0.6, size: 0.5 })), 0, -0.505);
  }

  _rebuildCards() {
    const app = this.app;
    const list = [...app.lightTracks, ...app.guided, ...app.tracks, ...(app.imported ? [app.imported] : [])].slice(0, 16);
    if (list.length === this.cardList.length && list.every((t, i) => t === this.cardList[i])) return;
    for (const b of this.cardBtns) { b.dispose(); this.buttons.splice(this.buttons.indexOf(b), 1); }
    this.cardList = list;
    this.cardBtns = list.map((tr, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const card = new Button(0.35, 0.18, (c, w, h, b) => {
        const sel = app.selected === tr;
        roundRect(c, 6, 6, w - 12, h - 12, 30);
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, tr.palette[0]);
        g.addColorStop(0.6, tr.palette[1]);
        g.addColorStop(1, tr.palette[2]);
        c.globalAlpha = sel ? 1 : b.hover ? 0.92 : 0.62;
        c.fillStyle = g;
        c.fill();
        c.globalAlpha = 1;
        c.lineWidth = sel ? 9 : b.hover ? 6 : 3;
        c.strokeStyle = sel || b.hover ? '#fff' : 'rgba(255,255,255,0.35)';
        c.stroke();
        c.fillStyle = '#fff';
        c.textAlign = 'left';
        c.font = `600 ${Math.round(h * 0.16)}px ${FONT}`;
        c.fillText(tr.title.slice(0, 22), 28, h * 0.3);
        c.font = `300 ${Math.round(h * 0.24)}px ${FONT}`;
        const big = tr.strobe || tr.stream ? (tr.strobe?.format === 'spectrastrobe' ? 'SpectraStrobe' : 'AudioStrobe') : tr.guided ? `~${Math.round(tr.estimate / 60)} min` : tr.buffer ? 'Your track' : `${tr.freq} Hz`;
        c.fillText(big, 28, h * 0.6);
        c.font = `400 ${Math.round(h * 0.1)}px ${FONT}`;
        c.fillStyle = 'rgba(255,255,255,0.88)';
        c.fillText((tr.guided ? `Guided · ${tr.intent}` : tr.intent).slice(0, 40), 28, h * 0.84);
      }, () => app.select(tr));
      return this._btn(this.pages.Journeys, card, (col - 1.5) * 0.37, 0.33 - row * 0.2);
    });
  }

  _buildSound() {
    const app = this.app, p = this.pages.Sound;
    this._row(p, 0, 'Length', [['5 min', 5], ['10 min', 10], ['20 min', 20], ['30 min', 30]], () => (app.selected.guided ? -1 : app.minutes), (v) => app.setMinutes(v));
    this._row(p, 1, 'Brainwave tones', [['Binaural', 'binaural'], ['Isochronic', 'isochronic'], ['Both', 'both'], ['Off', 'off']], () => app.entrainment, (v) => app.setEntrainment(v));
    this._row(p, 2, 'Brainwave journey', [['Auto', 'auto'], ['Relax', 'relax'], ['Meditate', 'meditate'], ['Sleep', 'sleep'], ['Focus', 'focus']], () => app.journey, (v) => app.setJourney(v));
    this._row(p, 3, 'Nature', [['Off', 'off'], ['Soft rain', 'rain'], ['Ocean', 'ocean']], () => app.nature, (v) => app.engine.init().then(() => app.setNature(v)));
    this._row(p, 4, 'Deep dives', [['Gentle', 'gentle'], ['Full speed', 'full'], ['Off', 'off']], () => app.dives, (v) => app.setDives(v));
    this._row(p, 5, 'Solfeggio tone', [['On', true], ['Off', false]], () => app.solfeggio, (v) => app.setSolfeggio(v));
    this._row(p, 6, 'Volume', [['−', 'down'], [() => `${Math.round(app.volume * 100)}%`, 'x'], ['+', 'up']], () => null,
      (v) => { if (v !== 'x') { app.setVolume(Math.min(1, Math.max(0, Math.round((app.volume + (v === 'up' ? 0.1 : -0.1)) * 10) / 10))); this.refresh(); } }, [0.1, 0.14, 0.1]);
    this._btn(p, new Button(1.4, 0.05, textDraw('Binaural needs headphones; isochronic works on speakers. Journey changes apply from the next session.', { alpha: 0.5, size: 0.48 }), null), 0, ROW0 - 7 * ROWH + 0.02, false);
  }

  _buildLights() {
    const app = this.app, p = this.pages.Lights;
    this._btn(p, new Button(1.46, 0.06, textDraw(() => {
      const tr = app.playing ? app.playingTrack : app.selected;
      if (!app.strobeAccepted) return 'Turn Lights on to read the flashing-lights safety warning first.';
      if (tr.strobe) return `${tr.title}: ${tr.strobe.format === 'spectrastrobe' ? 'SpectraStrobe (full colour)' : 'AudioStrobe'} light encoding. Lights will follow the track.`;
      return app.lightsGenerated ? `${tr.title} has no light encoding. Lights will pulse with the brainwave tones.` : `${tr.title} has no light encoding. Turn on "Pulse with tones", or import an encoded track.`;
    }, { alpha: 0.75, size: 0.46 })), 0, ROW0 + 0.01);
    const r = (i, ...a) => this._row(p, i + 0.75, ...a);
    r(0, 'Lights', [['On', true], ['Off', false]], () => app.lights, (v) => app.setLights(v));
    r(1, 'Show', [['Symbol + glow', 'both'], ['Symbol', 'symbol'], ['Glow', 'field']], () => app.lightStyle, (v) => app.setLightOpt('lightStyle', v), [0.24, 0.17, 0.17]);
    r(2, 'Symbol', [['Cycle', -1], ...SYMBOLS.map((n, i) => [n.replace(' of ', ' '), i])], () => app.lightSymbol, (v) => app.setLightOpt('lightSymbol', v), [0.12, 0.15, 0.15, 0.12, 0.14, 0.13, 0.14]);
    r(3, 'Colours', [['Palette', 'palette'], ['White', 'white'], ['Amber', 'amber'], ['Violet', 'violet'], ['Rainbow', 'rainbow']], () => app.lightColour, (v) => app.setLightOpt('lightColour', v));
    r(4, 'Flashing', [['Exact', 'exact'], ['Softened', 'soft']], () => app.lightMode, (v) => app.setLightOpt('lightMode', v));
    r(5, 'Brightness', [['−', 'down'], [() => `${Math.round(app.lightMax * 100)}%`, 'x'], ['+', 'up']], () => null,
      (v) => { if (v !== 'x') app.setLightOpt('lightMax', Math.min(1, Math.max(0.1, Math.round((app.lightMax + (v === 'up' ? 0.1 : -0.1)) * 10) / 10))); }, [0.1, 0.14, 0.1]);
    r(6, 'Pulse with tones', [['On', true], ['Off', false]], () => app.lightsGenerated, (v) => app.setLightOpt('lightsGenerated', v));
  }

  _buildVoice() {
    const app = this.app, p = this.pages.Voice;
    this._row(p, 0, 'Whispers', [['On', true], ['Off', false]], () => app.whispers, (v) => app.setWhispers(v));
    this._row(p, 1, 'Captions', [['On', true], ['Off', false]], () => app.captions, (v) => app.setCaptions(v));
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
    this._btn(p, new Button(1.46, 0.06, textDraw(() => `Now using: ${app.voice.description}`, { alpha: 0.6, size: 0.46 })), 0, ROW0 - 4 * ROWH);
    this._btn(p, new Button(1.46, 0.06, textDraw('Whispers: short thoughtful lines now and then during soundscapes. Guided journeys always speak.', { alpha: 0.5, size: 0.46 }), null), 0, ROW0 - 5 * ROWH, false);
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
    for (const [t, g] of Object.entries(this.pages)) g.visible = t === name;
    this.refresh();
  }

  refresh() {
    this._rebuildCards?.();
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
    this.cue.mesh.position.set(head.x - Math.sin(yaw) * 1.7, head.y - 0.38, head.z - Math.cos(yaw) * 1.7);
    this.cue.mesh.rotation.set(0, yaw, 0);
  }

  show(on) {
    this.visible = on;
    this.panel.visible = on;
    this.orb.mesh.visible = !on && this.app.playing;
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
      const ray = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })
      );
      ray.scale.z = 2;
      ray.visible = false;
      ctl.add(ray);
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.007, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
      dot.renderOrder = 1003;
      dot.visible = false;
      scene.add(dot);
      ctl.userData = { ray, dot, connected: false };
      ctl.addEventListener('connected', (e) => { ctl.userData.connected = true; ctl.userData.mode = e.data.targetRayMode; });
      ctl.addEventListener('disconnected', () => { ctl.userData.connected = false; ray.visible = false; dot.visible = false; });
      ctl.addEventListener('select', () => {
        const hit = this._hit(ctl);
        if (hit && hit.onSelect) hit.onSelect();
        // pinch on empty space during a session opens the menu
        else if (!hit && !this.visible && this.app.playing) this.show(true);
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

  _hit(ctl) {
    this.raycaster.setFromXRController(ctl);
    const hits = this.raycaster.intersectObjects(this._interactive(), false);
    return hits.length ? hits[0].object.userData.button : null;
  }

  update() {
    const hovered = new Set();
    for (const ctl of this.controllers) {
      const u = ctl.userData;
      if (!u.connected) continue;
      const showRay = this.visible || this.orb.mesh.visible;
      this.raycaster.setFromXRController(ctl);
      const hits = this.raycaster.intersectObjects(this._interactive(), false);
      u.ray.visible = showRay && u.mode !== 'gaze' && u.mode !== 'transient-pointer';
      if (hits.length) {
        hovered.add(hits[0].object.userData.button);
        u.ray.scale.z = hits[0].distance;
        u.dot.position.copy(hits[0].point);
        u.dot.visible = true;
      } else {
        u.ray.scale.z = 2;
        u.dot.visible = false;
      }
    }
    for (const b of [...this.buttons, ...this.warnButtons]) if (b.onSelect) b.setHover(hovered.has(b));
  }
}
