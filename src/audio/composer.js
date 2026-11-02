// Generative composer + sequencer.
//
// Writes music live from a track recipe (tracks.js) using a look-ahead scheduler
// on the Web Audio clock. Every musical action is also pushed as a timestamped
// event (beat / bar / chord / note / section / end) so the visuals can fire in
// sync with what you *hear*, and every melodic note carries the 3D position its
// sound was placed at, so light appears where the sound comes from.

import { SCALES } from './tracks.js';
import { Entrainment } from './entrainment.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LOOKAHEAD = 0.5; // seconds scheduled ahead (survives timer throttling)

// ---------------------------------------------------------------- shared base
class Sequenced {
  constructor(engine, track, opts) {
    this.e = engine;
    this.track = track;
    this.events = [];
    this.breathPattern = track.breath || [4, 2, 6, 0];
    this.breathCycle = this.breathPattern.reduce((a, b) => a + b, 0);
    this.entrainMode = opts.entrainment || 'binaural';
    this.profile = opts.profile || track.profile || 'relax';
    this.solfeggioOn = opts.solfeggio !== false;
    this.divesOn = opts.dives !== false && track.dives !== false;
    this.t0 = 0;
    let r = track.freq;
    while (r > 220) r /= 2;
    while (r < 110) r *= 2;
    this.root = r; // musical root is an octave of the solfeggio tone, so they agree
  }

  beatHz(now) { return this.ent ? this.ent.beatAt(now) : 0; }

  push(e) { this.events.push(e); }

  // Return (and remove) events whose time has been reached.
  pollEvents(now, out = []) {
    const keep = [];
    for (const e of this.events) (e.time <= now ? out : keep).push(e);
    this.events = keep;
    out.sort((a, b) => a.time - b.time);
    return out;
  }

  elapsed(now) { return Math.max(0, now - this.t0); }
  progress(now) { return Math.min(1, this.elapsed(now) / this.duration); }

  sectionAt(bar) {
    for (let i = this.sections.length - 1; i >= 0; i--) if (bar >= this.sections[i].startBar) return this.sections[i];
    return this.sections[0];
  }

  sectionAtTime(now) {
    const t = this.elapsed(now);
    for (let i = this.sections.length - 1; i >= 0; i--) if (t >= this.sections[i].startTime) return this.sections[i];
    return this.sections[0];
  }

