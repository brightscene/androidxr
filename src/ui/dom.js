import { SYMBOLS } from '../visuals/strobe.js';
import { SCENES, BACKGROUNDS } from '../visuals/scenes/index.js';
import SCENE_PALETTES from './scenePalettes.json';
import { PRICES } from '../journeys.js';

const GROUPS = ['Simple', 'Space', 'Dimensions', 'Mind', 'Nature', 'Sky & water', 'Light journeys'];
const groupOf = (v) => (v === 'auto' ? 'Simple' : SCENES[v]?.group || 'Simple');
import { saveUserImages, clearUserImages, refreshImageAtlas } from '../visuals/scenes/imagecycle.js';

// Flat-screen UI: the launcher you see in a browser panel on Android XR
// (and on phones/desktops), plus the in-session bar.

// The iOS app (ios/) loads this page with ?source=ios-app and listens on
// window.webkit.messageHandlers.mindlyte; it controls playback through window.mindlyteNative.
const IOS_APP = (() => {
  try {
    if (new URLSearchParams(location.search).get('source') === 'ios-app') sessionStorage.setItem('mindlyte-ios', '1');
    return sessionStorage.getItem('mindlyte-ios') === '1' && !!window.webkit?.messageHandlers?.mindlyte;
  } catch { return false; }
})();
const toNative = (msg) => { if (IOS_APP) try { window.webkit.messageHandlers.mindlyte.postMessage(msg); } catch {} };

export class DomUI {
  constructor(app) {
    this.app = app;
    this.$ = (s) => document.querySelector(s);
    this.menu = this.$('#menu');
    this.session = this.$('#session');
    this.tab = 'Journeys';
    if (IOS_APP) this._nativeApp();
    this._buildTabs();
    this._buildCards();
    this._buildScenes();
    this.refreshVoices();
    this._wire();
    this._checkXR();
    this.$('#version').textContent = `MindLyte v${__BUILD__}`;
    this.refresh();
  }

  // inside the iOS app: an "App settings" button, and lock-screen controls
  _nativeApp() {
    const app = this.app;
    document.body.classList.add('ios-app');
    const b = document.createElement('button');
    b.className = 'ghost small'; b.id = 'app-settings'; b.textContent = 'App settings';
    b.addEventListener('click', () => toNative({ type: 'settings' }));
    this.$('header').append(b);
    window.mindlyteNative = {
      pause: () => app.engine.ctx?.suspend(),
      play: () => app.engine.ctx?.resume(),
      end: () => app.stop(),
    };
  }

  // tabs, the same as in the headset
  _buildTabs() {
    this.$('.tabs').addEventListener('click', (e) => { const t = e.target.dataset.tab; if (t) this.setTab(t); });
    this.setTab(this.tab);
  }

  setTab(name) {
    this.tab = name;
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
    for (const p of document.querySelectorAll('.pane')) p.classList.toggle('on', p.dataset.pane === name);
  }

  // a journey card: moving preview on the left, then title, what it's about and its kind
  _card(tr) {
    const app = this.app;
    const b = document.createElement('button');
    b.className = 'jcard';
    b.style.setProperty('--a', tr.palette[0]);
    b.style.setProperty('--b', tr.palette[1]);
    b.style.setProperty('--c', tr.palette[2]);
    const kind = tr.buffer ? 'Your track' : tr.free ? 'Free' : tr.plain ? 'Music' : tr.stream || tr.strobe ? 'Light & sound' : tr.guided ? `Guided · ~${Math.round(tr.estimate / 60)} min` : `Soundscape · ${tr.freq} Hz`;
    b.innerHTML = `<span class="pv" data-scene="${escapeHtml(tr.scene)}"></span><span class="tx"><span class="t">${escapeHtml(tr.title)}</span><span class="i">${escapeHtml(tr.intent)}</span><span class="k"></span></span>`;
    b._kind = kind;
    b.addEventListener('click', () => app.select(tr));
    b._track = tr;
    return b;
  }

