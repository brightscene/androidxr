// Your own affirmations: record short clips in your own voice. They're kept
// only on this device (IndexedDB) and, if you choose, mixed gently into your
// sessions now and then, alternating between your left and right ear.
const DB = 'mindlyte-mine';
const MAX_SECONDS = 20;

function idb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('clips', { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => { const t = db.transaction('clips', mode); const out = fn(t.objectStore('clips')); t.oncomplete = () => res(out?.result ?? out); t.onerror = () => rej(t.error); });
}

export class MyAffirmations {
  constructor(engine) {
    this.e = engine;
    this.clips = [];       // { id, name, blob, created, dur }
    this.buffers = new Map();
    this.ready = this.load();
    this.next = 0;
    this.side = 1;
    this.i = 0;
  }

  async load() {
    try { this.clips = (await tx('readonly', (s) => s.getAll())) || []; } catch (_) { this.clips = []; }
    this.clips.sort((a, b) => a.created - b.created);
    return this.clips;
  }

  get supported() { return !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder); }

  // start recording; resolves when stopped (by stop() or after MAX_SECONDS)
  async record(onTick) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', ''].find((t) => !t || MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    const parts = [];
    rec.ondataavailable = (e) => e.data.size && parts.push(e.data);
    const t0 = performance.now();
    this._rec = rec;
    const tick = setInterval(() => { const s = (performance.now() - t0) / 1000; onTick?.(s); if (s >= MAX_SECONDS) this.stop(); }, 200);
    const done = new Promise((res) => (rec.onstop = res));
    rec.start();
    await done;
    clearInterval(tick);
    stream.getTracks().forEach((t) => t.stop());
    this._rec = null;
    const blob = new Blob(parts, { type: rec.mimeType || 'audio/webm' });
    const dur = (performance.now() - t0) / 1000;
    if (dur < 0.6 || !blob.size) return null;
    const clip = { id: `mine-${Date.now()}`, name: `Affirmation ${this.clips.length + 1}`, blob, created: Date.now(), dur };
    await tx('readwrite', (s) => s.put(clip));
    this.clips.push(clip);
    return clip;
  }

  stop() { if (this._rec && this._rec.state !== 'inactive') this._rec.stop(); }
  get recording() { return !!this._rec; }

  async remove(id) {
    await tx('readwrite', (s) => s.delete(id));
    this.clips = this.clips.filter((c) => c.id !== id);
    this.buffers.delete(id);
  }

  async _buffer(clip) {
    if (!this.buffers.has(clip.id)) this.buffers.set(clip.id, await this.e.ctx.decodeAudioData(await clip.blob.arrayBuffer()));
    return this.buffers.get(clip.id);
  }

  // play one clip, softly placed to one side with a little room around it
  async play(clip, pan = 0, { duck = true } = {}) {
    if (!this.e.ctx) await this.e.init();
    const buf = await this._buffer(clip);
    const ctx = this.e.ctx, src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain(); g.gain.value = 1.0;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const send = ctx.createGain(); send.gain.value = 0.18;
    src.connect(g).connect(p).connect(this.e.voiceBus);
    g.connect(send).connect(this.e.reverbSend);
    if (duck) this.e.duck(true);
    src.onended = () => { g.disconnect(); p.disconnect(); if (duck) this.e.duck(false); };
    src.start();
    return buf.duration;
  }

  // called every frame during a session: now and then, play the next clip
  tick(now, { every = 90, busy = false } = {}) {
    if (!this.clips.length || busy || this._playing) return;
    if (!this.next) { this.next = now + 25; return; }
    if (now < this.next) return;
    const clip = this.clips[this.i++ % this.clips.length];
    this.side = -this.side;
    this._playing = true;
    this.play(clip, this.side * 0.6).then((d) => setTimeout(() => (this._playing = false), d * 1000 + 200)).catch(() => (this._playing = false));
    this.next = now + every * (0.75 + Math.random() * 0.5);
  }

  resetSchedule() { this.next = 0; }
}
