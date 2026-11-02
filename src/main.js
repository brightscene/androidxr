import * as THREE from 'three';
import { AudioEngine } from './audio/engine.js';
import { Composer, ImportedPlayer } from './audio/composer.js';
import { TRACKS } from './audio/tracks.js';
import { U, damp } from './visuals/common.js';
import { World } from './visuals/world.js';
import { OceanScene } from './visuals/scenes/ocean.js';
import { OrbScene } from './visuals/scenes/orb.js';
import { AuroraScene } from './visuals/scenes/aurora.js';
import { GeometryScene } from './visuals/scenes/geometry.js';
import { MandalaScene } from './visuals/scenes/mandala.js';
import { CymaticsScene } from './visuals/scenes/cymatics.js';
import { XRMenu } from './ui/xrMenu.js';
import { DomUI } from './ui/dom.js';

const SCENE_TYPES = {
  ocean: OceanScene, orb: OrbScene, aurora: AuroraScene,
  geometry: GeometryScene, mandala: MandalaScene, cymatics: CymaticsScene,
};

const PHASE_TEXT = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Rest' };

class App {
  constructor() {
    this.tracks = TRACKS;
    this.selected = TRACKS.find((t) => t.id === 'bloom');
    this.minutes = 10;
    this.binaural = true;
    this.solfeggio = true;
    this.volume = 0.8;
    this.playing = false;
    this.player = null;
    this.engine = new AudioEngine();
    this.state = { energy: 0.35, breath: 0, low: 0, mid: 0, high: 0, level: 0 };
    this.sectionEnergy = 0.35;
    this.events = [];

    // --- renderer
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(1);
    document.getElementById('stage').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 300);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.world = new World(this.scene);
    this.menu = new XRMenu(this);
    this.menu.group.visible = false;
    this.scene.add(this.menu.group);
    this.menu.attachControllers(r, this.scene);

    this.active = null;
    this.outgoing = [];
    this.palTarget = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    this.applyPalette(this.selected.palette, true);
    this.setScene(this.selected.scene);

    this.ui = new DomUI(this);
    this._lookControls();
    window.addEventListener('resize', () => this._resize());
    r.xr.addEventListener('sessionstart', () => this._onXRStart());
    r.xr.addEventListener('sessionend', () => this._onXREnd());

