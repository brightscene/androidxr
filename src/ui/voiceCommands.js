// Listens for spoken commands while you're in the headset. For now there is
// one: "Centre view" (or "Center view") turns the scene to face wherever you
// are looking. Uses the browser's speech recognition, which on Android sends
// the audio to Google's speech service; nothing is recorded by MindLyte.
const COMMANDS = [
  { re: /\bcent(er|re|ral|ered)?\s+(the\s+|my\s+)?(view|you)\b/i, run: (app) => app.recentre() },
];

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

  // call from a click (a user gesture), e.g. when entering the headset
  start() {
    if (!this.supported || this.active) return;
    this.active = true;
    this._spin();
  }

  stop() {
    this.active = false;
    try { this.rec?.abort(); } catch (_) {}
    this.rec = null;
  }

  _spin() {
    if (!this.active) return;
    const rec = new this.SR();
    rec.lang = navigator.language?.startsWith('en') ? navigator.language : 'en-GB';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        for (const alt of e.results[i]) {
          for (const c of COMMANDS) {
            if (c.re.test(alt.transcript) && performance.now() - this.last > 2500) {
              this.last = performance.now();
              c.run(this.app);
              return;
            }
          }
        }
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { this.active = false; this.denied = true; this.app._changed?.(); }
    };
    // recognition stops after a pause or a minute or so; keep listening
    rec.onend = () => { if (this.active) setTimeout(() => this._spin(), 400); };
    this.rec = rec;
    try { rec.start(); } catch (_) { setTimeout(() => this._spin(), 1500); }
  }
}