  // Breathing guide: phase + 0..1 expansion value.
  getBreath(now) {
    const [inh, hold, exh, rest] = this.breathPattern;
    let p = this.elapsed(now) % this.breathCycle;
    const ease = (x) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, x)));
    if (p < inh) return { phase: 'in', value: ease(p / inh), left: inh - p };
    p -= inh;
    if (p < hold) return { phase: 'hold', value: 1, left: hold - p };
    p -= hold;
    if (p < exh) return { phase: 'out', value: 1 - ease(p / exh), left: exh - p };
    p -= exh;
    return { phase: 'rest', value: 0, left: rest - p };
  }

  // --- Solfeggio tone (pure sine, both ears) + brainwave entrainment layer.
  _startSolfeggio(t) {
    const ctx = this.e.ctx;
    const f = this.track.freq;
    const level = this._solLevel(this.solfeggioOn);
    this.osc = ctx.createOscillator();
    this.osc.frequency.value = f;
    this.solGain = ctx.createGain();
    this.solGain.gain.setValueAtTime(0, t);
    this.solGain.gain.linearRampToValueAtTime(level, t + 8);
    const lfo = ctx.createOscillator(); // slow swell so the tone breathes
    lfo.frequency.value = 1 / this.breathCycle;
    const lfoAmt = ctx.createGain();
    lfoAmt.gain.value = level * 0.3;
    lfo.connect(lfoAmt).connect(this.solGain.gain);
    this.osc.connect(this.solGain).connect(this.e.headBus);
    this.osc.start(t); lfo.start(t);
    this._continuous = (this._continuous || []).concat([this.osc, lfo]);
    this.ent = new Entrainment(this.e, { carrier: this.root, profile: this.profile, t0: t, duration: this.duration, mode: this.entrainMode });
  }

  _solLevel(on) { return on ? 0.06 * Math.sqrt(Math.min(1, 300 / this.track.freq)) : 0; }

  setEntrainment(mode) { this.entrainMode = mode; this.ent?.setMode(mode); }

  setSolfeggio(on) {
    this.solfeggioOn = on;
    if (this.solGain) this.solGain.gain.setTargetAtTime(this._solLevel(on), this.e.now, 0.8);
  }

  // A "deep dive": whoosh riser + sub drop in the audio, and a timed event the
  // visuals use to accelerate through the stars.
  dive(t, duration, intensity = 0.8) {
    const ctx = this.e.ctx;
    const rise = 2.6;
    const src = ctx.createBufferSource();
    src.buffer = this.e.noise; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(250, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + rise);
    bp.frequency.exponentialRampToValueAtTime(400, t + rise + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.09 * intensity, t + rise);
    g.gain.setTargetAtTime(0.025 * intensity, t + rise, duration * 0.3);
    g.gain.linearRampToValueAtTime(0, t + rise + duration + 3);
    src.connect(bp).connect(g).connect(this.e.dry);
    src.connect(bp); g.connect(this.e.reverbSend);
    src.start(t); src.stop(t + rise + duration + 3.2);
    const sub = ctx.createOscillator();
    sub.frequency.setValueAtTime(this.root / 2, t + rise - 0.1);
    sub.frequency.exponentialRampToValueAtTime(this.root / 4, t + rise + 2);
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0, t + rise - 0.1);
    sg.gain.linearRampToValueAtTime(0.18 * intensity, t + rise + 0.05);
    sg.gain.exponentialRampToValueAtTime(0.0001, t + rise + 3.5);
    sub.connect(sg).connect(this.e.dry);
    sub.start(t + rise - 0.1); sub.stop(t + rise + 3.6);
    this.push({ type: 'dive', time: t, duration: rise + duration, intensity });
  }

  // Breath sound: filtered noise swelling on inhale, falling on exhale.
  _scheduleBreaths(horizon) {
    const ctx = this.e.ctx;
    const [inh, hold, exh] = this.breathPattern;
    while (this.nextBreath < horizon) {
      const t = this.nextBreath;
      const amt = this.breathGuide ?? 1;
      if (amt > 0.01) {
        const src = ctx.createBufferSource();
        src.buffer = this.e.noise;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.Q.value = 1.2;
        bp.frequency.setValueAtTime(350, t);
        bp.frequency.linearRampToValueAtTime(1100, t + inh);
        bp.frequency.setValueAtTime(1100, t + inh + hold);
        bp.frequency.linearRampToValueAtTime(260, t + inh + hold + exh);
        const g = ctx.createGain();
        const peak = 0.05 * amt;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(peak, t + inh);
        g.gain.linearRampToValueAtTime(peak * 0.35, t + inh + hold);
        g.gain.linearRampToValueAtTime(peak * 0.8, t + inh + hold + exh * 0.25);
        g.gain.linearRampToValueAtTime(0, t + inh + hold + exh);
        src.connect(bp).connect(g).connect(this.e.dry);
        src.start(t, Math.random() * 2);
        src.stop(t + inh + hold + exh + 0.1);
        src.onended = () => g.disconnect();
      }
      this.push({ type: 'breath', time: t, phase: 'in' });
      this.nextBreath += this.breathCycle;
    }
  }

  _stopContinuous(at) {
    for (const o of this._continuous || []) { try { o.stop(at); } catch (_) {} }
    this._continuous = [];
  }
}