    this.lastT = performance.now();
    this.t = 0;
    this.idle = { nextBeat: 0, beat: 0 };
    r.setAnimationLoop((time, frame) => this.frame(frame));
  }

  // ------------------------------------------------------------ selection
  select(track) {
    this.selected = track;
    if (!this.playing) {
      this.setScene(track.scene);
      this.applyPalette(track.palette);
    }
    this.menu.refresh();
    this.ui.refresh();
  }

  setMinutes(m) { this.minutes = m; this.ui.refresh(); this.menu.refresh(); }
  setBinaural(on) { this.binaural = on; this.player?.setBinaural(on); this.ui.refresh(); this.menu.refresh(); }
  setSolfeggio(on) { this.solfeggio = on; this.player?.setSolfeggio(on); this.ui.refresh(); this.menu.refresh(); }
  setVolume(v) { this.volume = v; this.engine.setVolume(v); }

  applyPalette(pal, instant) {
    pal.forEach((hex, i) => this.palTarget[i].set(hex));
    if (instant) [U.uC0, U.uC1, U.uC2].forEach((u, i) => u.value.copy(this.palTarget[i]));
  }

  setScene(name) {
    if (this.active && this.active.name === name) return;
    if (this.active) this.outgoing.push(this.active);
    const s = new SCENE_TYPES[name]();
    s.name = name;
    s.setFade(0);
    this.scene.add(s.group);
    this.active = s;
    if (!this.playing) s.onEvent({ type: 'section', index: 2, energy: 0.6, time: 0 });
  }

  // ------------------------------------------------------------ playback
  async beginOrResume() {
    if (this.playing && this.playingTrack === this.selected) { this.menu.show(false); return; }
    await this.start(this.selected);
  }

  async start(track) {
    await this.engine.init();
    this.engine.setVolume(this.volume);
    if (this.player) this.player.stop(2.5);
    const opts = { minutes: this.minutes, binaural: this.binaural, solfeggio: this.solfeggio };
    this.player = track.buffer
      ? new ImportedPlayer(this.engine, track, track.buffer, opts)
      : new Composer(this.engine, track, opts);
    this.engine.fadeMaster(1, 3);
    this.player.start();
    this.playing = true;
    this.playingTrack = track;
    this.sectionName = '';
    this.setScene(track.scene);
    this.applyPalette(track.palette);
    if (this.renderer.xr.isPresenting) this.menu.show(false);
    this.menu.refresh();
    this.ui.onStart(track);
  }

  stop(completed = false) {
    if (!this.playing) return;
    this.playing = false;
    this.player.stop(4);
    this.engine.fadeMaster(0, 4);
    const p = this.player;
    setTimeout(() => { if (this.player === p) this.player = null; }, 4500);
    if (this.renderer.xr.isPresenting) this.menu.show(true);
    this.menu.refresh();
    this.ui.onStop(completed);
  }

  async importFile(file, sceneName) {
    await this.engine.init();
    const buf = await this.engine.ctx.decodeAudioData(await file.arrayBuffer());
    const base = this.selected.buffer ? this.tracks.find((t) => t.freq === this.selected.freq) || TRACKS[4] : this.selected;
    const track = {
      ...base,
      id: 'import',
      title: file.name.replace(/\.[^.]+$/, '').slice(0, 28),
      intent: `Your track · ${base.freq} Hz tone`,
      scene: sceneName || base.scene,
      buffer: buf,
    };
    this.imported = track;
    this.select(track);
    return track;
  }

  // ------------------------------------------------------------ XR
  async enterXR(mode) {
    await this.engine.init();
    const session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'bounded-floor'],
    });
    this.xrMode = mode;
    await this.renderer.xr.setSession(session);
  }

  exitXR() { this.renderer.xr.getSession()?.end(); }

  _onXRStart() {
    const ar = this.xrMode === 'immersive-ar';
    this.world.setPassthrough(ar);
    this.renderer.setClearColor(0x000000, ar ? 0 : 1);
    this.menu.group.visible = true;
    this.menu.show(!this.playing);
    this._placeMenuIn = 4; // wait for first real head pose
    this.ui.setXR(true);
  }

  _onXREnd() {
    this.world.setPassthrough(false);
    this.renderer.setClearColor(0x000000, 1);
    this.menu.group.visible = false;
    this.ui.setXR(false);
    this._resize();
  }

  getHead(cb) {
    const cam = this.renderer.xr.isPresenting ? this.renderer.xr.getCamera() : this.camera;
    const pos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const fwd = new THREE.Vector3(0, 0, -1).transformDirection(cam.matrixWorld);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(cam.matrixWorld);
    if (cb) cb(pos, fwd, up);
    return { pos, fwd, up };
  }

  // ------------------------------------------------------------ frame
  frame() {
    const nowMs = performance.now();
    const dt = Math.min(0.1, (nowMs - this.lastT) / 1000);
    this.lastT = nowMs;
    this.t += dt;
    const t = this.t;
    U.uTime.value = t;

    const xr = this.renderer.xr;
    if (xr.isPresenting) {
      const bl = xr.getBaseLayer();
      const h = (bl && (bl.framebufferHeight || bl.textureHeight)) || 1800;
      U.uViewH.value = h / 2;
      if (this._placeMenuIn > 0 && --this._placeMenuIn === 0) this.getHead((p, f) => this.menu.placeInFront(p, f));
      this.menu.update();
    } else {
      U.uViewH.value = this.renderer.domElement.height / 2;
    }

    const head = this.getHead();
    if (this.engine.ctx) this.engine.updateListener(head.pos, head.fwd, head.up);

    // palette glide
    [U.uC0, U.uC1, U.uC2].forEach((u, i) => u.value.lerp(this.palTarget[i], 1 - Math.exp(-dt * 0.8)));

    const s = this.state;
    let events = this.events;
    events.length = 0;
    if (this.player && this.playing) {
      const now = this.engine.heardTime;
      this.player.pollEvents(now, events);
      const b = this.player.getBreath(now);
      s.breath = damp(s.breath, b.value, 8, dt);
      this.engine.readBands(s);
      const sec = this.player.sectionAtTime(now);
      const remain = Math.max(0, this.player.duration - this.player.elapsed(now));
      const mm = Math.floor(remain / 60), ss = String(Math.floor(remain % 60)).padStart(2, '0');
      const count = b.left > 0.05 ? Math.ceil(b.left) : '';
      const cueText = `${PHASE_TEXT[b.phase]}${count ? '  ' + count : ''}`;
      const sub = `${this.playingTrack.title} · ${this.playingTrack.freq} Hz · ${sec.name} · ${mm}:${ss}`;
      const alpha = sec.index <= 1 ? 0.9 : sec.index === 4 ? 0.6 : 0.3;
      this.menu.setCue(cueText, sub, this.menu.visible ? 0 : alpha);
      this.ui.setCue(cueText, `${sec.name} · ${mm}:${ss} left`, this.player.progress(now), alpha);
    } else {
      // idle preview: a gentle synthetic pulse so the scene is alive in the menu
      s.breath = 0.5 - 0.5 * Math.cos((t / 10) * Math.PI * 2);
      s.level = damp(s.level, 0, 2, dt);
      if (t >= this.idle.nextBeat) {
        const i = this.idle.beat++;
        this.idle.nextBeat = t + 1.1;
        events.push({ type: 'beat', beat: i % 4, bar: i >> 2, accent: i % 4 === 0 });
        if (i % 4 === 0) events.push({ type: 'bar', bar: i >> 2 });
        if (i % 8 === 0) events.push({ type: 'chord', index: (i >> 3) % 4 });
        if (Math.random() < 0.45) {
          const u = Math.random(), az = (u - 0.5) * 2.4, r = 2.6;
          events.push({ type: 'note', u, vel: 0.5, pos: [Math.sin(az) * r, 0.9 + u * 1.9, -Math.cos(az) * r] });
        }
      }
      this.menu.setCue('', '', 0);
    }

    for (const e of events) {
      if (e.type === 'section') this.sectionEnergy = e.energy;
      if (e.type === 'beat') U.uBeat.value = Math.min(1, U.uBeat.value + (e.accent ? 0.7 : 0.3));
      if (e.type === 'note') this.world.sparks.emit(e.pos, e.vel);
      if (e.type === 'end') { this.stop(true); continue; }
      this.active?.onEvent(e);
    }

    s.energy = damp(s.energy, this.playing ? this.sectionEnergy : 0.4, 0.5, dt);
    U.uEnergy.value = s.energy;
    U.uBreath.value = s.breath;
    U.uLevel.value = s.level;
    U.uBeat.value *= Math.exp(-dt * 3);

    // scene crossfades
    if (this.active) {
      this.active.setFade(damp(this.active.fade, 1, 0.8, dt));
      this.active.update(dt, t, s);
    }
    this.outgoing = this.outgoing.filter((o) => {
      o.setFade(damp(o.fade, 0, 1.2, dt));
      if (o.fade < 0.01) { o.dispose(); return false; }
      o.update(dt, t, s);
      return true;
    });

    this.world.update(dt, t, head.pos);
    this.renderer.render(this.scene, this.camera);
  }

  _resize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // Drag to look around on flat screens (phone, tablet, desktop, Android XR 2D panel).
  _lookControls() {
    const el = this.renderer.domElement;
    let down = null;
    this.yaw = 0; this.pitch = 0.05;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      this.yaw += (e.clientX - down.x) * 0.0045;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch + (e.clientY - down.y) * 0.0045));
      down = { x: e.clientX, y: e.clientY };
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    });
    const up = () => (down = null);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

window.app = new App();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