  _buildCards() {
    const app = this.app, root = this.$('#journeys');
    root.innerHTML = '';
    const section = (title, list, extra) => {
      const h = document.createElement('div');
      h.className = 'jhead';
      h.innerHTML = `<h2>${title}</h2>`;
      if (extra) extra(h);
      const g = document.createElement('div');
      g.className = 'jgrid';
      for (const tr of list) g.appendChild(this._card(tr));
      root.append(h, g);
    };
    section('Free', app.journeys.free);
    section('Premium', app.journeys.premium, (h) => {
      const pr = document.createElement('span'); pr.className = 'price'; h.append(pr); this._price = pr;
      const u = document.createElement('button'); u.className = 'ghost small'; u.textContent = 'Unlock Premium';
      u.addEventListener('click', () => this.showUnlock()); h.append(u); this._unlockBtn = u;
    });
    if (app.imported) { app.imported.free = true; section('Your track', [app.imported]); }
    // previews load as they scroll into view
    const io = new IntersectionObserver((es) => {
      for (const e of es) if (e.isIntersecting) { e.target.style.backgroundImage = `url(previews/${e.target.dataset.scene}.jpg)`; io.unobserve(e.target); }
    }, { root: this.menu, rootMargin: '200px' });
    for (const pv of root.querySelectorAll('.pv')) io.observe(pv);
  }

  // scenes: category chips, then colour cards
  _buildScenes() {
    const app = this.app;
    this.sceneGroup = groupOf(app.background);
    const chips = this.$('#scene-chips');
    chips.innerHTML = GROUPS.map((g) => `<button data-g="${escapeHtml(g)}">${escapeHtml(g)}</button>`).join('');
    chips.addEventListener('click', (e) => { const g = e.target.dataset.g; if (g) { this.sceneGroup = g; this._layoutScenes(); } });
    const cards = this.$('#scene-cards');
    this.sceneCards = BACKGROUNDS.map(([v, label]) => {
      const pal = SCENE_PALETTES[v === 'auto' ? 'galaxy' : v] || ['#0a0a1a', '#3a3a7a', '#c0c8ff'];
      const b = document.createElement('button');
      b.className = 'scard';
      b.style.setProperty('--a', pal[0]); b.style.setProperty('--b', pal[1]); b.style.setProperty('--c', pal[2]);
      b.innerHTML = `<span class="t">${escapeHtml(v === 'auto' ? 'Auto' : label)}</span><span class="g">${v === 'auto' ? "each journey's own world" : escapeHtml(SCENES[v]?.group || '')}</span>`;
      b.addEventListener('click', () => app.setBackground(v));
      b._v = v; b._g = groupOf(v);
      cards.append(b);
      return b;
    });
    this._layoutScenes();
  }

  _layoutScenes() {
    for (const b of this.$('#scene-chips').children) b.classList.toggle('on', b.dataset.g === this.sceneGroup);
    for (const c of this.sceneCards) { c.style.display = c._g === this.sceneGroup ? '' : 'none'; c.classList.toggle('sel', c._v === this.app.background); }
    const v = this.app.background, tr = this.app.playing ? this.app.playingTrack : this.app.selected;
    this.$('#scene-note').textContent = v === 'auto' ? `Auto: each journey uses its own scene (${tr.scene} for ${tr.title}).` : v === 'off' ? 'Off: pure black. Only the lights are shown.' : 'This scene is used for every journey until you switch back to Auto.';
  }

  showUnlock() {
    this.$('#ul-msg').textContent = 'Cancel any time.';
    this.$('#unlock').classList.remove('hidden');
  }

  refreshVoices() {
    const sel = this.$('#voice');
    if (!sel) return;
    const v = this.app.voice;
    const opts = [['auto', v.hasRecorded ? `Recorded: ${v.recordedName}` : 'Auto (Irish voice if available)']];
    for (const x of v.englishVoices()) opts.push([x.voiceURI, `${x.name} (${x.lang})`]);
    sel.innerHTML = opts.map(([val, label]) => `<option value="${escapeHtml(val)}">${escapeHtml(label)}</option>`).join('');
    sel.value = opts.some(([val]) => val === this.app.voiceChoice) ? this.app.voiceChoice : 'auto';
    const irish = v.englishVoices().some((x) => /en[-_]IE/i.test(x.lang));
    this.$('#voice-note').textContent = v.hasRecorded
      ? 'Using recorded voice clips.'
      : irish
        ? `Using ${v.description}.`
        : `No Irish voice on this device yet, so using ${v.description}. You can add one in your device's text-to-speech settings, or record a real Irish voice (see README).`;
  }