// ---------------------------------------------------------------- generative
export class Composer extends Sequenced {
  constructor(engine, track, opts = {}) {
    super(engine, track, opts);
    const minutes = opts.minutes || 10;
    this.spb = 60 / track.bpm;
    this.bpb = 4;
    const totalBars = Math.max(12, Math.round((minutes * 60) / (this.spb * this.bpb)));
    let acc = 0;
    this.sections = track.arc.map((s, i) => {
      const bars = Math.max(2, Math.round(s.frac * totalBars));
      const r = { ...s, index: i, startBar: acc, bars, startTime: acc * this.bpb * this.spb };
      acc += bars;
      return r;
    });
    this.totalBars = acc;
    this.duration = acc * this.bpb * this.spb;

    this.scale = SCALES[track.scale];
    this.rng = mulberry32(track.seed * 7919 + (opts.variation || 0));
    this.melDeg = this.scale.length * 2;
    this.padRot = 0;
    this.chord = [0, 2, 4, 6];
  }

  hz(semi) { return this.root * Math.pow(2, semi / 12); }

  degToSemi(deg) {
    const n = this.scale.length;
    return this.scale[((deg % n) + n) % n] + 12 * Math.floor(deg / n);
  }

  start() {
    const ctx = this.e.ctx;
    this.t0 = ctx.currentTime + 0.2;
    this.nextBeat = 0;
    this.nextTime = this.t0;
    this.nextBreath = this.t0;
    this.running = true;
    this._startSolfeggio(this.t0);
    this._startDrone(this.t0);
    this._tick();
    this.timer = setInterval(() => this._tick(), 25);
  }

  stop(fade = 3) {
    this.running = false;
    clearInterval(this.timer);
    const t = this.e.now;
    if (this.solGain) { this.solGain.gain.cancelScheduledValues(t); this.solGain.gain.setTargetAtTime(0, t, fade / 4); }
    this.ent?.stop(fade);
    if (this.droneGain) { this.droneGain.gain.cancelScheduledValues(t); this.droneGain.gain.setTargetAtTime(0, t, fade / 4); }
    this._stopContinuous(t + fade + 0.5);
    this.events = [];
  }

  _tick() {
    if (!this.running) return;
    const horizon = this.e.now + LOOKAHEAD;
    while (this.running && this.nextTime < horizon) {
      this._beat(this.nextBeat, this.nextTime);
      this.nextBeat++;
      this.nextTime += this.spb;
    }
    this._scheduleBreaths(Math.min(horizon, this.t0 + this.duration - this.breathCycle));
  }

  _beat(i, t) {
    const bar = Math.floor(i / this.bpb);
    const beat = i % this.bpb;
    if (bar >= this.totalBars) {
      if (beat === 0 && !this.ended) {
        this.ended = true;
        this.push({ type: 'end', time: t + 6 });
      }
      return;
    }
    const sec = this.sectionAt(bar);
    const rng = this.rng;
    this.push({ type: 'beat', time: t, beat, bar, accent: beat === 0 });

    if (beat === 0) {
      this.push({ type: 'bar', time: t, bar });
      if (bar === sec.startBar) {
        this.push({ type: 'section', time: t, index: sec.index, name: sec.name, energy: sec.energy });
        this._sectionAutomation(sec, t);
        if (this.divesOn && sec.dive) this.dive(t, sec.dive * this.bpb * this.spb, sec.diveAmt ?? 0.8);
      } else if (this.divesOn && sec.diveChance && bar % 8 === 4 && rng() < sec.diveChance) {
        this.dive(t, 2 * this.bpb * this.spb, 0.6);
      }
      const bpc = this.track.barsPerChord;
      if (bar % bpc === 0) {
        const prog = this.track.progression;
        const ci = (bar / bpc) % prog.length;
        const rootDeg = prog[ci];
        this.chord = [0, 2, 4, 6].map((k) => rootDeg + k);
        const semis = this.chord.map((d) => this.degToSemi(d));
        const last = bar + bpc >= this.totalBars;
        this._pad(semis, t, bpc * this.bpb * this.spb + (last ? 6 : 0), sec);
        this.push({ type: 'chord', time: t, index: ci, degree: rootDeg, freqs: semis.map((s) => this.hz(s)) });
      }
    }

    if (sec.pulse > 0 && (beat === 0 || beat === 2)) this._pulse(t, sec.pulse * (beat === 0 ? 1 : 0.55));

    for (const sub of [0, 0.5]) {
      const chance = sec.melody * (sub ? 0.45 : 1) * (beat === 0 && !sub ? 1.4 : 1);
      if (rng() < chance) this._melody(t + sub * this.spb, sec, beat === 0 && !sub);
    }

    if (beat === 0 && sec.shimmer > 0 && rng() < sec.shimmer * 0.6) this._shimmer(t, sec);
  }

