import * as THREE from 'three';
import { AudioEngine } from './audio/engine.js';
import { Composer, ImportedPlayer, StreamPlayer } from './audio/composer.js';
import { TRACKS, GUIDED, LIGHT_TRACKS } from './audio/tracks.js';
import { SCRIPTS, WHISPERS, WELCOMES, estimateSeconds } from './audio/scripts.js';
import { Voice, GuideRunner } from './audio/voice.js';
import { bandName } from './audio/entrainment.js';
import { decodeStrobe, flashRateAt } from './audio/strobe.js';
import { StrobeLayer } from './visuals/strobe.js';
import { U, damp } from './visuals/common.js';
import { World } from './visuals/world.js';
import { GalaxyScene } from './visuals/scenes/galaxy.js';
import { OceanScene } from './visuals/scenes/ocean.js';
import { OrbScene } from './visuals/scenes/orb.js';
import { AuroraScene } from './visuals/scenes/aurora.js';
import { GeometryScene } from './visuals/scenes/geometry.js';
import { MandalaScene } from './visuals/scenes/mandala.js';
import { CymaticsScene } from './visuals/scenes/cymatics.js';
import { XRMenu } from './ui/xrMenu.js';
import { DomUI } from './ui/dom.js';

const SCENE_TYPES = {
  galaxy: GalaxyScene, ocean: OceanScene, orb: OrbScene, aurora: AuroraScene,
  geometry: GeometryScene, mandala: MandalaScene, cymatics: CymaticsScene,
};
// how fast you drift through space, and how vivid the projected nebula is, per scene
const SCENE_FEEL = {
  galaxy: { cruise: 1.2, nebula: 1 }, aurora: { cruise: 0.3, nebula: 0.5 }, ocean: { cruise: 0.25, nebula: 0.55 },
  orb: { cruise: 0.5, nebula: 0.8 }, geometry: { cruise: 0.45, nebula: 0.7 }, mandala: { cruise: 0.4, nebula: 0.7 },
  cymatics: { cruise: 0.4, nebula: 0.7 },
};
const PHASE_TEXT = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Rest' };
const COMFORT = { off: 0, gentle: 0.5, full: 1 };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const loadPrefs = () => { try { return JSON.parse(localStorage.getItem('mindlyte') || '{}'); } catch { return {}; } };