  _wire() {
    const app = this.app;
    const on = (id, ev, fn) => this.$(id).addEventListener(ev, fn);
    on('#durations', 'click', (e) => { const m = Number(e.target.dataset.min); if (m) app.setMinutes(m); });
    on('#tone', 'change', (e) => app.setSolfeggio(e.target.checked));
    on('#entrainment', 'change', (e) => app.setEntrainment(e.target.value));
    on('#journey', 'change', (e) => app.setJourney(e.target.value));
    on('#nature', 'change', (e) => { app.engine.init().then(() => app.setNature(e.target.value)); });
    on('#dives', 'change', (e) => app.setDives(e.target.value));
    for (const b of document.querySelectorAll('#unlock .buy')) b.addEventListener('click', () => { this.$('#ul-msg').textContent = 'Payments are coming soon. Thank you for your interest!'; });
    on('#ul-close', 'click', () => this.$('#unlock').classList.add('hidden'));
    on('#voice', 'change', (e) => { app.setVoice(e.target.value); this.refreshVoices(); });
    on('#whispers', 'change', (e) => app.setWhispers(e.target.checked));
    on('#captions', 'change', (e) => app.setCaptions(e.target.checked));
    on('#breath-text', 'change', (e) => app.setBreathText(e.target.checked));
    on('#guide-voice', 'change', (e) => app.setGuideVoice(e.target.checked));
    // your own affirmations
    on('#mine-on', 'change', (e) => app.setMine(e.target.checked));
    on('#mine-every', 'change', (e) => app.setMineEvery(Number(e.target.value)));
    const mine = app.mine, st = (t) => (this.$('#mine-status').textContent = t);
    const drawMine = this.drawMine = () => {
      const ul = this.$('#mine-list');
      ul.innerHTML = '';
      if (!mine.clips.length) st(mine.supported ? 'No recordings yet.' : 'Recording isn\'t supported in this browser.');
      mine.clips.forEach((c, i) => {
        const li = document.createElement('li');
        const name = document.createElement('span'); name.textContent = `${i + 1}. Your affirmation · ${c.dur.toFixed(1)} s`;
        const play = document.createElement('button'); play.className = 'ghost small'; play.textContent = '▶ Play';
        play.addEventListener('click', () => mine.play(c, 0, { duck: false }));
        const del = document.createElement('button'); del.className = 'ghost small'; del.textContent = 'Delete';
        del.addEventListener('click', async () => { await mine.remove(c.id); drawMine(); });
        li.append(name, play, del); ul.append(li);
      });
    };
    mine.ready.then(drawMine);
    on('#mine-rec', 'click', async (e) => {
      const btn = e.currentTarget;
      if (mine.recording) { mine.stop(); return; }
      try {
        btn.classList.add('recording'); btn.textContent = '■ Stop';
        const clip = await mine.record((s) => st(`Recording… ${s.toFixed(0)} s (stops at 20 s)`));
        st(clip ? 'Saved. Record another, or press Play to listen.' : 'That was too short. Try again.');
      } catch (_) {
        st('Couldn\'t use the microphone. Check that this site is allowed to use it.');
      }
      btn.classList.remove('recording'); btn.textContent = '● Record';
      drawMine();
    });
    on('#quality', 'change', (e) => app.setQuality(e.target.value));
    on('#preview-voice', 'click', () => app.previewVoice());
    this.$('#light-symbol').innerHTML = ['<option value="-1">Cycle through all</option>', ...SYMBOLS.map((n, i) => `<option value="${i}">${n}</option>`)].join('');
    on('#lights', 'change', (e) => { app.setLights(e.target.checked); this.refresh(); });
    on('#light-style', 'change', (e) => app.setLightOpt('lightStyle', e.target.value));
    on('#light-symbol', 'change', (e) => app.setLightOpt('lightSymbol', Number(e.target.value)));
    on('#light-colour', 'change', (e) => app.setLightOpt('lightColour', e.target.value));
    on('#light-mode', 'change', (e) => app.setLightOpt('lightMode', e.target.value));
    on('#light-layout', 'change', (e) => app.setLightOpt('lightLayout', e.target.value));
    on('#light-dim', 'change', (e) => app.setLightOpt('lightDim', Number(e.target.value)));
    on('#light-max', 'input', (e) => app.setLightOpt('lightMax', Number(e.target.value)));
    on('#lights-generated', 'change', (e) => app.setLightOpt('lightsGenerated', e.target.checked));
    const cycStatus = (n) => { this.$('#cycle-status').textContent = n ? `Using your ${n} image${n > 1 ? 's' : ''}` : 'Using the built-in photos'; };
    refreshImageAtlas().then(cycStatus);
    on('#cycle-files', 'change', async (e) => {
      const files = [...e.target.files].slice(0, 16);
      if (!files.length) return;
      this.$('#cycle-status').textContent = 'Saving…';
      await saveUserImages(files);
      cycStatus(await refreshImageAtlas());
    });
    fetch('photos/photos.json').then((r) => r.json()).then((m) => {
      const ul = this.$('#photo-credits');
      for (const set of m.sets) for (const it of set.items.filter((x) => x.f)) {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = it.src; a.target = '_blank'; a.rel = 'noopener'; a.textContent = it.cap;
        li.append(a, ` by ${it.by}, ${it.lic}, via Wikimedia Commons (cropped)`);
        ul.append(li);
      }
    }).catch(() => {});
    on('#cycle-clear', 'click', async () => { await clearUserImages(); cycStatus(await refreshImageAtlas()); });
    on('#sw-accept', 'click', () => app.acceptStrobe());
    on('#sw-cancel', 'click', () => app.declineStrobe());
    on('#volume', 'input', (e) => app.setVolume(Number(e.target.value)));
    on('#begin', 'click', () => app.beginOrResume());
    // long-press the logo to switch Premium on or off (testing, until payments are connected)
    {
      const brand = this.$('.brand');
      let timer = 0;
      const cancel = () => clearTimeout(timer);
      brand.addEventListener('pointerdown', () => { cancel(); timer = setTimeout(() => { app.togglePremium(); this.$('#unlock').classList.add('hidden'); }, 800); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) brand.addEventListener(ev, cancel);
      brand.addEventListener('contextmenu', (e) => e.preventDefault());
      brand.style.userSelect = 'none'; brand.style.webkitUserSelect = 'none'; brand.style.touchAction = 'manipulation';
    }
    on('#enter-vr', 'click', () => this._enter('immersive-vr'));
    on('#enter-ar', 'click', () => this._enter('immersive-ar'));
    on('#end', 'click', () => app.stop());
    on('#show-menu', 'click', () => this.menu.classList.remove('hidden'));
    on('#close-menu', 'click', () => this.menu.classList.add('hidden'));
    on('#file', 'change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      this.$('#import-status').textContent = 'Reading audio…';
      try {
        await app.importFile(f, this.$('#import-scene').value);
        this._buildCards();
        this.refresh();
        const st = app.imported.strobe;
        this.$('#import-status').textContent = st
          ? `Ready: ${st.format === 'spectrastrobe' ? 'SpectraStrobe' : 'AudioStrobe'} lights decoded. Added to Soundscapes.`
          : 'Ready: added to Soundscapes (no light encoding found)';
      } catch (err) {
        this.$('#import-status').textContent = 'Could not decode that file';
      }
    });
    this.app.voice.ready.then(() => this.refreshVoices());
  }

