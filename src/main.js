import * as THREE from 'three';
import { XRHandModelFactory } from 'three/examples/jsm/webxr/XRHandModelFactory.js';
import { AudioEngine } from './audio/engine.js';
import { Composer, ImportedPlayer, StreamPlayer } from './audio/composer.js';
import { TRACKS, GUIDED, LIGHT_TRACKS } from './audio/tracks.js';
import { SCRIPTS, WHISPERS, WELCOMES, estimateSeconds } from './audio/scripts.js';
import { Voice, GuideRunner } from './audio/voice.js';
import { MyAffirmations } from './audio/myAffirmations.js';
import { bandName } from './audio/entrainment.js';
import { decodeStrobe, flashRateAt } from './audio/strobe.js';
import { StrobeLayer } from './visuals/strobe.js';
import { U, damp, SFX, INPUT } from './visuals/common.js';
import { World } from './visuals/world.js';
import { SCENES } from './visuals/scenes/index.js';
import { XRMenu } from './ui/xrMenu.js';
import { buildJourneys, premiumUnlocked } from './journeys.js';
import { DomUI } from './ui/dom.js';

const PHASE_TEXT = { in: 'Breathe in', hold: 'Hold', out: 'Breathe out', rest: 'Rest' };
const COMFORT = { off: 0, gentle: 0.5, full: 1 };
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const loadPrefs = () => { try { return JSON.parse(localStorage.getItem('mindlyte') || '{}'); } catch { return {}; } };

const HAND_JOINTS = ['wrist',
  'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip'];

