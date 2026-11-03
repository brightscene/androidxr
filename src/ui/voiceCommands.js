// Listens for spoken commands while you're in the headset. For now there is
// one: "Centre view" (or "Center view") turns the scene to face wherever you
// are looking. Uses the browser's speech recognition, which on Android sends
// the audio to Google's speech service; nothing is recorded by MindLyte.
// "Centre view", "Center the view"... or just "view" if the start was missed
const MATCH = /\b(cent(er|re|ral|ered)?\s+(the\s+|my\s+)?(view|you)|view)\b/i;

export class VoiceCommands {
  constructor(app) {
    this.app = app;
    const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
    this.supported = !!SR;
    this.SR = SR;
    this.active = false;
    this.last = 0;
  }

  // Ask for the microphone up front, on the flat screen, so the permission
  // prompt doesn't appear (and vanish) as the headset view opens. Once
  // granted, the browser remembers it for this site.
  async askPermission() {
    if (!this.supported || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const st = await navigator.permissions?.query({ name: 'microphone' });
      if (st && st.state !== 'prompt') { this.permission = st.state; return; }
    } catch (_) {}
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      this.permission = 'granted';
    } catch (e) {
      this.permission = e && e.name === 'NotAllowedError' ? 'denied' : 'unknown';
      // some browsers only allow the prompt after a tap: try again on the first one
      if (this.permission !== 'denied' && !this._retry) {
        this._retry = true;
        window.addEventListener('pointerdown', () => this.askPermission(), { once: true });
      }
    }
  }

  // Android's speech recogniser beeps every time it starts, and it stops
  // after a few seconds of quiet, so keeping it running meant a beep every
  // couple of seconds. Instead MindLyte listens to the microphone level
  // itself (silently, on the device, nothing is sent anywhere) and only
  // switches the recogniser on when you start speaking. You hear one beep,
  // then it catches the words. Saying "Centre view" once usually works;
  // if the first word is missed, "view" alone is enough while it's listening.
  async start() {
    if (!this.supported || this.active) return;
    this.active = true;
    this.lastStart = 0;
    await this._openMic();
  }

  stop() {
    this.active = false;
    try { this.rec?.abort(); } catch (_) {}
    this.rec = null;
    this._closeMic();
    try { this.ctx?.close(); } catch (_) {}
    this.ctx = null;
  }

  async _openMic() {
    if (!this.active || this.stream) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
    } catch (_) { return; }
    if (!this.active) { this._closeMic(); return; }
    const ctx = this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const src = this.src = ctx.createMediaStreamSource(this.stream);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.7;   // the voice band
    const an = ctx.createAnalyser(); an.fftSize = 1024;
    src.connect(bp).connect(an);
    const buf = new Float32Array(an.fftSize);
    this.floor = this.floor || 0.004; this.loud = 0;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      an.getFloatTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      // a slowly adapting noise floor, so steady room noise (or leaking music) doesn't trigger it
      this.floor = this.floor * 0.985 + Math.min(rms, this.floor * 2) * 0.015;
      this.loud = rms > Math.max(0.012, this.floor * 3.2) ? this.loud + 1 : 0;
      if (this.loud >= 3 && !this.rec && performance.now() - this.lastStart > 3000) this._listen();
    }, 40);
  }

  _closeMic() {
    clearInterval(this.timer); this.timer = null;
    try { this.src?.disconnect(); } catch (_) {}
    this.src = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  // one short listening window, opened when speech is heard
  _listen() {
    if (!this.active) return;
    this.lastStart = performance.now();
    this._closeMic();   // hand the microphone to the recogniser
    const rec = new this.SR();
    rec.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    const done = () => { clearTimeout(this.cut); try { rec.stop(); } catch (_) {} };
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        for (const alt of e.results[i]) {
          if (MATCH.test(alt.transcript) && performance.now() - this.last > 2500) {
            this.last = performance.now();
            this.app.recentre();
            done();
            return;
          }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.denied = true; this.stop(); this.app._changed?.(); }
    };
    rec.onend = () => { if (this.rec === rec) this.rec = null; if (this.active) setTimeout(() => this._openMic(), 300); };
    this.rec = rec;
    this.cut = setTimeout(done, 6000);
    try { rec.start(); } catch (_) { this.rec = null; this._openMic(); }
  }
}