class App {
  constructor() {
    this.tracks = TRACKS;
    this.guided = GUIDED;
    this.lightTracks = LIGHT_TRACKS;
    for (const t of LIGHT_TRACKS) t.loading = this._loadLightTrack(t);
    for (const g of GUIDED) g.estimate = estimateSeconds(SCRIPTS[g.guided]);
    const p = loadPrefs();
    this.selected = [...LIGHT_TRACKS, ...TRACKS, ...GUIDED].find((t) => t.id === p.selected) || TRACKS.find((t) => t.id === 'intuition');
    this.minutes = p.minutes || 10;
    this.entrainment = p.entrainment || 'binaural';
    this.journey = p.journey || 'auto';
    this.solfeggio = p.solfeggio ?? true;
    this.whispers = p.whispers ?? true;
    this.captions = p.captions ?? false;
    this.dives = p.dives || 'gentle';
    this.nature = p.nature || 'off';
    this.voiceChoice = p.voice || 'auto';
    this.volume = p.volume ?? 0.8;
    // light (AudioStrobe / SpectraStrobe) settings
    this.strobeAccepted = p.strobeAccepted ?? false;
    this.lights = this.strobeAccepted ? p.lights ?? true : false;
    this.lightStyle = p.lightStyle || 'both';
    // v2 defaults: vivid colours, symbols side by side, dimmed background
    const v2 = p.v === 2;
    this.lightColour = v2 ? p.lightColour || 'vivid' : 'vivid';
    this.lightLayout = p.lightLayout || 'sides';
    this.lightDim = p.lightDim ?? 0.5;
    this.lightMax = p.lightMax ?? 0.6;
    this.lightMode = p.lightMode || 'exact';
    this.lightsGenerated = p.lightsGenerated ?? false;
    this.lightSymbol = p.lightSymbol ?? -1;
    this.rgb = [[0, 0, 0], [0, 0, 0]];
    this.playing = false;
    this.player = null;
    this.engine = new AudioEngine();
    this.voice = new Voice(this.engine);
    this.voice.setChoice(this.voiceChoice);
    this.voice.onVoices = () => this.ui?.refreshVoices();
    this.state = { energy: 0.35, breath: 0, low: 0, mid: 0, high: 0, level: 0 };
    this.sectionEnergy = 0.35;
    this.events = [];
    this.caption = '';

    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }));
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.xr.enabled = true;
    r.xr.setReferenceSpaceType('local-floor');
    r.xr.setFoveation(1);
    document.getElementById('stage').appendChild(r.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.05, 400);
    this.camera.position.set(0, 1.6, 0);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.world = new World(this.scene, this.camera);
    this.world.voyage.comfort = COMFORT[this.dives];
    this.strobe = new StrobeLayer(this.camera);
    this.strobe.setSymbol(this.lightSymbol);
    this.menu = new XRMenu(this);
    this.menu.group.visible = false;
    this.scene.add(this.menu.group);
    this.menu.attachControllers(r, this.scene);

    this.active = null;
    this.outgoing = [];
    this.palTarget = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    this.applyPalette(this.selected.palette, true);
    this.setScene(this.selected.scene);
    this.engine.setNature(this.nature);

    this.ui = new DomUI(this);
    this._lookControls();
    window.addEventListener('resize', () => this._resize());
    r.xr.addEventListener('sessionstart', () => this._onXRStart());
    r.xr.addEventListener('sessionend', () => this._onXREnd());

    this.lastT = performance.now();
    this.t = 0;
    this.idle = { nextBeat: 0, beat: 0, nextDive: 25 };
    r.setAnimationLoop(() => this.frame());
  }

  savePrefs() {
    try {
      localStorage.setItem('mindlyte', JSON.stringify({
        selected: this.selected.id === 'import' ? undefined : this.selected.id, minutes: this.minutes, entrainment: this.entrainment,
        journey: this.journey, solfeggio: this.solfeggio, whispers: this.whispers, captions: this.captions,
        dives: this.dives, nature: this.nature, voice: this.voiceChoice, volume: this.volume,
        strobeAccepted: this.strobeAccepted, lights: this.lights, lightStyle: this.lightStyle, lightColour: this.lightColour,
        v: 2, lightLayout: this.lightLayout, lightDim: this.lightDim,
        lightMax: this.lightMax, lightMode: this.lightMode, lightsGenerated: this.lightsGenerated, lightSymbol: this.lightSymbol,
      }));
    } catch (_) {}
  }

  _changed() { this.ui?.refresh(); this.menu.refresh(); this.savePrefs(); }

  // ------------------------------------------------------------ settings
  select(track) {
    this.selected = track;
    if (!this.playing) {
      this.setScene(track.scene);
      this.applyPalette(track.palette);
    }
    this._changed();
  }
  setMinutes(m) { this.minutes = m; this._changed(); }
  setEntrainment(m) { this.entrainment = m; this.player?.setEntrainment?.(m); this._changed(); }
  setJourney(j) { this.journey = j; this._changed(); }
  setSolfeggio(on) { this.solfeggio = on; this.player?.setSolfeggio(on); this._changed(); }
  setWhispers(on) { this.whispers = on; if (!on && !this.guide) this.voice.cancel(); this._changed(); }
  setCaptions(on) { this.captions = on; this._changed(); }
  setDives(d) { this.dives = d; this.world.voyage.comfort = COMFORT[d]; this._changed(); }
  setNature(n) { this.nature = n; this.engine.setNature(n); this._changed(); }
  setVoice(v) { this.voiceChoice = v; this.voice.setChoice(v); this._changed(); }
  setVolume(v) { this.volume = v; this.engine.setVolume(v); this.savePrefs(); }
  // Lights are photosensitive content: they stay off until the warning is accepted.
  setLights(on) {
    if (on && !this.strobeAccepted) { this.ui.showStrobeWarning(); this.menu.showWarning(true); return; }
    this.lights = on; this._changed();
  }
  acceptStrobe() { this.strobeAccepted = true; this.lights = true; this.menu.showWarning(false); this.ui.hideStrobeWarning(); this._changed(); }
  declineStrobe() { this.menu.showWarning(false); this.ui.hideStrobeWarning(); }
  setLightOpt(key, v) { this[key] = v; if (key === 'lightSymbol') this.strobe.setSymbol(v); this._changed(); }
  cycle(key, options) { const i = options.indexOf(this[key]); return options[(i + 1) % options.length]; }

  previewVoice() {
    this.voice.unlock();
    this.engine.init().then(() => this.voice.speak('welcome-1', WELCOMES[0]));
  }

  applyPalette(pal, instant) {
    pal.forEach((hex, i) => this.palTarget[i].set(hex));
    if (instant) [U.uC0, U.uC1, U.uC2].forEach((u, i) => u.value.copy(this.palTarget[i]));
  }

  setScene(name) {
    const feel = SCENE_FEEL[name] || SCENE_FEEL.galaxy;
    this.world.voyage.cruise = feel.cruise;
    this.world.setNebula(feel.nebula);
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
  beginOrResume() {
    this.voice.unlock(); // inside the user gesture
    if (this.playing && this.playingTrack === this.selected) { this.menu.show(false); return; }
    return this.start(this.selected);
  }

  // Fetch a built-in light track's pre-decoded light data and beat analysis.
  async _loadLightTrack(t) {
    try {
      const [meta, bin] = await Promise.all([
        fetch(t.metaUrl).then((r) => r.json()),
        fetch(t.lightsUrl).then((r) => r.arrayBuffer()),
      ]);
      const u8 = new Uint8Array(bin);
      const frames = meta.frames;
      const L = new Float32Array(frames * 3), R = new Float32Array(frames * 3);
      for (let i = 0; i < frames; i++) {
        const l = u8[i * 2] / 255, r = u8[i * 2 + 1] / 255;
        L[i * 3] = L[i * 3 + 1] = L[i * 3 + 2] = l;
        R[i * 3] = R[i * 3 + 1] = R[i * 3 + 2] = r;
      }
      t.meta = meta;
      t.strobe = { format: meta.format, carriers: meta.carriers, rate: meta.rate, frames, L, R, mono: true };
      this.ui?.refresh();
      this.menu?.refresh();
    } catch (err) {
      t.loadError = err;
    }
  }

  async start(track) {
    this.voice.unlock();
    if (track.stream && !track.meta) await track.loading;
    if (track.stream && !track.meta) { this.ui.toast('Could not load that track. Check your connection.'); return; }
    // a light track: make sure the viewer sees the safety warning and lights come on
    if (track.strobe && !this.strobeAccepted) this.setLights(true);
    await this.engine.init();
    this.engine.setVolume(this.volume);
    this._stopGuide();
    if (this.player) this.player.stop(2.5);
    const guided = !!track.guided;
    const est = guided ? track.estimate + (track.tail || 30) : 0;
    const opts = {
      minutes: guided ? est / 60 : this.minutes,
      // light-encoded tracks carry their own entrainment programme: don't layer ours on top
      entrainment: track.strobe ? 'off' : this.entrainment,
      profile: this.journey === 'auto' ? track.profile : this.journey,
      solfeggio: track.strobe ? false : this.solfeggio,
      dives: this.dives !== 'off',
    };
    this.player = track.stream ? new StreamPlayer(this.engine, track, opts)
      : track.buffer ? new ImportedPlayer(this.engine, track, track.buffer, opts) : new Composer(this.engine, track, opts);
    this.engine.fadeMaster(1, 3);
    this.player.start();
    this.playing = true;
    this.playingTrack = track;
    this.caption = '';
    this.whisperQueue = shuffle(WHISPERS.map((t, i) => ({ id: `whisper-${i + 1}`, text: t })));
    const w = Math.floor(Math.random() * WELCOMES.length);
    this.welcome = { id: `welcome-${w + 1}`, text: WELCOMES[w] };
    this.nextWhisper = this.engine.now + 22;
    if (guided) this._startGuide(track);
    this.setScene(track.scene);
    this.applyPalette(track.palette);
    if (this.renderer.xr.isPresenting) this.menu.show(false);
    this.menu.refresh();
    this.ui.onStart(track);
  }

  _startGuide(track) {
    const player = this.player;
    this.guide = new GuideRunner(this.voice, SCRIPTS[track.guided], {
      startDelay: 12,
      onLine: (text) => { this.caption = text; },
      onMark: (m) => {
        if (m.mark === 'dive' && this.dives !== 'off') player.dive(this.engine.now + 0.1, m.args[0] || 12, m.args[1] ?? 0.5);
      },
      onDone: () => {
        // let the music breathe on after the last words, then close gently
        const tail = track.tail || 30;
        this._guideEndTimer = setTimeout(() => { if (this.player === player && this.playing) this.stop(true); }, tail * 1000);
      },
    });
    this.guide.start();
  }

  _stopGuide() {
    clearTimeout(this._guideEndTimer);
    if (this.guide) { this.guide.stop(); this.guide = null; }
    this.voice.cancel();
    this.caption = '';
  }

  stop(completed = false) {
    if (!this.playing) return;
    this.playing = false;
    const fade = completed ? this.playingTrack.fadeOut || 5 : 4;
    this._stopGuide();
    this.player.stop(fade);
    this.engine.fadeMaster(0, fade);
    const p = this.player;
    setTimeout(() => { if (this.player === p) this.player = null; }, fade * 1000 + 500);
    if (this.renderer.xr.isPresenting) this.menu.show(true);
    this.menu.refresh();
    this.ui.onStop(completed);
  }

  async importFile(file, sceneName) {
    await this.engine.init();
    const buf = await this.engine.ctx.decodeAudioData(await file.arrayBuffer());
    this.ui.importStatus('Looking for AudioStrobe / SpectraStrobe light signals…');
    const strobe = await decodeStrobe(buf, (f) => this.ui.importStatus(`Decoding light signals… ${Math.round(f * 100)}%`));
    const base = this.selected.buffer || this.selected.guided ? TRACKS[4] : this.selected;
    const track = {
      ...base, id: 'import', guided: undefined,
      title: file.name.replace(/\.[^.]+$/, '').slice(0, 28),
      intent: `Your track · ${base.freq} Hz tone`,
      scene: sceneName || base.scene, buffer: buf, strobe,
    };
    if (strobe) {
      const name = strobe.format === 'spectrastrobe' ? 'SpectraStrobe (full colour)' : `AudioStrobe (${(strobe.carriers.a / 1000).toFixed(1)} kHz)`;
      track.intent = `${name} · lights`;
      // start a quiet session by default for light tracks: their own audio carries the entrainment
      this.ui.toast(`${name} light encoding found.${this.lights ? '' : ' Turn on Lights to see it.'}`);
    }
    this.imported = track;
    this.select(track);
    return track;
  }

  // Whispers: an occasional line from the guide during ordinary soundscapes.
  _whispers(now, sec, remain) {
    if (!this.whispers || this.playingTrack.guided || this.voice.speaking || now < this.nextWhisper) return;
    if (remain < 45) return;
    let line = null;
    if (this.welcome) { line = this.welcome; this.welcome = null; }
    else if (sec.index >= 1) line = this.whisperQueue.shift();
    if (!line) { this.nextWhisper = now + 20; return; }
    this.voice.speak(line.id, line.text, { onend: () => { if (this.caption === line.text) this.caption = ''; } });
    this.caption = line.text;
    this.nextWhisper = now + 95 + Math.random() * 85;
  }

  // ------------------------------------------------------------ XR
  async enterXR(mode) {
    this.voice.unlock();
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
    this._placeMenuIn = 4;
    this.strobe.setXR(true);
    this.ui.setXR(true);
  }

  _onXREnd() {
    this.world.setPassthrough(false);
    this.renderer.setClearColor(0x000000, 1);
    this.menu.group.visible = false;
    this.strobe.setXR(false);
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
    [U.uC0, U.uC1, U.uC2].forEach((u, i) => u.value.lerp(this.palTarget[i], 1 - Math.exp(-dt * 0.8)));

    const s = this.state;
    const events = this.events;
    events.length = 0;
    if (this.player && this.playing) {
      const now = this.engine.heardTime;
      this.player.pollEvents(now, events);
      const b = this.player.getBreath(now);
      s.breath = damp(s.breath, b.value, 8, dt);
      this.engine.readBands(s);
      const sec = this.player.sectionAtTime(now);
      const remain = Math.max(0, this.player.duration - this.player.elapsed(now));
      // a guided voice must never be cut off by the music ending
      if (this.guide && !this.guide.done && remain < 50 && this.player.extend) this.player.extend(60);
      this._whispers(this.engine.now, sec, remain);
      const mm = Math.floor(remain / 60), ss = String(Math.floor(remain % 60)).padStart(2, '0');
      const hz = this.player.beatHz(now);
      const wave = this.player.entrainMode !== 'off' && hz ? ` · ${bandName(hz)} ${hz.toFixed(1)} Hz` : '';
      const lr = this.lightRates && this.lights ? ` · Lights ${this.lightRates[0].toFixed(1)}/${this.lightRates[1].toFixed(1)} Hz` : '';
      const sub = `${this.playingTrack.title} · ${sec.name}${wave}${lr} · ${mm}:${ss}`;
      let cue, alpha;
      if (this.playingTrack.guided) {
        cue = this.captions ? this.caption : '';
        alpha = cue ? 0.85 : 0;
      } else if (this.caption && this.captions) {
        cue = this.caption; alpha = 0.85;
      } else {
        const count = b.left > 0.05 ? Math.ceil(b.left) : '';
        cue = `${PHASE_TEXT[b.phase]}${count ? '  ' + count : ''}`;
        alpha = sec.index <= 1 ? 0.9 : sec.index === 4 ? 0.6 : 0.3;
      }
      this.menu.setCue(cue, sub, this.menu.visible ? 0 : alpha);
      this.ui.setCue(cue, `${sec.name}${wave}${lr} · ${mm}:${ss} left`, this.player.progress(now), alpha);
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
        if (Math.random() < 0.35) {
          const u = Math.random(), az = (u - 0.5) * 2.4, r = 2.6;
          events.push({ type: 'note', u, vel: 0.5, pos: [Math.sin(az) * r, 0.9 + u * 1.9, -Math.cos(az) * r] });
        }
      }
      if (t > this.idle.nextDive) { this.idle.nextDive = t + 45; events.push({ type: 'dive', duration: 9, intensity: 0.5 }); }
      this.menu.setCue('', '', 0);
    }

    for (const e of events) {
      if (e.type === 'section') this.sectionEnergy = e.energy;
      if (e.type === 'beat') U.uBeat.value = Math.min(1, U.uBeat.value + (e.accent ? 0.7 : 0.3));
      if (e.type === 'note') this.world.sparks.emit(e.pos, e.vel);
      if (e.type === 'dive') this.world.voyage.startDive(e.duration, e.intensity);
      if (e.type === 'end') {
        if (this.guide && !this.guide.done) continue;
        this.stop(true);
        continue;
      }
      this.active?.onEvent(e);
    }

    s.energy = damp(s.energy, this.playing ? this.sectionEnergy : 0.4, 0.5, dt);
    U.uEnergy.value = s.energy;
    U.uBreath.value = s.breath;
    U.uLevel.value = s.level;
    U.uBeat.value *= Math.exp(-dt * 3);

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

    this._updateLights(dt, t);
    this.world.update(dt, t, head.pos);
    this.renderer.render(this.scene, this.camera);
  }

  // Per-eye light colour from decoded AudioStrobe/SpectraStrobe, or (optionally)
  // pulsed at the brainwave beat rate on generated tracks.
  _updateLights(dt, t) {
    let target = null;
    const tr = this.playingTrack;
    if (this.lights && this.strobeAccepted && this.playing && this.player) {
      const now = this.engine.heardTime;
      const st = tr.strobe;
      if (st) {
        const i = Math.min(st.frames - 1, Math.max(0, Math.floor(this.player.elapsed(now) * st.rate)));
        const eye = (arr, side) => {
          if (!st.mono) return [arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]];
          const c = this._colourSet(side, t);
          const b = arr[i * 3];
          return [c.r * b, c.g * b, c.b * b];
        };
        target = [eye(st.L, 0), eye(st.R, 1)];
        if (t - (this._rateT || 0) > 1) {
          this._rateT = t;
          const el = this.player.elapsed(now);
          this.lightRates = [flashRateAt(st, 0, el), flashRateAt(st, 1, el)];
        }
      } else if (this.lightsGenerated && this.entrainment !== 'off') {
        const hz = this.player.beatHz(now);
        const ph = this.player.elapsed(now) * hz * Math.PI * 2;
        const b = Math.pow(0.5 + 0.5 * Math.sin(ph), 2) * Math.min(1, this.sectionEnergy + 0.3);
        target = [0, 1].map((side) => { const c = this._colourSet(side, t); return [c.r * b, c.g * b, c.b * b]; });
        this.lightRates = [hz, hz];
      }
    }
    if (!target) { this.lightRates = null; this.strobe.update(dt, t, null, null, {}); return; }
    const k = this.lightMode === 'soft' ? 1 - Math.exp(-dt * 7) : 1;
    for (let s = 0; s < 2; s++) for (let c = 0; c < 3; c++) this.rgb[s][c] += (target[s][c] - this.rgb[s][c]) * k;
    this.strobe.update(dt, t, this.rgb[0], this.rgb[1], { style: this.lightStyle, max: this.lightMax, layout: this.lightLayout, dim: this.lightDim });
  }

  _colourSet(side, t) {
    const c = (this._lc ||= [new THREE.Color(), new THREE.Color()])[side];
    // fully saturated sets so the lights stand out against the stars and nebula
    switch (this.lightColour) {
      case 'vivid': return side ? c.setRGB(0, 0.85, 1) : c.setRGB(1, 0.08, 0.62);
      case 'white': return c.setRGB(1, 0.94, 0.86);
      case 'amber': return side ? c.setRGB(1, 0.72, 0.05) : c.setRGB(1, 0.36, 0);
      case 'violet': return side ? c.setRGB(0, 1, 0.75) : c.setRGB(0.6, 0.1, 1);
      case 'rainbow': return c.setHSL((t * 0.012 + side * 0.5) % 1, 1, 0.5);
      default: { // track palette, pushed to full saturation, with left/right in different hues
        const hsl = {};
        c.copy(side ? U.uC1.value : U.uC2.value).getHSL(hsl);
        return c.setHSL((hsl.h + (side ? 0.08 : 0)) % 1, 1, 0.55);
      }
    }
  }

  _resize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _lookControls() {
    const el = this.renderer.domElement;
    let down = null;
    this.yaw = 0; this.pitch = 0.05;
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', (e) => {
      if (!down) return;
      this.yaw += (e.clientX - down.x) * 0.0045;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - down.y) * 0.0045));
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
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}
