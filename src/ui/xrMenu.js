import * as THREE from 'three';

// In-headset UI: canvas-textured panels you point at and pinch (hands) or
// trigger (controllers). Works with any WebXR input that has a target ray,
// which on Android XR includes hand pinch and eye-gaze+pinch transient input.

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

function pill(label, isOn) {
  return (c, w, h, b) => {
    const on = isOn ? isOn() : false;
    roundRect(c, 4, 4, w - 8, h - 8, (h - 8) / 2);
    c.fillStyle = on ? 'rgba(255,255,255,0.9)' : b.hover ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
    c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.45)';
    c.lineWidth = 3;
    c.stroke();
    c.fillStyle = on ? '#111' : '#fff';
    c.font = `500 ${Math.round(h * 0.38)}px ${FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(typeof label === 'function' ? label() : label, w / 2, h / 2 + 2);
  };
}

export class XRMenu {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.buttons = [];
    this.visible = true;
    this._build();
    this.raycaster = new THREE.Raycaster();
    this.controllers = [];
  }

  _add(btn, x, y) {
    btn.mesh.position.set(x, y, 0);
    this.panel.add(btn.mesh);
    this.buttons.push(btn);
    return btn;
  }

  _build() {
    const app = this.app;
    this.panel = new THREE.Group();
    this.group.add(this.panel);

    // backdrop
    const bg = new Button(1.44, 1.32, (c, w, h) => {
      roundRect(c, 0, 0, w, h, 60);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(10,12,28,0.9)');
      g.addColorStop(1, 'rgba(10,12,28,0.82)');
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)';
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = '#fff';
      c.font = `300 64px ${FONT}`;
      c.textAlign = 'left';
      c.fillText('MindLyte', 60, 100);
      c.font = `400 30px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.6)';
      c.fillText('Choose a journey · point and pinch', 60, 148);
    }, null, 700);
    bg.mesh.position.set(0, 0, -0.01);
    bg.mesh.renderOrder = 999;
    this.panel.add(bg.mesh);

    // journey cards: guided first, then soundscapes
    const all = [...app.guided, ...app.tracks];
    this.cards = all.map((tr, i) => {
      const col = i % 4, row = Math.floor(i / 4);
      const card = new Button(0.31, 0.15, (c, w, h, b) => {
        const sel = app.selected === tr;
        roundRect(c, 6, 6, w - 12, h - 12, 30);
        const g = c.createLinearGradient(0, 0, w, h);
        g.addColorStop(0, tr.palette[0]);
        g.addColorStop(0.6, tr.palette[1]);
        g.addColorStop(1, tr.palette[2]);
        c.globalAlpha = sel ? 1 : b.hover ? 0.9 : 0.6;
        c.fillStyle = g;
        c.fill();
        c.globalAlpha = 1;
        c.lineWidth = sel ? 8 : 3;
        c.strokeStyle = sel ? '#fff' : 'rgba(255,255,255,0.35)';
        c.stroke();
        c.fillStyle = '#fff';
        c.textAlign = 'left';
        c.font = `600 ${Math.round(h * 0.17)}px ${FONT}`;
        c.fillText(tr.title, 30, h * 0.32);
        c.font = `300 ${Math.round(h * 0.26)}px ${FONT}`;
        c.fillText(tr.guided ? `~${Math.round(tr.estimate / 60)} min` : `${tr.freq} Hz`, 30, h * 0.64);
        c.font = `400 ${Math.round(h * 0.1)}px ${FONT}`;
        c.fillStyle = 'rgba(255,255,255,0.85)';
        c.fillText(tr.guided ? `Guided · ${tr.intent}` : tr.intent, 30, h * 0.86);
      }, () => app.select(tr));
      return this._add(card, (col - 1.5) * 0.325, 0.2 - row * 0.165);
    });

    // option rows
    const y1 = -0.36, y2 = -0.45;
    [5, 10, 20].forEach((m, i) => {
      this._add(new Button(0.13, 0.065, pill(`${m} min`, () => app.minutes === m && !app.selected.guided), () => app.setMinutes(m)), -0.6 + i * 0.14, y1);
    });
    this._add(new Button(0.17, 0.065, pill('Solfeggio', () => app.solfeggio), () => app.setSolfeggio(!app.solfeggio)), -0.08, y1);
    this._add(new Button(0.17, 0.065, pill('Whispers', () => app.whispers), () => app.setWhispers(!app.whispers)), 0.1, y1);
    this._add(new Button(0.17, 0.065, pill('Captions', () => app.captions), () => app.setCaptions(!app.captions)), 0.28, y1);
    this._add(new Button(0.12, 0.065, pill('Exit'), () => app.exitXR()), 0.6, y1);
    const label = { binaural: 'Binaural', isochronic: 'Isochronic', both: 'Bin + Iso', off: 'Off', gentle: 'Gentle', full: 'Full', rain: 'Rain', ocean: 'Ocean' };
    this._add(new Button(0.3, 0.065, pill(() => `Tones: ${label[app.entrainment]}`), () => app.setEntrainment(app.cycle('entrainment', ['binaural', 'isochronic', 'both', 'off']))), -0.48, y2);
    this._add(new Button(0.3, 0.065, pill(() => `Dives: ${label[app.dives]}`), () => app.setDives(app.cycle('dives', ['gentle', 'full', 'off']))), -0.16, y2);
    this._add(new Button(0.3, 0.065, pill(() => `Nature: ${label[app.nature]}`), () => app.engine.init().then(() => app.setNature(app.cycle('nature', ['off', 'rain', 'ocean'])))), 0.16, y2);
    this._add(new Button(0.16, 0.065, pill(() => `Vol ${Math.round(app.volume * 10)}`), () => app.setVolume(app.volume >= 0.95 ? 0.3 : Math.min(1, app.volume + 0.1))), 0.47, y2);
    const y3 = -0.54;
    this._add(new Button(0.2, 0.065, pill('Lights', () => app.lights), () => app.setLights(!app.lights)), -0.5, y3);
    this._add(new Button(0.3, 0.065, pill(() => `Flashing: ${app.lightMode === 'soft' ? 'Soft' : 'Exact'}`), () => app.setLightOpt('lightMode', app.lightMode === 'soft' ? 'exact' : 'soft')), -0.22, y3);
    this._add(new Button(0.3, 0.065, pill(() => `Brightness ${Math.round(app.lightMax * 100)}%`), () => app.setLightOpt('lightMax', app.lightMax >= 0.95 ? 0.2 : Math.round((app.lightMax + 0.2) * 10) / 10)), 0.1, y3);
    this._add(new Button(0.26, 0.065, pill(() => `Show: ${{ both: 'Symbol+glow', symbol: 'Symbol', field: 'Glow' }[app.lightStyle]}`), () => app.setLightOpt('lightStyle', app.cycle('lightStyle', ['both', 'symbol', 'field']))), 0.4, y3);

    this.beginBtn = this._add(new Button(0.42, 0.09, (c, w, h, b) => {
      roundRect(c, 4, 4, w - 8, h - 8, (h - 8) / 2);
      c.fillStyle = b.hover ? '#fff' : 'rgba(255,255,255,0.85)';
      c.fill();
      c.fillStyle = '#111';
      c.font = `600 ${Math.round(h * 0.38)}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(app.playing ? (app.playingTrack === app.selected ? 'Resume' : 'Switch track') : 'Begin', w / 2, h / 2 + 2);
    }, () => app.beginOrResume()), -0.12, -0.66);
    this.endBtn = this._add(new Button(0.22, 0.09, pill('End session'), () => app.stop()), 0.24, -0.66);
    bg.mesh.position.y = -0.07;

    // photosensitivity warning, shown before lights can be turned on
    this.warn = new THREE.Group();
    this.warn.position.z = 0.03;
    this.warn.visible = false;
    this.panel.add(this.warn);
    const card = new Button(1.12, 0.62, (c, w, h) => {
      roundRect(c, 0, 0, w, h, 40);
      c.fillStyle = 'rgba(18,14,30,0.98)'; c.fill();
      c.strokeStyle = 'rgba(255,200,120,0.6)'; c.lineWidth = 5; c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'left';
      c.font = `500 46px ${FONT}`; c.fillText('Flashing lights warning', 50, 80);
      c.font = `400 27px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.88)';
      const lines = [
        'Lights flash at about 1–40 times a second. This can trigger',
        'seizures in people with photosensitive epilepsy.',
        '',
        "Don't use if you or your family have had epilepsy or seizures,",
        'have a serious eye, head or heart condition, or are pregnant.',
        'Stop straight away if you feel unwell or disoriented.',
        'Never use while driving or after alcohol or drugs.',
      ];
      lines.forEach((l, i) => c.fillText(l, 50, 140 + i * 40));
    }, null, 800);
    card.mesh.renderOrder = 1001;
    card.mesh.position.y = 0.05;
    this.warn.add(card.mesh);
    this.warnButtons = [
      new Button(0.42, 0.08, pill('I understand, turn on lights'), () => app.acceptStrobe()),
      new Button(0.2, 0.08, pill('Not now'), () => app.declineStrobe()),
    ];
    this.warnButtons[0].mesh.position.set(-0.13, -0.18, 0.01);
    this.warnButtons[1].mesh.position.set(0.23, -0.18, 0.01);
    for (const b of this.warnButtons) { b.mesh.renderOrder = 1002; this.warn.add(b.mesh); }

    // toggle orb shown during a session
    this.orb = new Button(0.11, 0.11, (c, w, h, b) => {
      c.beginPath();
      c.arc(w / 2, h / 2, w / 2 - 6, 0, Math.PI * 2);
      c.fillStyle = b.hover ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)';
      c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.6)';
      c.lineWidth = 4;
      c.stroke();
      c.fillStyle = '#fff';
      for (let k = -1; k <= 1; k++) c.fillRect(w * 0.32, h / 2 + k * h * 0.13 - 3, w * 0.36, 6);
    }, () => this.show(true));
    this.group.add(this.orb.mesh);
    this.buttons.push(this.orb);

    // breathing cue
    this.cue = new Button(0.6, 0.12, (c, w, h) => {
      const s = this.cueState || {};
      c.fillStyle = 'rgba(255,255,255,0.92)';
      c.textAlign = 'center';
      c.font = `300 ${Math.round(h * 0.42)}px ${FONT}`;
      c.fillText(s.text || '', w / 2, h * 0.5);
      c.font = `400 ${Math.round(h * 0.2)}px ${FONT}`;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.fillText(s.sub || '', w / 2, h * 0.86);
    }, null, 700);
    this.cue.mesh.material.opacity = 0;
    this.group.add(this.cue.mesh);
  }

  refresh() {
    for (const b of this.buttons) b.redraw();
    this.endBtn.mesh.visible = this.app.playing;
    this.beginBtn.mesh.position.x = this.app.playing ? -0.12 : 0;
  }

  // Place the panel in front of where the user is looking (yaw only).
  placeInFront(head, forward) {
    const yaw = Math.atan2(-forward.x, -forward.z);
    this.panel.position.set(head.x - Math.sin(yaw) * 1.45, Math.max(1.0, head.y - 0.12), head.z - Math.cos(yaw) * 1.45);
    this.panel.rotation.set(0, yaw, 0);
    this.orb.mesh.position.set(head.x - Math.sin(yaw) * 1.0, head.y - 0.55, head.z - Math.cos(yaw) * 1.0);
    this.orb.mesh.rotation.set(-0.5, yaw, 0, 'YXZ');
    this.cue.mesh.position.set(head.x - Math.sin(yaw) * 1.7, head.y - 0.4, head.z - Math.cos(yaw) * 1.7);
    this.cue.mesh.rotation.set(0, yaw, 0);
  }

  show(on) {
    this.visible = on;
    this.panel.visible = on;
    this.orb.mesh.visible = !on && this.app.playing;
    if (on) {
      this.app.getHead((h, f) => this.placeInFront(h, f));
      this.refresh();
    }
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
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      dot.visible = false;
      scene.add(dot);
      ctl.userData = { ray, dot, connected: false };
      ctl.addEventListener('connected', (e) => { ctl.userData.connected = true; ctl.userData.mode = e.data.targetRayMode; });
      ctl.addEventListener('disconnected', () => { ctl.userData.connected = false; ray.visible = false; dot.visible = false; });
      ctl.addEventListener('select', () => {
        const hit = this._hit(ctl);
        if (hit && hit.onSelect) hit.onSelect();
        else if (!this.visible && this.app.playing && !hit) { /* ignore stray pinches while meditating */ }
      });
      scene.add(ctl);
      this.controllers.push(ctl);
    }
  }

  showWarning(on) {
    this.warn.visible = on;
    if (on && !this.visible) this.show(true);
  }

  _interactive() {
    if (this.warn.visible && this.panel.visible) return this.warnButtons.map((b) => b.mesh);
    const list = [];
    if (this.panel.visible) for (const b of this.buttons) if (b.onSelect && b.mesh.visible && b !== this.orb) list.push(b.mesh);
    if (this.orb.mesh.visible) list.push(this.orb.mesh);
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
      // gaze-based transient pointers have no visible ray of their own
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
