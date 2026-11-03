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

    // master -> duck (lowered while the voice speaks) -> comp; voice joins after the duck
    this.duckGain = ctx.createGain();
    this.master.connect(this.duckGain).connect(this.comp).connect(this.volume).connect(this.analyser).connect(ctx.destination);
    this.voiceBus = ctx.createGain();
    this.voiceBus.gain.value = 1.1;
    this.voiceBus.connect(this.comp);

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

    this.noise = makeNoise(ctx, 6);
    this.whiteNoise = makeWhite(ctx, 6);
    this.natureBus = ctx.createGain();
    this.natureBus.connect(this.duckGain);
    if (this._pendingNature) this.setNature(this._pendingNature);
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

  // Short scene sounds, panned left/right in the head (not spatialised):
  //   'thud'  a soft, dull low thump, like something landing on a cushion
  //   'whoosh' a breathy swell of air that drifts across
  sfx(kind, { pan = 0, gain = 1, decay = 0.35, dur = 1.4, note = 1 } = {}) {
    const opts_note = note;
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx, t = ctx.currentTime + 0.01;
    if (!this.sfxBus) { this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master); }
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfxBus);
    const nodes = [p];
    const end = (sec) => setTimeout(() => nodes.forEach((n) => { try { n.disconnect(); } catch (_) {} }), sec * 1000 + 200);
    if (kind === 'thud') {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = 'sine';
      o.frequency.setValueAtTime(92, t);
      o.frequency.exponentialRampToValueAtTime(44, t + decay * 0.6);
      lp.type = 'lowpass'; lp.frequency.value = 180;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.55 * gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0008, t + decay);
      o.connect(lp).connect(g).connect(p);
      // a muffled body: a puff of low noise
      const n = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
      n.buffer = this.whiteNoise; nf.type = 'lowpass'; nf.frequency.value = 320;
      ng.gain.setValueAtTime(0.22 * gain, t); ng.gain.exponentialRampToValueAtTime(0.0006, t + Math.min(0.09, decay * 0.4));
      n.connect(nf).connect(ng).connect(p);
      // a second, higher body so the thud is heard on small headset speakers too
      const o2 = ctx.createOscillator(), g2 = ctx.createGain();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(170, t);
      o2.frequency.exponentialRampToValueAtTime(85, t + decay * 0.5);
      g2.gain.setValueAtTime(0, t);
      g2.gain.linearRampToValueAtTime(0.3 * gain, t + 0.004);
      g2.gain.exponentialRampToValueAtTime(0.0006, t + decay * 0.7);
      o2.connect(g2).connect(p);
      o.start(t); o.stop(t + decay + 0.05);
      o2.start(t); o2.stop(t + decay + 0.05);
      n.start(t, Math.random() * 4); n.stop(t + 0.12);
      nodes.push(o, g, lp, n, nf, ng, o2, g2);
      end(decay + 0.1);
    } else if (kind === 'chime') {
      // a soft singing-bowl chime: a few inharmonic partials with a long decay
      const base = 392 * (opts_note || 1);
      [[1, 0.5], [2.71, 0.22], [5.19, 0.1], [1.5, 0.12]].forEach(([m, a], i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = base * m * (1 + (i ? 0.002 : 0));
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(a * 0.5 * gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dur * (1 - i * 0.18));
        o.connect(g).connect(p);
        o.start(t); o.stop(t + dur + 0.1);
        nodes.push(o, g);
      });
      const send = ctx.createGain(); send.gain.value = 0.5; p.connect(send).connect(this.reverbSend); nodes.push(send);
      end(dur + 0.2);
    } else if (kind === 'crackle') {
      // a log fire's crackle: a cluster of tiny bright clicks and a soft pop
      const clicks = 1 + Math.floor(Math.random() * 5);
      for (let i = 0; i < clicks; i++) {
        const n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
        n.buffer = this.whiteNoise; hp.type = 'bandpass'; hp.frequency.value = 1800 + Math.random() * 3500; hp.Q.value = 0.9;
        const at = t + i * (0.01 + Math.random() * 0.05), len = 0.004 + Math.random() * 0.02;
        const amp = (0.15 + Math.random() * 0.5) * gain * (i ? 0.6 : 1);
        g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(amp, at + 0.001); g.gain.exponentialRampToValueAtTime(0.0005, at + len);
        n.connect(hp).connect(g).connect(p);
        n.start(at, Math.random() * 5); n.stop(at + len + 0.02);
        nodes.push(n, hp, g);
      }
      end(0.4);
    } else if (kind === 'hiss') {
      // the steady soft roar and hiss of a fire, for 'dur' seconds
      const n = ctx.createBufferSource(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noise || this.whiteNoise; n.loop = true;
      lp.type = 'lowpass'; lp.frequency.value = 900;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16 * gain, t + 2);
      g.gain.setValueAtTime(0.16 * gain, t + dur - 2); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(lp).connect(g).connect(p);
      n.start(t, Math.random() * 3); n.stop(t + dur + 0.1);
      nodes.push(n, lp, g);
      end(dur + 0.2);
    } else if (kind === 'whoosh') {
      const n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
      n.buffer = this.noise || this.whiteNoise;
      bp.type = 'bandpass'; bp.Q.value = 1.6;
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.exponentialRampToValueAtTime(1900, t + dur * 0.55);
      bp.frequency.exponentialRampToValueAtTime(700, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * gain, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      p.pan.setValueAtTime(p.pan.value, t);
      p.pan.linearRampToValueAtTime(-p.pan.value * 0.6, t + dur);
      n.connect(bp).connect(g).connect(p);
      // a little reverb tail so it floats away
      const send = ctx.createGain(); send.gain.value = 0.35;
      g.connect(send).connect(this.reverbSend);
      n.start(t, Math.random() * 3); n.stop(t + dur + 0.05);
      nodes.push(n, bp, g, send);
      end(dur + 0.1);
    }
  }

  duck(on) {
    if (!this.duckGain) return;
    this.duckGain.gain.setTargetAtTime(on ? 0.62 : 1, this.ctx.currentTime, on ? 0.6 : 1.8);
  }

  // Ambient nature bed, independent of the track: 'off' | 'rain' | 'ocean'
  setNature(kind) {
    this.natureKind = kind;
    if (!this.ctx) { this._pendingNature = kind; return; }
    const ctx = this.ctx, t = ctx.currentTime;
    if (this._nature) {
      const old = this._nature;
      old.gain.gain.setTargetAtTime(0, t, 1);
      setTimeout(() => old.nodes.forEach((n) => { try { n.stop(); } catch (_) {} n.disconnect(); }), 5000);
      this._nature = null;
    }
    if (kind === 'off') return;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.connect(this.natureBus);
    const nodes = [];
    const src = (buf, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(t, Math.random() * 3); nodes.push(s); return s; };
    if (kind === 'rain') {
      // bright hiss + soft roof patter + distant rumble
      const hiss = src(this.whiteNoise);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      const hg = ctx.createGain(); hg.gain.value = 0.05;
      hiss.connect(hp).connect(lp).connect(hg).connect(gain);
      const patter = src(this.noise, 1.3);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.6;
      const pg = ctx.createGain(); pg.gain.value = 0.12;
      const flutter = ctx.createOscillator(); flutter.frequency.value = 7.3;
      const fg = ctx.createGain(); fg.gain.value = 0.04;
      flutter.connect(fg).connect(pg.gain); flutter.start(t); nodes.push(flutter);
      patter.connect(bp).connect(pg).connect(gain);
      const rumble = src(this.noise, 0.5);
      const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 160;
      const rg = ctx.createGain(); rg.gain.value = 0.25;
      rumble.connect(rl).connect(rg).connect(gain);
      gain.gain.linearRampToValueAtTime(0.9, t + 6);
    } else if (kind === 'ocean') {
      const surf = src(this.noise, 0.8);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.3;
      const swell = ctx.createGain(); swell.gain.value = 0.11;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 1 / 9;
      const lg = ctx.createGain(); lg.gain.value = 0.1;
      const lfoF = ctx.createGain(); lfoF.gain.value = 500;
      lfo.connect(lg).connect(swell.gain);
      lfo.connect(lfoF).connect(lp.frequency);
      lfo.start(t); nodes.push(lfo);
      surf.connect(lp).connect(swell).connect(gain);
      const foam = src(this.whiteNoise, 1);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
      const fg = ctx.createGain(); fg.gain.value = 0;
      const lg2 = ctx.createGain(); lg2.gain.value = 0.012;
      lfo.connect(lg2).connect(fg.gain);
      foam.connect(hp).connect(fg).connect(gain);
      gain.gain.linearRampToValueAtTime(1, t + 6);
    }
    this._nature = { gain, nodes };
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

function makeWhite(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  // crossfade the loop seam
  const x = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < x; i++) { const a = i / x; d[len - x + i] = d[len - x + i] * (1 - a) + d[i] * a; }
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