  async _enter(mode) {
    try {
      await this.app.enterXR(mode);
    } catch (err) {
      this.toast(`Could not start ${mode === 'immersive-ar' ? 'passthrough' : 'immersive'} mode: ${err.message}`);
    }
  }

  async _checkXR() {
    const vr = this.$('#enter-vr'), ar = this.$('#enter-ar');
    const ok = async (m) => { try { return !!(navigator.xr && (await navigator.xr.isSessionSupported(m))); } catch { return false; } };
    const [v, a] = await Promise.all([ok('immersive-vr'), ok('immersive-ar')]);
    vr.disabled = !v;
    ar.disabled = !a;
    if (!v && !a) this.$('#xr-note').textContent = 'Open this page in Chrome on an Android XR headset to go immersive. Here you can preview with headphones; drag to look around.';
  }

  refresh() {
    const app = this.app;
    for (const c of document.querySelectorAll('.jcard')) {
      const tr = c._track, locked = !tr.free && !app.premium;
      c.classList.toggle('sel', tr === app.selected);
      const k = c.querySelector('.k');
      k.className = 'k' + (tr.free ? ' free' : locked ? ' lock' : '');
      k.textContent = locked ? `🔒 ${c._kind}` : c._kind;
    }
    if (this._price) { this._price.textContent = app.premium ? 'Unlocked · thank you' : `${PRICES.month}  ·  ${PRICES.year}`; this._unlockBtn.hidden = app.premium; }
    if (this.sceneCards) this._layoutScenes();
    for (const b of this.$('#durations').children) b.classList.toggle('on', Number(b.dataset.min) === app.minutes);
    this.$('#length-group').classList.toggle('disabled', !!app.selected.guided);
    this.$('#tone').checked = app.solfeggio;
    this.$('#entrainment').value = app.entrainment;
    this.$('#journey').value = app.journey;
    this.$('#nature').value = app.nature;
    this.$('#dives').value = app.dives;
    this.$('#whispers').checked = app.whispers;
    this.$('#captions').checked = app.captions;
    this.$('#breath-text').checked = app.breathText;
    this.$('#guide-voice').checked = app.guideVoice;
    this.$('#mine-on').checked = app.mineOn;
    this.$('#mine-every').value = String(app.mineEvery);
    this.$('#quality').value = app.quality;
    this.$('#volume').value = app.volume;
    this.$('#lights').checked = app.lights;
    this.$('#light-style').value = app.lightStyle;
    this.$('#light-symbol').value = String(app.lightSymbol);
    this.$('#light-colour').value = app.lightColour;
    this.$('#light-mode').value = app.lightMode;
    this.$('#light-layout').value = app.lightLayout;
    this.$('#light-dim').value = String(app.lightDim);
    this.$('#light-max').value = app.lightMax;
    this.$('#lights-generated').checked = app.lightsGenerated;
    const tr = app.selected;
    this.$('#sel-title').textContent = tr.title;
    this.$('#sel-meta').textContent = tr.stream
      ? `${tr.intent} · lights flash in each eye at the encoded rate · ${tr.scene} scene`
      : tr.guided
      ? `Guided with voice · ${tr.intent} · ${tr.freq} Hz · ${tr.profile} brainwave journey`
      : tr.buffer
        ? `Your track · ${tr.intent} · ${tr.scene} scene`
        : `${tr.freq} Hz · ${tr.intent} · ${tr.scene} scene`;
    this.$('#begin').textContent = !tr.free && !app.premium ? 'Unlock to begin' : app.playing ? (app.playingTrack === tr ? 'Resume' : 'Switch to this') : 'Begin here';
  }