  // Lengthen the final section (used so a guided voice is never cut off).
  extend(seconds) {
    const bars = Math.ceil(seconds / (this.bpb * this.spb));
    if (this.ended) return;
    this.sections[this.sections.length - 1].bars += bars;
    this.totalBars += bars;
    this.duration = this.totalBars * this.bpb * this.spb;
  }

  _sectionAutomation(sec, t) {
    const g = this.droneGain.gain;
    g.setTargetAtTime(0.04 + sec.energy * 0.06, t, 3);
    this.droneFilter.frequency.setTargetAtTime(220 + sec.energy * 700, t, 4);
    // breath guide loud at the start, softer as you sink in
    this.breathGuide = this.track.guided ? 0 : sec.index <= 1 ? 1 : sec.index === 4 ? 0.7 : 0.35;
  }

  _startDrone(t) {
    const ctx = this.e.ctx;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.setValueAtTime(0, t);
    this.droneGain.gain.linearRampToValueAtTime(0.05, t + 10);
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 300;
    const a = ctx.createOscillator(); a.type = 'sine'; a.frequency.value = this.root / 2;
    const b = ctx.createOscillator(); b.type = 'triangle'; b.frequency.value = this.root; b.detune.value = 4;
    const c = ctx.createOscillator(); c.type = 'sine'; c.frequency.value = this.hz(7) / 2; // fifth
    const cg = ctx.createGain(); cg.gain.value = 0.4;
    a.connect(this.droneFilter); b.connect(this.droneFilter); c.connect(cg).connect(this.droneFilter);
    const send = ctx.createGain(); send.gain.value = 0.6;
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.e.dry);
    this.droneGain.connect(send).connect(this.e.reverbSend);
    [a, b, c].forEach((o) => o.start(t));
    this._continuous.push(a, b, c);
  }

  // Warm detuned-saw pad, each voice placed at a point on a ring around you.
  _pad(semis, t, dur, sec) {
    const ctx = this.e.ctx;
    const voices = [semis[0] - 12, ...semis];
    const att = Math.min(3, dur * 0.35);
    const rel = 4;
    this.padRot += 0.7;
    voices.forEach((s, i) => {
      const az = (i / voices.length) * Math.PI * 2 + this.padRot;
      const p = this.e.makePanner(Math.sin(az) * 3.2, 1.4 + (i % 2 ? 1 : 0), -Math.cos(az) * 3.2, 0.65);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.Q.value = 0.6;
      f.frequency.setValueAtTime(250, t);
      f.frequency.linearRampToValueAtTime(450 + sec.energy * 1800, t + att * 1.5);
      f.frequency.linearRampToValueAtTime(350, t + dur + rel);
      const g = ctx.createGain();
      const level = (i === 0 ? 0.08 : 0.038) * (0.55 + sec.energy * 0.6);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(level, t + att);
      g.gain.setValueAtTime(level, t + dur);
      g.gain.linearRampToValueAtTime(0, t + dur + rel);
      const freq = this.hz(s);
      for (const det of i === 0 ? [0] : [-9, 9]) {
        const o = ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'sawtooth';
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + rel + 0.1);
        o.onended = () => p.disconnect();
      }
      f.connect(g).connect(p);
    });
  }

  // Soft low heartbeat.
  _pulse(t, amt) {
    const ctx = this.e.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(this.root, t);
    o.frequency.exponentialRampToValueAtTime(this.root / 2, t + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.22 * amt, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(this.e.dry);
    o.start(t);
    o.stop(t + 0.75);
  }

  // Glassy FM bell placed in space according to pitch.
  _melody(t, sec, strong) {
    const rng = this.rng;
    const n = this.scale.length;
    const steps = [-2, -1, -1, 1, 1, 2, 0, 3, -3];
    let d = this.melDeg + steps[Math.floor(rng() * steps.length)];
    const lo = n + 1, hi = n * 3 + 1;
    if (d < lo) d = lo + 1;
    if (d > hi) d = hi - 1;
    if (strong) {
      // snap to nearest chord tone on the downbeat
      let best = d, bd = 99;
      for (const c of this.chord) for (const o of [n, 2 * n, 3 * n]) {
        const cand = c + o;
        if (Math.abs(cand - d) < bd && cand >= lo && cand <= hi) { bd = Math.abs(cand - d); best = cand; }
      }
      d = best;
    }
    this.melDeg = d;
    const freq = this.hz(this.degToSemi(d));
    const u = (d - lo) / (hi - lo); // 0 low .. 1 high
    const az = (u - 0.5) * 2.4 + (rng() - 0.5) * 0.5;
    const r = 2.4 + rng() * 0.8;
    const pos = [Math.sin(az) * r, 0.9 + u * 1.9, -Math.cos(az) * r];
    const vel = (strong ? 0.9 : 0.55 + rng() * 0.3) * (0.6 + sec.energy * 0.5);
    this._bell(freq, t, vel, pos, 3.5);
    this.push({ type: 'note', time: t, freq, degree: d, u, vel, pos, kind: 'bell' });
  }

  _shimmer(t, sec) {
    const n = this.scale.length;
    const base = this.chord[Math.floor(this.rng() * this.chord.length)] + n * 4;
    for (let k = 0; k < 3; k++) {
      const d = base + k * 2;
      const freq = this.hz(this.degToSemi(d));
      const az = (this.rng() - 0.5) * Math.PI * 1.6;
      const pos = [Math.sin(az) * 2, 2.6 + this.rng() * 0.8, -Math.cos(az) * 2];
      const tt = t + k * this.spb * 0.33;
      this._bell(freq, tt, 0.25 * sec.shimmer, pos, 2.5);
      this.push({ type: 'note', time: tt, freq, degree: d, u: 1, vel: 0.4, pos, kind: 'shimmer' });
    }
  }

  _bell(freq, t, vel, pos, len) {
    const ctx = this.e.ctx;
    const out = this.e.makePanner(pos[0], pos[1], pos[2], 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const car = ctx.createOscillator();
    car.frequency.value = freq;
    const mod = ctx.createOscillator();
    mod.frequency.value = freq * 2;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(freq * 1.2 * vel, t);
    idx.gain.exponentialRampToValueAtTime(freq * 0.02, t + 1.4);
    mod.connect(idx).connect(car.frequency);
    const h = ctx.createOscillator(); // inharmonic partial for a glassy edge
    h.frequency.value = freq * 2.76;
    const hg = ctx.createGain();
    hg.gain.setValueAtTime(0.25, t);
    hg.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
    h.connect(hg).connect(g);
    car.connect(g).connect(out);
    for (const o of [car, mod, h]) { o.start(t); o.stop(t + len + 0.05); }
    car.onended = () => out.disconnect();
  }
}

// ---------------------------------------------------------------- imported
// Plays a user's own audio file (e.g. an AI-generated track from Suno/Udio)
// with a solfeggio layer, and derives beat/note/section events by analysing
// the waveform up-front so the visuals are keyed to that music too.
export class ImportedPlayer extends Sequenced {
  constructor(engine, track, buffer, opts = {}) {
    super(engine, track, opts);
    this.buffer = buffer;
    this.duration = buffer.duration;
    this.analysis = analyseBuffer(buffer);
    const parts = 5;
    this.sections = track.arc.map((s, i) => {
      const startTime = (this.duration * i) / parts;
      const e = this.analysis.partEnergy[i];
      return { ...s, index: i, startTime, energy: 0.25 + e * 0.7 };
    });
  }

  start() {
    const ctx = this.e.ctx;
    this.t0 = ctx.currentTime + 0.2;
    this.running = true;
    this.src = ctx.createBufferSource();
    this.src.buffer = this.buffer;
    const g = ctx.createGain(); g.gain.value = 0.9;
    const send = ctx.createGain(); send.gain.value = 0.15;
    this.src.connect(g).connect(this.e.dry);
    this.src.connect(send).connect(this.e.reverbSend);
    this.src.start(this.t0);
    this.nextBreath = this.t0;
    this.breathGuide = 0.4;
    this._startSolfeggio(this.t0);
    // schedule the analysed events
    const rng = mulberry32(this.track.seed);
    for (const s of this.sections) this.push({ type: 'section', time: this.t0 + s.startTime, index: s.index, name: s.name, energy: s.energy });
    let bar = 0, ci = 0;
    for (const on of this.analysis.onsets) {
      const t = this.t0 + on.time;
      this.push({ type: 'beat', time: t, beat: on.strong ? 0 : 1, bar, accent: on.strong });
      if (on.strong) {
        this.push({ type: 'bar', time: t, bar: bar++ });
        const az = (rng() - 0.5) * 2.4, r = 2.4 + rng() * 0.8, u = rng();
        this.push({ type: 'note', time: t, freq: 440, degree: 0, u, vel: on.strength, pos: [Math.sin(az) * r, 0.9 + u * 1.9, -Math.cos(az) * r], kind: 'bell' });
      }
    }
    for (let t = 0; t < this.duration; t += 8) this.push({ type: 'chord', time: this.t0 + t, index: ci++ % 4, degree: ci, freqs: [] });
    this.push({ type: 'end', time: this.t0 + this.duration + 1 });
    this.timer = setInterval(() => this._scheduleBreaths(Math.min(this.e.now + LOOKAHEAD, this.t0 + this.duration - this.breathCycle)), 100);
  }

  stop(fade = 3) {
    this.running = false;
    clearInterval(this.timer);
    const t = this.e.now;
    try { this.src.stop(t + fade + 0.2); } catch (_) {}
    if (this.solGain) this.solGain.gain.setTargetAtTime(0, t, fade / 4);
    this.ent?.stop(fade);
    this._stopContinuous(t + fade + 0.5);
    this.events = [];
  }
}

function analyseBuffer(buffer) {
  const sr = buffer.sampleRate;
  const ch = buffer.numberOfChannels;
  const n = buffer.length;
  const hop = 1024;
  const frames = Math.floor(n / hop);
  const env = new Float32Array(frames);
  const data = [];
  for (let c = 0; c < ch; c++) data.push(buffer.getChannelData(c));
  let lp = 0;
  for (let f = 0; f < frames; f++) {
    let s = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      let v = 0;
      for (let c = 0; c < ch; c++) v += data[c][i];
      lp += 0.05 * (v / ch - lp); // emphasise lows for beat detection
      s += lp * lp;
    }
    env[f] = Math.sqrt(s / hop);
  }
  let max = 1e-6;
  for (const v of env) max = Math.max(max, v);
  const flux = new Float32Array(frames);
  for (let f = 1; f < frames; f++) flux[f] = Math.max(0, env[f] - env[f - 1]) / max;
  const onsets = [];
  const win = 43; // ~1s
  let last = -1;
  for (let f = 1; f < frames - 1; f++) {
    let mean = 0;
    for (let k = Math.max(0, f - win); k < Math.min(frames, f + win); k++) mean += flux[k];
    mean /= 2 * win;
    const thr = mean * 2.2 + 0.004;
    if (flux[f] > thr && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1]) {
      const time = (f * hop) / sr;
      if (last < 0 || time - last > 0.28) {
        onsets.push({ time, strength: Math.min(1, flux[f] / (thr * 3)), strong: flux[f] > thr * 2.2 });
        last = time;
      }
    }
  }
  const partEnergy = [];
  for (let p = 0; p < 5; p++) {
    let s = 0;
    const a = Math.floor((frames * p) / 5), b = Math.floor((frames * (p + 1)) / 5);
    for (let f = a; f < b; f++) s += env[f];
    partEnergy.push(s / Math.max(1, b - a) / max);
  }
  return { onsets, partEnergy };
}
