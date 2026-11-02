// Core Web Audio graph: master bus, generated reverb, analyser, and an
// HRTF spatial listener that follows the headset so sounds stay fixed in the room.
//
//   voices -> panner(HRTF) -> dry ------------------> master -> comp -> analyser -> out
//                         \-> reverbSend -> reverb -/
//   solfeggio (binaural, head-locked) ----------------^

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this._freq = null;
  }

  init() {
    if (this.ctx) return this.ctx.resume();
    const ctx = (this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' }));

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.volume = ctx.createGain();
    this.volume.gain.value = 0.8;

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -20;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.02;
    this.comp.release.value = 0.4;

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this._freq = new Uint8Array(this.analyser.frequencyBinCount);
    this._time = new Uint8Array(this.analyser.fftSize);

    this.master.connect(this.comp).connect(this.volume).connect(this.analyser).connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = makeImpulse(ctx, 7, 2.2);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.9;
    this.reverbSend.connect(this.reverb).connect(this.master);

    this.dry = ctx.createGain();
    this.dry.gain.value = 0.7;
    this.dry.connect(this.master);

    // head-locked bus for binaural tones (must not be spatialised)
    this.headBus = ctx.createGain();
    this.headBus.connect(this.master);

    this.noise = makeNoise(ctx, 4);
    return ctx.resume();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // Latency-compensated "what the listener hears right now" time.
  get heardTime() {
    if (!this.ctx) return 0;
    return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  fadeMaster(to, seconds) {
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(to, t + seconds);
  }

  setVolume(v) {
    if (this.volume) this.volume.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  // A spatial voice output at a fixed world position (metres, WebXR local-floor space).
  makePanner(x, y, z, wet = 0.5) {
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.5;
    p.rolloffFactor = 0.6;
    setParam(p.positionX, x, ctx);
    setParam(p.positionY, y, ctx);
    setParam(p.positionZ, z, ctx);
    const dry = ctx.createGain();
    dry.gain.value = 1 - wet * 0.5;
    const send = ctx.createGain();
    send.gain.value = wet;
    p.connect(dry).connect(this.dry);
    p.connect(send).connect(this.reverbSend);
    return p;
  }

  // Keep the audio listener glued to the headset pose.
  updateListener(position, forward, up) {
    const l = this.ctx && this.ctx.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = position.x;
      l.positionY.value = position.y;
      l.positionZ.value = position.z;
      l.forwardX.value = forward.x;
      l.forwardY.value = forward.y;
      l.forwardZ.value = forward.z;
      l.upX.value = up.x;
      l.upY.value = up.y;
      l.upZ.value = up.z;
    } else {
      l.setPosition(position.x, position.y, position.z);
      l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
    }
  }

  // Normalised spectrum bands + RMS level, for visuals.
  readBands(out) {
    if (!this.analyser) return out;
    const f = this._freq;
    this.analyser.getByteFrequencyData(f);
    this.analyser.getByteTimeDomainData(this._time);
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const band = (lo, hi) => {
      let s = 0, n = 0;
      for (let i = Math.floor(lo / binHz); i <= Math.min(f.length - 1, Math.ceil(hi / binHz)); i++) { s += f[i]; n++; }
      return n ? s / n / 255 : 0;
    };
    out.low = band(30, 200);
    out.mid = band(200, 1500);
    out.high = band(1500, 8000);
    let rms = 0;
    for (let i = 0; i < this._time.length; i++) { const v = (this._time[i] - 128) / 128; rms += v * v; }
    out.level = Math.sqrt(rms / this._time.length);
    return out;
  }
}

function setParam(param, v, ctx) {
  if (param) param.setValueAtTime(v, ctx.currentTime);
}

// Exponentially decaying stereo noise, lightly low-passed: a soft hall.
function makeImpulse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += 0.35 * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.pow(1 - t, decay) * (i < rate * 0.02 ? i / (rate * 0.02) : 1);
    }
  }
  return buf;
}

function makeNoise(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0; // pinkish
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029591;
    b1 = 0.985 * b1 + w * 0.032534;
    b2 = 0.95 * b2 + w * 0.048056;
    d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9;
  }
  return buf;
}
