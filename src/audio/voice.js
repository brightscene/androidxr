// The voice guide.
//
// Two sources, chosen per line:
//  1. Recorded clips in voice/<id>.mp3 (listed in voice/manifest.json), made
//     with tools/generate-voice.mjs using an Irish voice of your choice.
//     These play through Web Audio, placed softly in front of you.
//  2. Otherwise the device's own text-to-speech, preferring an Irish English
//     voice (en-IE), then other British-Isles female voices.
//
// While the voice speaks, the music is gently ducked.

const PREFER = [
  [/en[-_]IE/i, 100],
  [/ireland|irish|moira|aoife|niamh|siobh|orla|ciara|saoirse/i, 90],
  [/en[-_]GB/i, 30],
  [/female|woman|libby|sonia|maisie|serena|kate|stephanie|google uk english female/i, 20],
  [/natural|neural|online|enhanced|premium/i, 10],
];

export class Voice {
  constructor(engine) {
    this.e = engine;
    this.clips = new Set();
    this.buffers = new Map();
    this.rate = 0.8;
    this.pitch = 0.96;
    this.userVoiceURI = null;
    this.ttsVoice = null;
    this.speaking = false;
    this.tts = typeof window !== 'undefined' && 'speechSynthesis' in window;
    if (this.tts) {
      this._pick();
      speechSynthesis.addEventListener?.('voiceschanged', () => { this._pick(); this.onVoices?.(); });
    }
    this.ready = this._loadManifest();
  }

  async _loadManifest() {
    try {
      const r = await fetch('voice/manifest.json', { cache: 'no-cache' });
      if (r.ok) {
        const j = await r.json();
        this.clips = new Set(j.clips || []);
        this.recordedName = j.voiceName || 'Recorded voice';
      }
    } catch (_) {}
  }

  get hasRecorded() { return this.clips.size > 0; }

  englishVoices() {
    if (!this.tts) return [];
    return speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  }

  _pick() {
    const vs = this.englishVoices();
    if (this.userVoiceURI) {
      const v = vs.find((x) => x.voiceURI === this.userVoiceURI);
      if (v) { this.ttsVoice = v; return; }
    }
    let best = null, bestScore = -1;
    for (const v of vs) {
      let s = 0;
      const tag = `${v.lang} ${v.name}`;
      for (const [re, w] of PREFER) if (re.test(tag)) s += w;
      if (v.localService) s += 3;
      if (s > bestScore) { best = v; bestScore = s; }
    }
    this.ttsVoice = best;
  }

  // 'auto' | 'recorded' | a voiceURI
  setChoice(choice) {
    this.choice = choice;
    this.userVoiceURI = choice && choice !== 'auto' && choice !== 'recorded' ? choice : null;
    this._pick();
  }

  get description() {
    if (this.hasRecorded && !this.userVoiceURI) return this.recordedName;
    return this.ttsVoice ? `${this.ttsVoice.name} (${this.ttsVoice.lang})` : 'No device voice found';
  }

  // Must be called from a user gesture once, so mobile browsers allow speech later.
  unlock() {
    if (!this.tts || this._unlocked) return;
    this._unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch (_) {}
  }

  async preload(id) {
    if (!this.clips.has(id) || this.buffers.has(id) || !this.e.ctx) return;
    try {
      const r = await fetch(`voice/${id}.mp3`);
      this.buffers.set(id, await this.e.ctx.decodeAudioData(await r.arrayBuffer()));
    } catch (_) {}
  }

  speak(id, text, { onend } = {}) {
    this.cancel();
    const token = (this._token = Symbol());
    const done = () => {
      if (this._token !== token) return;
      this._token = null;
      clearTimeout(this._safety);
      this.speaking = false;
      this.e.duck(false);
      onend && onend();
    };
    this.speaking = true;
    this.e.duck(true);
    const useRecorded = this.clips.has(id) && !this.userVoiceURI;
    const words = text.split(/\s+/).length;
    this._safety = setTimeout(done, (words / 1.6 + 6) * 1000); // never hang a session

    if (useRecorded) {
      this._playClip(id, done);
    } else if (this.tts && this.ttsVoice !== undefined) {
      const u = new SpeechSynthesisUtterance(text);
      if (this.ttsVoice) { u.voice = this.ttsVoice; u.lang = this.ttsVoice.lang; } else u.lang = 'en-IE';
      u.rate = this.rate;
      u.pitch = this.pitch;
      u.volume = 1;
      u.onend = done;
      u.onerror = done;
      this._utter = u; // keep a reference (Chrome can GC it and drop onend)
      speechSynthesis.speak(u);
    } else {
      setTimeout(done, (words / 2.1) * 1000);
    }
  }

  async _playClip(id, done) {
    await this.preload(id);
    const buf = this.buffers.get(id);
    if (!buf || !this._token) return done();
    const ctx = this.e.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    // centred and close, like someone sitting beside you, with a touch of room
    const g = ctx.createGain();
    g.gain.value = 1.15;
    const send = ctx.createGain();
    send.gain.value = 0.08;
    src.connect(g).connect(this.e.voiceBus);
    g.connect(send).connect(this.e.reverbSend);
    src.onended = () => { g.disconnect(); done(); };
    this._src = src;
    src.start();
  }

  cancel() {
    this._token = null;
    clearTimeout(this._safety);
    if (this.tts) try { speechSynthesis.cancel(); } catch (_) {}
    if (this._src) { try { this._src.stop(); } catch (_) {} this._src = null; }
    if (this.speaking) this.e.duck(false);
    this.speaking = false;
  }
}

// Runs a script line by line, with pauses and cues.
export class GuideRunner {
  constructor(voice, items, { onLine, onMark, onDone, startDelay = 12 } = {}) {
    Object.assign(this, { voice, items, onLine, onMark, onDone, startDelay });
    this.i = 0;
    this.done = false;
    this.stopped = false;
  }

  start() {
    this.timer = setTimeout(() => this._next(), this.startDelay * 1000);
    const first = this.items.find((x) => x.id);
    if (first) this.voice.preload(first.id);
  }

  _next() {
    if (this.stopped) return;
    if (this.i >= this.items.length) {
      this.done = true;
      this.onLine?.('');
      this.onDone?.();
      return;
    }
    const it = this.items[this.i++];
    if (it.mark) { this.onMark?.(it); return this._next(); }
    const nxt = this.items.slice(this.i).find((x) => x.id);
    if (nxt) this.voice.preload(nxt.id);
    this.onLine?.(it.text);
    this.voice.speak(it.id, it.text, {
      onend: () => {
        if (this.stopped) return;
        this.timer = setTimeout(() => { this.onLine?.(''); this._next(); }, it.pause * 1000);
      },
    });
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.voice.cancel();
  }
}
