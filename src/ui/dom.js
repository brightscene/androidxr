import { SYMBOLS } from '../visuals/strobe.js';
import { SCENES } from '../visuals/scenes/index.js';
import { saveUserImages, clearUserImages, refreshImageAtlas } from '../visuals/scenes/imagecycle.js';

// Flat-screen UI: the launcher you see in a browser panel on Android XR
// (and on phones/desktops), plus the in-session bar.

export class DomUI {
  constructor(app) {
    this.app = app;
    this.$ = (s) => document.querySelector(s);
    this.menu = this.$('#menu');
    this.session = this.$('#session');
    this._buildCards();
    this.refreshVoices();
    this._wire();
    this._checkXR();
    this.$('#version').textContent = `MindLyte v${__BUILD__}`;
    this.refresh();
  }

  _card(tr) {
    const b = document.createElement('button');
    b.className = 'card';
    b.style.setProperty('--a', tr.palette[0]);
    b.style.setProperty('--b', tr.palette[1]);
    b.style.setProperty('--c', tr.palette[2]);
    const f = tr.stream || tr.strobe ? ((tr.strobe?.format || tr.format) === 'spectrastrobe' ? 'SpectraStrobe' : 'AudioStrobe') : tr.guided ? `~${Math.round((tr.estimate + (tr.guided === 'sleep' ? 0 : tr.tail || 0)) / 60)} min` : tr.buffer ? 'Your track' : `${tr.freq} Hz`;
    b.innerHTML = `<span class="t">${escapeHtml(tr.title)}</span><span class="f">${f}</span><span class="i">${escapeHtml(tr.intent)}${tr.guided ? ` · ${tr.freq} Hz` : ''}</span>`;
    b.addEventListener('click', () => this.app.select(tr));
    b._track = tr;
    return b;
  }

  _buildCards() {
    const g = this.$('#guided'), s = this.$('#tracks'), l = this.$('#light-tracks');
    g.innerHTML = ''; s.innerHTML = ''; l.innerHTML = '';
    for (const tr of this.app.lightTracks) l.appendChild(this._card(tr));
    for (const tr of this.app.guided) g.appendChild(this._card(tr));
    for (const tr of this.app.tracks) s.appendChild(this._card(tr));
    if (this.app.imported) s.appendChild(this._card(this.app.imported));
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
    {
      const groups = {};
      for (const [k, v] of Object.entries(SCENES)) (groups[v.group] ||= []).push(`<option value="${k}">${v.label}</option>`);
      this.$('#background').innerHTML = '<option value="auto">Auto (per track)</option>' + Object.entries(groups).map(([g, o]) => `<optgroup label="${g}">${o.join('')}</optgroup>`).join('');
    }
    on('#background', 'change', (e) => app.setBackground(e.target.value));
    on('#voice', 'change', (e) => { app.setVoice(e.target.value); this.refreshVoices(); });
    on('#whispers', 'change', (e) => app.setWhispers(e.target.checked));
    on('#captions', 'change', (e) => app.setCaptions(e.target.checked));
    on('#breath-text', 'change', (e) => app.setBreathText(e.target.checked));
    on('#guide-voice', 'change', (e) => app.setGuideVoice(e.target.checked));
    // your own affirmations
    on('#mine-on', 'change', (e) => app.setMine(e.target.checked));
    on('#mine-every', 'change', (e) => app.setMineEvery(Number(e.target.value)));
    const mine = app.mine, st = (t) => (this.$('#mine-status').textContent = t);
    const drawMine = () => {
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
    for (const c of document.querySelectorAll('.card')) c.classList.toggle('sel', c._track === app.selected);
    for (const b of this.$('#durations').children) b.classList.toggle('on', Number(b.dataset.min) === app.minutes);
    this.$('#length-group').classList.toggle('disabled', !!app.selected.guided);
    this.$('#tone').checked = app.solfeggio;
    this.$('#entrainment').value = app.entrainment;
    this.$('#journey').value = app.journey;
    this.$('#nature').value = app.nature;
    this.$('#dives').value = app.dives;
    this.$('#background').value = app.background;
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
    this.$('#begin').textContent = app.playing ? (app.playingTrack === tr ? 'Resume' : 'Switch to this') : 'Begin here';
  }

  // the session bar fades out after 5 s without any movement, and comes back when you move or tap
  _wake() {
    this.session.classList.remove('idle');
    clearTimeout(this._idleT);
    this._idleT = setTimeout(() => this.session.classList.add('idle'), 5000);
  }

  onStart(track) {
    this.menu.classList.add('hidden');
    this.session.classList.remove('hidden');
    document.body.classList.add('playing');
    if (!this._wakeBound) {
      this._wakeBound = true;
      for (const ev of ['pointermove', 'pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => { if (!this.session.classList.contains('hidden')) this._wake(); }, { passive: true });
    }
    this._wake();
    this.$('#session-title').textContent = track.strobe ? `${track.title} · ${track.strobe.format === 'spectrastrobe' ? 'SpectraStrobe' : 'AudioStrobe'}` : track.buffer ? track.title : `${track.title} · ${track.freq} Hz`;
    this.refresh();
  }

  onStop(completed) {
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