  // the session bar fades out after 5 s without any movement, and comes back when you move or tap
  _wake() {
    this.session.classList.remove('idle');
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => this.session.classList.add('idle'), 5000);
  }

  onStart(track) {
    toNative({ type: 'session', state: 'start', title: track.title });
    this.menu.classList.add('hidden');
    this.session.classList.remove('hidden');
    document.body.classList.add('playing');
    if (!this._wakeBound) {
      this._wakeBound = true;
      for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => { if (!this.session.classList.contains('hidden')) this._wake(); }, { passive: true });
    }
    this._wake();
    this.$('#session-title').textContent = track.plain ? track.title : track.strobe ? `${track.title} · ${track.strobe.format === 'spectrastrobe' ? 'SpectraStrobe' : 'AudioStrobe'}` : track.buffer ? track.title : `${track.title} · ${track.freq} Hz`;
    this.refresh();
  }

  onStop(completed) {
    toNative({ type: 'session', state: 'end', completed: !!completed });
    this.session.classList.add('hidden');
    this.menu.classList.remove('hidden');
    document.body.classList.remove('playing');
    if (completed) this.toast('Session complete. Take a moment before you move.');
    this.refresh();
  }

  setCue(text, sub, progress, alpha) {
    const cue = this.$('#cue');
    if (cue.textContent !== text) cue.textContent = text;
    cue.style.opacity = alpha;
    this.$('#cue-sub').textContent = sub;
    this.$('#progress').style.width = `${(progress * 100).toFixed(2)}%`;
  }

  importStatus(text) { this.$('#import-status').textContent = text; }
  showStrobeWarning() { this.$('#strobe-warning').classList.remove('hidden'); }
  hideStrobeWarning() { this.$('#strobe-warning').classList.add('hidden'); this.refresh(); }

  setXR(on) { document.body.classList.toggle('in-xr', on); }

  toast(msg) {
    const t = this.$('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._tt);
    this._tt = setTimeout(() => t.classList.remove('show'), 5000);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