class App {
  constructor() {
    this.tracks = TRACKS;
    this.guided = GUIDED;
    this.lightTracks = LIGHT_TRACKS;
    for (const t of LIGHT_TRACKS) t.loading = this._loadLightTrack(t);
    for (const g of GUIDED) g.estimate = estimateSeconds(SCRIPTS[g.guided]);
    const p = loadPrefs();
    this.journeys = buildJourneys();
    this.premium = premiumUnlocked();
    this.selected = this.journeys.all.find((t) => t.id === p.selected) || this.journeys.free[0];
    this.minutes = p.minutes || 10;
    this.entrainment = p.entrainment || 'binaural';
    this.journey = p.journey || 'auto';
    this.solfeggio = p.solfeggio ?? true;
    this.whispers = p.voiceInSoundscapes ?? false;   // spoken lines outside guided sessions: off unless chosen
    this.captions = p.captions ?? false;
    this.dives = p.dives || 'gentle';
    this.nature = p.nature || 'off';
    this.voiceChoice = p.voice || 'auto';
    this.background = p.background || 'auto';
    // a scene that's no longer on the Scene tab (the star skies are journeys now)
    if (this.background !== 'auto' && (!SCENES[this.background] || SCENES[this.background].journey || SCENES[this.background].hidden)) this.background = 'auto';
    this.quality = p.quality || 'balanced'; // smooth | balanced | sharp
    this.breathText = p.breathGuide ?? false;
    this.guideVoice = p.guideVoice ?? true;   // speak the guided sessions (off = music, scenes and captions only)
    this.mineOn = p.mineOn ?? true;          // mix your own recorded affirmations into sessions
    this.mineEvery = p.mineEvery ?? 90;     // roughly how often (seconds)
    this.perf = { avg: 1 / 72, level: 0, t: 0 };
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
    this.mine = new MyAffirmations(this.engine);
    SFX.play = (kind, opts) => { if (this.playing) this.engine.sfx(kind, opts); };
    SFX.say = (id, pan, text) => (this.playing ? this.voice.sayPanned(id, pan, text) : Promise.resolve(false));
    SFX.preload = (id) => this.voice.preload(id);
    SFX.audio = () => (this.playing && this.engine.ctx && this.engine.master
      ? { ctx: this.engine.ctx, out: this.engine.sfxOut(), reverb: this.engine.reverbSend, noise: this.engine.noise || this.engine.whiteNoise, analyser: this.engine.analyser } : null);
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
    r.localClippingEnabled = true;   // the menu's scrolling journey list
    r.xr.setReferenceSpaceType('local-floor');
    // light foveation only: high values make the edges of view visibly blocky
    r.xr.setFoveation(0.25);
    r.setClearColor(0x000000, 1); // opaque black behind everything (passthrough switches to transparent)
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
    // pinches and trigger presses, for scenes you play (strike a singing bowl)
    for (let i = 0; i < 2; i++) r.xr.getController(i).addEventListener('selectstart', () => { if (this.active?.wantsPointer && !this.menu.visible) INPUT.presses.push(i); });
    for (let i = 0; i < 2; i++) {
      r.xr.getController(i).addEventListener('selectstart', () => { if (this.active?.wantsPointer && !this.menu.visible) INPUT.held.add(i); });
      r.xr.getController(i).addEventListener('selectend', () => INPUT.held.delete(i));
    }
    for (let i = 0; i < 2; i++) this.scene.add(this.renderer.xr.getHand(i));   // fingertips for tracing scenes
    // realistic hand models, shown in scenes that want your hands (the jet ski)
    const handSkin = new THREE.ShaderMaterial({
      uniforms: { uCol: { value: new THREE.Color('#e9c3a8') } },
      vertexShader: '#include <common>\n#include <skinning_pars_vertex>\nvarying vec3 vN; varying vec3 vV;\nvoid main(){\n#include <skinbase_vertex>\n#include <begin_vertex>\n#include <beginnormal_vertex>\n#include <skinnormal_vertex>\n#include <skinning_vertex>\n  vN = normalize(normalMatrix * objectNormal); vec4 mv = modelViewMatrix * vec4(transformed, 1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;\n}',
      fragmentShader: 'uniform vec3 uCol; varying vec3 vN; varying vec3 vV; void main(){ vec3 n = normalize(vN); float l = 0.45 + 0.55 * max(dot(n, normalize(vec3(0.3, 0.8, 0.5))), 0.0); float rim = pow(1.0 - abs(dot(n, vV)), 3.0); gl_FragColor = vec4(uCol * l + vec3(1.0, 0.9, 0.85) * rim * 0.35, 1.0); }',
    });
    const handFactory = new XRHandModelFactory(null, (obj) => obj.traverse((o) => { if (o.isMesh || o.isSkinnedMesh) { o.material = handSkin; o.frustumCulled = false; } }));
    handFactory.setPath('hands/');
    this.handModels = [0, 1].map((i) => { const m = handFactory.createHandModel(this.renderer.xr.getHand(i), 'mesh'); m.visible = false; this.renderer.xr.getHand(i).add(m); return m; });

    this.active = null;
    this.outgoing = [];
    this.palTarget = [new THREE.Color(), new THREE.Color(), new THREE.Color()];
    this.applyPalette(this.selected.palette, true);
    this.setScene('nebula');   // the app always opens on Nebula drift
    this._claimAudio(false);   // listen for another open copy taking over the sound
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
        journey: this.journey, solfeggio: this.solfeggio, voiceInSoundscapes: this.whispers, captions: this.captions,
        dives: this.dives, nature: this.nature, voice: this.voiceChoice, volume: this.volume, background: this.background, quality: this.quality, breathGuide: this.breathText, guideVoice: this.guideVoice, mineOn: this.mineOn, mineEvery: this.mineEvery,
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
    if (!this.playing && !this.xrIdle) {
      this.setScene(this.sceneFor(track));
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
  setQuality(q) { this.quality = q; this._applyQuality(); this._changed(); }
  setGuideVoice(on) { this.guideVoice = on; if (!on && this.guide) this.voice.cancel(); this._changed(); }
  setMine(on) { this.mineOn = on; this._changed(); }
  setMineEvery(s) { this.mineEvery = s; this._changed(); }
  setBreathText(on) { this.breathText = on; this._changed(); }

  _applyQuality() {
    const q = { smooth: [0.75, 0.45], balanced: [0.9, 0.25], sharp: [1.0, 0.1] }[this.quality] || [0.9, 0.25];
    if (!this.renderer.xr.isPresenting) this.renderer.xr.setFramebufferScaleFactor(q[0]);
    this.renderer.xr.setFoveation(q[1]);
    this.perf.level = 0; U.uOct.value = 4;
  }

  setVolume(v) { this.volume = v; this.engine.setVolume(v); this.savePrefs(); }
  // Lights are photosensitive content: they stay off until the warning is accepted.
  setLights(on) {
    if (on && !this.strobeAccepted) { this.ui.showStrobeWarning(); this.menu.showWarning(true); return; }
    this.lights = on; this._changed();
  }
  acceptStrobe() {
    this.strobeAccepted = true; this.lights = true; this.menu.showWarning(false); this.ui.hideStrobeWarning(); this._changed();
    if (this.playing && this.renderer.xr.isPresenting) this.menu.show(false);   // straight into the session that asked
  }
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

  // A scene picked on the Scene tab is used for the session (tapping a journey in
  // the list sets it back to Auto). Interactive journeys keep their own world: you
  // can't trace Reiki symbols or play singing bowls anywhere else.
  sceneFor(track) {
    const own = SCENES[track.scene];
    return this.background === 'auto' || own?.premium || own?.own ? track.scene : this.background;
  }

  setBackground(b) {
    this.background = b;
    this.setScene(this.sceneFor(this.playing ? this.playingTrack : this.selected));   // picking a scene previews it
    this._changed();
  }

  setScene(name) {
    if (!SCENES[name]) name = 'galaxy';
    const feel = SCENES[name];
    this.world.setMode(feel.world);
    this.world.voyage.cruise = feel.cruise;
    this.world.setNebula(feel.nebula);
    if (this.active && this.active.name === name) return;
    if (this.active) { this.active.silence?.(); this.outgoing.push(this.active); }
    // switching quickly: only the most recent scene fades out, older ones are freed at once
    while (this.outgoing.length > 1) this.outgoing.shift().dispose();
    const s = new feel.type();
    s.name = name;
    s.setFade(0);
    this.scene.add(s.group);
    this.active = s;
    if (!this.playing) s.onEvent({ type: 'section', index: 2, energy: 0.6, time: 0 });
    // a smooth change: the old scene fades right out, then the view is centred
    // (every new scene starts facing straight ahead) and the new one fades in
    s.hold = this.outgoing.some((o) => o.fade > 0.03);
    if (!s.hold) this.recentre(true);
  }

  // ------------------------------------------------------------ playback
  // For testing until payments are connected: a long press on the MindLyte logo
  // switches Premium on or off (remembered on this device).
  togglePremium() {
    this.premium = !this.premium;
    try { if (this.premium) localStorage.setItem('mindlyte-premium', '1'); else localStorage.removeItem('mindlyte-premium'); } catch {}
    this.ui.toast(this.premium ? 'Premium unlocked for testing' : 'Premium locked again');
    this.menu.showUnlock?.(false);
    this.menu._layoutJourneys?.();
    this._changed();
  }

  // Tapping a journey in the list: it starts in its own world (any scene picked on
  // the Scene tab gives way to the journey; pick a scene afterwards to change it).
  playJourney(tr) {
    if (this.background !== 'auto') { this.background = 'auto'; this.savePrefs?.(); }
    this.select(tr);
    return this.beginOrResume();
  }

  beginOrResume() {
    this.voice.unlock(); // inside the user gesture
    // a Premium journey without Premium: show the offer instead
    if (!this.selected.free && !this.premium) { this.menu.showUnlock?.(true); this.ui.showUnlock?.(); return; }
    if (this.playing && this.playingTrack === this.selected) { this.menu.show(false); return; }
    return this.start(this.selected);
  }

  // Fetch a built-in light track's pre-decoded light data and beat analysis.
  async _loadLightTrack(t) {
    if (!t.lightsUrl) {
      // a music track with no light signal: just its beat analysis
      try { t.meta = await fetch(t.metaUrl).then((r) => r.json()); this.ui?.refresh(); this.menu?.refresh(); } catch (err) { t.loadError = err; }
      return;
    }
    try {
      const [meta, bin] = await Promise.all([
        fetch(t.metaUrl).then((r) => r.json()),
        fetch(t.lightsUrl).then((r) => r.arrayBuffer()),
      ]);
      // AudioStrobe: 2 bytes/frame (left, right brightness)
      // SpectraStrobe: 6 bytes/frame (left r,g,b, right r,g,b)
      const u8 = new Uint8Array(bin);
      const frames = meta.frames;
      const mono = meta.format !== 'spectrastrobe';
      const L = new Float32Array(frames * 3), R = new Float32Array(frames * 3);
      for (let i = 0; i < frames; i++) {
        if (mono) {
          const l = u8[i * 2] / 255, r = u8[i * 2 + 1] / 255;
          L[i * 3] = L[i * 3 + 1] = L[i * 3 + 2] = l;
          R[i * 3] = R[i * 3 + 1] = R[i * 3 + 2] = r;
        } else {
          for (let k = 0; k < 3; k++) { L[i * 3 + k] = u8[i * 6 + k] / 255; R[i * 3 + k] = u8[i * 6 + 3 + k] / 255; }
        }
      }
      t.meta = meta;
      t.strobe = { format: meta.format, carriers: meta.carriers, rate: meta.rate, frames, L, R, mono };
      this.ui?.refresh();
      this.menu?.refresh();
    } catch (err) {
      t.loadError = err;
    }
  }

  // Only one MindLyte plays at a time: if the app is open twice (the installed
  // app and a browser tab, say), whichever one starts a journey or steps into
  // the headset tells the others to fall silent.
  _claimAudio(post = true) {
    try {
      if (!this._bc) {
        this._bcId = Math.random().toString(36).slice(2);
        this._bc = new BroadcastChannel('mindlyte-audio');
        this._bc.onmessage = (e) => {
          if (e.data?.type !== 'claim' || e.data.id === this._bcId) return;
          if (this.playing) this.stop(false, true);
          this.voice.cancel?.();
          this.active?.silence?.();
          if (this.engine.ctx && this.engine.master) this.engine.fadeMaster(0, 0.3);
        };
      }
      if (post) this._bc.postMessage({ type: 'claim', id: this._bcId });
    } catch (_) {}
  }

  async start(track) {
    this.voice.unlock();
    this._claimAudio();
    if (this.active?.muted) this.active.name = '';   // silenced by another copy: make it afresh
    const token = (this._startToken = {});   // a newer start replaces this one
    if (track.stream && !track.meta) await track.loading;
    if (track.stream && !track.meta) { this.ui.toast('Could not load that track. Check your connection.'); return; }
    // a light track: make sure the viewer sees the safety warning and lights come on
    const needsWarning = (track.strobe || track.mindflash) && !this.strobeAccepted;
    if (needsWarning) this.setLights(true);                       // shows the flashing-lights warning first
    else if (track.mindflash && !this.lights) this.lights = true;  // Clear mind is its lights
    await this.engine.init();
    this.engine.setVolume(this.volume);
    if (this.playing && this.player) {
      // switching journeys: let everything that's playing (music, tones, voice, the
      // scene's own instruments) fade right out first, then bring the new one in
      if (this.renderer.xr.isPresenting && !needsWarning) this.menu.show(false);
      this._stopGuide();
      this.voice.cancel?.();
      this.engine.fadeMaster(0, 1.6);
      this._sceneOut = true;   // the picture fades out with the sound
      await new Promise((r) => setTimeout(r, 1750));
      if (token !== this._startToken) return;
      this.player.stop(0.15);
    } else {
      if (token !== this._startToken) return;
      this._stopGuide();
      if (this.player) this.player.stop(2.5);
    }
    const guided = !!track.guided;
    const est = guided ? track.estimate + (track.tail || 30) : 0;
    const opts = {
      minutes: guided ? est / 60 : this.minutes,
      // light-encoded tracks carry their own entrainment programme: don't layer ours on top
      entrainment: track.strobe || track.musicOff || track.plain ? 'off' : this.entrainment,
      profile: this.journey === 'auto' ? track.profile : this.journey,
      solfeggio: track.strobe || track.musicOff || track.plain ? false : this.solfeggio,
      dives: this.dives !== 'off',
    };
    this.player = track.stream ? new StreamPlayer(this.engine, track, opts)
      : track.buffer ? new ImportedPlayer(this.engine, track, track.buffer, opts) : new Composer(this.engine, track, opts);
    this.engine.fadeMaster(1, 3);
    this.engine.setMusic(!track.musicOff);
    this.player.start();
    this.mine.resetSchedule();
    this.playing = true;
    this.playingTrack = track;
    this.caption = '';
    this.dimTarget = 0;
    this.whisperQueue = shuffle(WHISPERS.map((t, i) => ({ id: `whisper-${i + 1}`, text: t })));
    const w = Math.floor(Math.random() * WELCOMES.length);
    this.welcome = { id: `welcome-${w + 1}`, text: WELCOMES[w] };
    this.nextWhisper = this.engine.now + 22;
    if (guided) this._startGuide(track);
    this.xrIdle = false;
    this.setScene(this.sceneFor(track));
    this._sceneOut = false;
    if (!this.active?.hold) this.recentre(true);   // a journey always starts facing straight ahead, even in the same scene
    this.applyPalette(track.palette);
    // keep the menu up if it's showing the flashing-lights warning, so it can be answered
    if (this.renderer.xr.isPresenting && !(needsWarning && !this.strobeAccepted)) this.menu.show(false);
    this.menu.refresh();
    this.ui.onStart(track);
  }

  _startGuide(track) {
    const player = this.player;
    this.guide = new GuideRunner(this.voice, SCRIPTS[track.guided], {
      isSilent: () => !this.guideVoice,
      startDelay: 12,
      onLine: (text) => { this.caption = text; },
      onMark: (m) => this._cue(m, player),
      onDone: () => {
        // let the music breathe on after the last words, then close gently
        const tail = track.tail || 30;
        this._guideEndTimer = setTimeout(() => { if (this.player === player && this.playing) this.stop(true); }, tail * 1000);
      },
    });
    this.guide.start();
  }

  // Script cues weave the scene into the meditation.
  _cue(m, player) {
    const [a, b] = m.args;
    if (m.mark === 'dive' && this.dives !== 'off') player.dive(this.engine.now + 0.1, a || 12, b ?? 0.5);
    if (m.mark === 'scene' && this.background === 'auto') this.setScene(a);
    if (m.mark === 'cue') this.active?.onCue?.(a);
    if (m.mark === 'dim') { this.dimTarget = a; this.dimRate = 1 / Math.max(1, b || 30); }
  }

  _stopGuide() {
    clearTimeout(this._guideEndTimer);
    if (this.guide) { this.guide.stop(); this.guide = null; }
    this.voice.cancel();
    this.caption = '';
  }

  stop(completed = false, quick = false) {
    if (!this.playing) return;
    this.playing = false;
    const fade = quick ? 0.4 : completed ? this.playingTrack.fadeOut || 5 : 4;
    this._stopGuide();
    this.dimTarget = 0;
    this.player.stop(fade);
    this.engine.fadeMaster(0, fade);
    const p = this.player;
    setTimeout(() => { if (this.player === p) this.player = null; }, fade * 1000 + 500);
    if (this.renderer.xr.isPresenting) { this.menu.show(true); this._xrIdle(); }
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
    this._applyQuality();
    // start the audio alongside (without a tap it waits, and must not hold up entering)
    this.engine.init().catch(() => {});
    const session = await navigator.xr.requestSession(mode, {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking', 'bounded-floor'],
    });
    this.xrMode = mode;
    await this.renderer.xr.setSession(session);
  }

  exitXR() { this.renderer.xr.getSession()?.end(); }

  // a quiet backdrop while you're in the headset menu between sessions
  _xrIdle() {
    this.xrIdle = true;
    this.setScene(this.xrMode === 'immersive-ar' ? 'off' : 'nebula');
    this.menu.show(true);
  }

  _onXRStart() {
    this.menu.wristNoteShown = false;   // tell them where the menu lives, once each session
    const ar = this.xrMode === 'immersive-ar';
    // stepping into the headset ends whatever was playing on the screen;
    // nothing plays until you press Begin in there
    if (this.playing) this.stop(false, true);   // quickly: the screen's sound mustn't carry on in here
    this.voice.cancel?.();
    this._claimAudio();
    this.world.setPassthrough(ar);
    this.renderer.setClearColor(0x000000, ar ? 0 : 1);
    this.menu.group.visible = true;
    this.menu.show(!this.playing);
    this._xrIdle();
    this._placeMenuIn = 4;
    this.strobe.setXR(true);
    this.ui.setXR(true);
  }

  // Turn the world so that "straight ahead" is wherever you're looking now,
  // and centre it on where you're standing. Floor height is unchanged.
  // Centre the view: in the headset, straight ahead is wherever you're facing now;
  // on a screen, the view goes back to its starting angle. Quiet when a journey or
  // scene starts; with a whoosh and caption from the Center View button.
  recentre(quiet = false) {
    const xr = this.renderer.xr;
    if (!xr.isPresenting) {
      this.yaw = 0; this.pitch = this.active?.viewPitch ?? 0.05;
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      return;
    }
    const ref = xr.getReferenceSpace();
    if (!ref || !ref.getOffsetReferenceSpace) return;
    const cam = xr.getCamera();
    cam.updateMatrixWorld(true);
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fz = -e[10];                  // where you're looking, flattened
    const yaw = Math.atan2(-fx, -fz);
    const px = e[12], pz = e[14];
    const t = new XRRigidTransform({ x: px, y: 0, z: pz, w: 1 }, { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
    xr.setReferenceSpace(ref.getOffsetReferenceSpace(t));
    this._placeMenuIn = 2;
    this._replaceIn = 3;   // once the new head pose arrives, interactive scenes re-seat in front of you
    if (quiet) return;
    this.engine.sfx?.('whoosh', { pan: 0, dur: 1.2, gain: 0.5 });
    this.caption = 'View centred';
    clearTimeout(this._capT);
    this._capT = setTimeout(() => { if (this.caption === 'View centred') this.caption = ''; }, 2000);
  }

  _onXREnd() {
    this.xrIdle = false;
    this.setScene(this.sceneFor(this.playing ? this.playingTrack : this.selected));
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
      this._governor(dt);
      this.menu.update(dt);
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
      if (this.mineOn) this.mine.tick(this.engine.now, { every: this.mineEvery, busy: this.voice.speaking || remain < 20 });
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
        alpha = this.breathText ? (sec.index <= 1 ? 0.6 : sec.index === 4 ? 0.4 : 0.18) : 0;
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
      if (e.type === 'note' && this.world.mode === 'full') this.world.sparks.emit(e.pos, e.vel);
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

    this._updatePointers();
    for (const m of this.handModels || []) m.visible = !!this.active?.wantsHands;
    // after the view is centred, scenes you play re-seat themselves in front of you
    if (this._replaceIn > 0 && --this._replaceIn === 0 && this.active && 'placeNext' in this.active) this.active.placeNext = true;
    if (this.active) {
      const A = this.active;
      if (A.hold && !this.outgoing.some((o) => o.fade > 0.03)) {
        A.hold = false;
        for (const o of this.outgoing) o.dispose();
        this.outgoing = [];
        this.recentre(true);
      }
      if (A.hold) A.setFade(0);
      else if (this._sceneOut) A.setFade(Math.max(0, A.fade - dt / 1.5));
      else A.setFade(Math.min(1, A.fade + dt * (0.25 + A.fade * 0.6)));   // eases in from dark
      this.active.update(dt, t, s);
      INPUT.presses.length = 0;
    }
    this.outgoing = this.outgoing.filter((o) => {
      o.setFade(Math.max(0, o.fade - dt / 0.9));   // fades out steadily
      if (o.fade < 0.01) { o.dispose(); return false; }
      o.update(dt, t, s);
      return true;
    });

    this._updateLights(dt, t);
    this._updateDim(dt);
    this.world.update(dt, t, head.pos);
    this.renderer.render(this.scene, this.camera);
  }

  // Per-eye light colour from decoded AudioStrobe/SpectraStrobe, or (optionally)
  // pulsed at the brainwave beat rate on generated tracks.
  // Clear mind: four fields of light (inner and outer half of each eye) flickering
  // in turn, so the flash rotates round them, at a rate that sweeps smoothly between
  // 9 and 22 Hz through a repeating five-second cycle. The rotation reverses every
  // 30 seconds. Green to the left eye, blue to the right. Eases in over 20 seconds.
  _mindFlash(dt) {
    const el = this.player.elapsed(this.engine.heardTime);
    const CYCLE = 5.12;
    const u = (el % CYCLE) / CYCLE, TAU = Math.PI * 2;
    const shape = 0.55 * Math.sin(TAU * u) + 0.3 * Math.sin(TAU * 3 * u + 1.3) + 0.15 * Math.sin(TAU * 7 * u + 0.4);   // -1..1
    const hz = 15.5 + 6.5 * Math.max(-1, Math.min(1, shape));
    this.mfPhase = ((this.mfPhase || 0) + TAU * hz * dt) % (TAU * 1000);
    const dir = Math.floor(el / 30) % 2 ? -1 : 1;
    const ease = Math.min(1, el / 20);
    const q = [0, 1, 2, 3].map((k) => {
      const c = Math.cos(this.mfPhase - dir * k * Math.PI / 2);
      return Math.pow(Math.max(0, c), 3) * ease;     // a short, bright pulse, each field a quarter-cycle after the last
    });
    this.lightRates = [hz, hz];
    return q;
  }

  _updateLights(dt, t) {
    let target = null;
    const tr = this.playingTrack;
    if (tr?.mindflash) {
      const on = this.lights && this.strobeAccepted && this.playing && this.player;
      if (!this._mfCols) this._mfCols = [new THREE.Color(0.1, 1, 0.35), new THREE.Color(0.15, 0.45, 1)];
      this.strobe.updateFrames(on ? this._mindFlash(dt) : null, this._mfCols[0], this._mfCols[1], this.lightMax);
      this.strobe.update(dt, t, null, null, { dim: this.lightDim });
      if (!on) this.lightRates = null;
      return;
    }
    this.strobe.updateFrames?.(null);
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

  // A slow, head-locked dimming of the whole view (used as you fall asleep).
  _updateDim(dt) {
    if (!this.dimMesh) {
      this.dimMesh = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      this.dimMesh.position.z = -0.4;
      this.dimMesh.renderOrder = 935;
      this.camera.add(this.dimMesh);
      this.dimLevel = 0;
    }
    const target = this.dimTarget || 0;
    const rate = target > this.dimLevel ? (this.dimRate || 0.05) : 0.5;
    this.dimLevel += Math.sign(target - this.dimLevel) * Math.min(Math.abs(target - this.dimLevel), rate * dt);
    this.dimMesh.material.opacity = this.dimLevel;
    this.dimMesh.visible = this.dimLevel > 0.002;
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

  // Keeps the headset smooth: if frames start taking too long, quietly reduce
  // procedural detail (and then add a little foveation); restore it when there's headroom.
  _governor(dt) {
    const p = this.perf;
    p.avg += (dt - p.avg) * 0.05;
    p.t += dt;
    if (p.t < 2) return;
    const target = 1 / 72;
    if (p.avg > target * 1.12 && p.level < 3) { p.level++; p.t = 0; }
    else if (p.avg < target * 0.8 && p.level > 0) { p.level--; p.t = -3; }
    else return;
    U.uOct.value = [4, 3, 2, 2][p.level];
    const base = { smooth: 0.45, balanced: 0.25, sharp: 0.1 }[this.quality] ?? 0.25;
    this.renderer.xr.setFoveation(Math.min(1, base + (p.level >= 3 ? 0.25 : 0)));
  }

  // Collect pointing rays and fingertips for interactive scenes (INPUT).
  _updatePointers() {
    const list = [];
    const xr = this.renderer.xr;
    if (xr.isPresenting) {
      for (let i = 0; i < 2; i++) {
        const ctl = xr.getController(i);
        if (!ctl.userData.connected || ctl.userData.mode === 'gaze') continue;
        const o = new THREE.Vector3().setFromMatrixPosition(ctl.matrixWorld);
        const d = new THREE.Vector3(0, 0, -1).applyMatrix3(new THREE.Matrix3().setFromMatrix4(ctl.matrixWorld)).normalize();
        let tip = null;
        const hand = xr.getHand(i);
        const j = hand?.joints?.['index-finger-tip'];
        if (j && j.visible) tip = new THREE.Vector3().setFromMatrixPosition(j.matrixWorld);
        list.push({ origin: o, dir: d, tip, id: i });
      }
    } else if (this.mouse && !this.menuVisibleFlat()) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(this.mouse, this.camera);
      list.push({ origin: rc.ray.origin.clone(), dir: rc.ray.direction.clone(), tip: null, id: 'mouse' });
    }
    INPUT.pointers = list;
    INPUT.xr = xr.isPresenting;
    INPUT.head = this.getHead();
    // tracked hands: every joint's position, for scenes that show or use your hands
    const hands = [];
    if (xr.isPresenting) for (let i = 0; i < 2; i++) {
      const hand = xr.getHand(i);
      const js = hand?.joints;
      if (!js || !js['wrist'] || !js['wrist'].visible) continue;
      hands.push({ side: hand.userData?.handedness || (i ? 'right' : 'left'), joints: HAND_JOINTS.map((n) => (js[n] && js[n].visible ? new THREE.Vector3().setFromMatrixPosition(js[n].matrixWorld) : null)) });
    }
    INPUT.hands = hands;
    this._detectShake(list);
  }

  // Shaking both hands for about two seconds also centres the view.
  _detectShake(list) {
    const now = performance.now() / 1000;
    this._shake = this._shake || { h: {}, last: 0 };
    const S = this._shake;
    let ready = 0;
    for (const p of list) {
      if (p.id === 'mouse') continue;
      const pos = p.tip || p.origin;
      const h = (S.h[p.id] = S.h[p.id] || []);
      h.push([now, pos.x, pos.y, pos.z]);
      while (h.length && now - h[0][0] > 2.0) h.shift();
      if (h.length < 20 || now - h[0][0] < 1.8) continue;
      let len = 0, flips = 0, prev = null;
      for (let i = 1; i < h.length; i++) {
        const dx = h[i][1] - h[i - 1][1], dy = h[i][2] - h[i - 1][2], dz = h[i][3] - h[i - 1][3];
        len += Math.hypot(dx, dy, dz);
        // count changes of direction along the biggest movement
        const v = Math.abs(dx) > Math.abs(dy) ? dx : dy;
        if (Math.abs(v) > 0.004) { const sgn = Math.sign(v); if (prev !== null && sgn !== prev) flips++; prev = sgn; }
      }
      if (len > 1.4 && flips >= 6) ready++;
    }
    if (ready >= 2 && now - S.last > 3) {
      S.last = now;
      S.h = {};
      this.recentre();
    }
  }

  menuVisibleFlat() { const m = document.getElementById('menu'); return m && !m.classList.contains('hidden'); }

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
    const aim = (e) => { const r = el.getBoundingClientRect(); this.mouse = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    el.addEventListener('pointerdown', (e) => { aim(e); this._updatePointers(); down = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); if (this.active?.wantsPointer && !this.menuVisibleFlat()) { INPUT.presses.push('mouse'); INPUT.held.add('mouse'); } });
    el.addEventListener('pointermove', (e) => {
      aim(e);   // a tap on a touch screen aims where it lands, not where the last move was
      if (!down || e.shiftKey || this.active?.wantsPointer) return;   // interactive scenes keep the mouse for tracing
      this.yaw += (e.clientX - down.x) * 0.0045;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch + (e.clientY - down.y) * 0.0045));
      down = { x: e.clientX, y: e.clientY };
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    });
    const up = () => { down = null; INPUT.held.delete('mouse'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}

window.app = new App();

// splash: the logo glows for a few seconds while everything warms up. On a
// headset it then goes straight into immersive view; browsers only allow that
// from a tap, so if it's refused the splash waits and the first tap goes in.
{
  const splash = document.getElementById('splash');
  if (splash) {
    const hide = () => { splash.classList.add('gone'); setTimeout(() => splash.remove(), 1000); };
    const xrOK = navigator.xr ? navigator.xr.isSessionSupported('immersive-vr').catch(() => false) : Promise.resolve(false);
    let tapped = false;
    const enter = async () => {
      try { await window.app.enterXR('immersive-vr'); hide(); return true; } catch { return false; }
    };
    splash.addEventListener('click', async () => {
      if (tapped) return; tapped = true;
      if (await xrOK) { if (!(await enter())) hide(); } else hide();
    });
    setTimeout(async () => {
      if (tapped) return;
      if (!(await xrOK)) { hide(); return; }
      if (await enter()) return;
      // the browser wants a tap first: invite it
      splash.classList.add('tap');
      const tag = splash.querySelector('.splash-tag');
      if (tag) tag.textContent = 'Tap anywhere to begin';
      const flat = document.createElement('button');
      flat.className = 'splash-flat';
      flat.textContent = 'or enter non-immersive';
      flat.addEventListener('click', (e) => { e.stopPropagation(); tapped = true; hide(); });
      splash.appendChild(flat);
    }, Math.max(600, 3400 - performance.now()));   // about 3.4 s from opening the app
  }
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}
