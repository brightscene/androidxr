// Flat-screen UI: the launcher you see in a browser panel on Android XR
// (and on phones/desktops), plus the in-session bar.

export class DomUI {
  constructor(app) {
    this.app = app;
    this.$ = (s) => document.querySelector(s);
    this.menu = this.$('#menu');
    this.session = this.$('#session');
    this.grid = this.$('#tracks');
    this._buildCards();
    this._wire();
    this._checkXR();
    this.refresh();
  }

  _buildCards() {
    this.grid.innerHTML = '';
    const list = [...this.app.tracks];
    if (this.app.imported) list.push(this.app.imported);
    for (const tr of list) {
      const b = document.createElement('button');
      b.className = 'card';
      b.style.setProperty('--a', tr.palette[0]);
      b.style.setProperty('--b', tr.palette[1]);
      b.style.setProperty('--c', tr.palette[2]);
      b.innerHTML = `<span class="t">${escapeHtml(tr.title)}</span><span class="f">${tr.buffer ? 'Your track' : tr.freq + ' Hz'}</span><span class="i">${escapeHtml(tr.intent)}</span>`;
      b.addEventListener('click', () => this.app.select(tr));
      b._track = tr;
      this.grid.appendChild(b);
    }
  }

  _wire() {
    const app = this.app;
    this.$('#durations').addEventListener('click', (e) => {
      const m = Number(e.target.dataset.min);
      if (m) app.setMinutes(m);
    });
    this.$('#binaural').addEventListener('change', (e) => app.setBinaural(e.target.checked));
    this.$('#tone').addEventListener('change', (e) => app.setSolfeggio(e.target.checked));
    this.$('#volume').addEventListener('input', (e) => app.setVolume(Number(e.target.value)));
    this.$('#begin').addEventListener('click', () => app.beginOrResume());
    this.$('#enter-vr').addEventListener('click', () => this._enter('immersive-vr'));
    this.$('#enter-ar').addEventListener('click', () => this._enter('immersive-ar'));
    this.$('#end').addEventListener('click', () => app.stop());
    this.$('#show-menu').addEventListener('click', () => this.menu.classList.remove('hidden'));
    this.$('#close-menu').addEventListener('click', () => this.menu.classList.add('hidden'));
    this.$('#file').addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      this.$('#import-status').textContent = 'Analysing…';
      try {
        await app.importFile(f, this.$('#import-scene').value);
        this._buildCards();
        this.refresh();
        this.$('#import-status').textContent = 'Ready: selected below the library';
      } catch (err) {
        this.$('#import-status').textContent = 'Could not decode that file';
      }
    });
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
    for (const c of this.grid.children) c.classList.toggle('sel', c._track === app.selected);
    for (const b of this.$('#durations').children) b.classList.toggle('on', Number(b.dataset.min) === app.minutes);
    this.$('#binaural').checked = app.binaural;
    this.$('#tone').checked = app.solfeggio;
    const tr = app.selected;
    this.$('#sel-title').textContent = tr.title;
    this.$('#sel-meta').textContent = `${tr.buffer ? 'Your track with a ' : ''}${tr.freq} Hz${tr.buffer ? ' tone' : ''} · ${tr.intent} · scene: ${tr.scene}`;
    this.$('#begin').textContent = app.playing ? (app.playingTrack === tr ? 'Resume' : 'Switch to this track') : 'Begin here';
  }

  onStart(track) {
    this.menu.classList.add('hidden');
    this.session.classList.remove('hidden');
    document.body.classList.add('playing');
    this.$('#session-title').textContent = `${track.title} · ${track.freq} Hz`;
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

  setXR(on) {
    document.body.classList.toggle('in-xr', on);
  }

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
