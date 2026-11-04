// Brainwave entrainment, in the spirit of the classic descending-carrier
// meditation programmes: a low carrier tone whose beat rate glides slowly
// from alpha down through theta (and into delta for sleep) over the session.
//
//   binaural   — left ear = carrier, right ear = carrier + beat (needs headphones)
//   isochronic — one tone pulsed smoothly on/off at the beat rate (works on speakers)
//   both       — layered, which is how many long-form programmes do it
//
// The carrier is an octave of the track's solfeggio frequency, so it is
// always in tune with the music.

export const PROFILES = {
  relax: { label: 'Relax', desc: 'alpha → theta', pts: [[0, 10], [0.25, 8.5], [0.55, 6.5], [0.8, 6], [1, 9]] },
  meditate: { label: 'Meditate', desc: 'deep theta', pts: [[0, 10], [0.2, 7.5], [0.45, 5.5], [0.75, 4.5], [1, 7]] },
  sleep: { label: 'Sleep', desc: 'theta → delta', pts: [[0, 9], [0.2, 6], [0.45, 3.5], [0.7, 2.2], [1, 1.5]] },
  focus: { label: 'Focus', desc: 'alpha / low beta', pts: [[0, 10], [0.3, 12], [0.7, 14], [1, 12]] },
  restore: { label: 'Restore', desc: 'theta → deep delta, for healing', pts: [[0, 9], [0.15, 6.5], [0.35, 3.5], [0.55, 2.0], [0.75, 2.0], [0.9, 3.5], [1, 7]] },
};

export const ENTRAIN_MODES = ['binaural', 'isochronic', 'both', 'off'];

export function bandName(hz) {
  if (hz < 4) return 'Delta';
  if (hz < 8) return 'Theta';
  if (hz < 13) return 'Alpha';
  return 'Beta';
}

export class Entrainment {
  constructor(engine, { carrier, profile, t0, duration, mode }) {
    const ctx = (this.ctx = engine.ctx);
    this.profile = PROFILES[profile] || PROFILES.relax;
    this.t0 = t0;
    this.duration = duration;
    this.carrier = carrier;
    this.out = ctx.createGain();
    this.out.connect(engine.headBus);

    // binaural pair
    this.bL = ctx.createOscillator();
    this.bR = ctx.createOscillator();
    this.bL.frequency.value = carrier;
    const merger = ctx.createChannelMerger(2);
    this.bL.connect(merger, 0, 0);
    this.bR.connect(merger, 0, 1);
    this.binGain = ctx.createGain();
    this.binGain.gain.value = 0;
    merger.connect(this.binGain).connect(this.out);

    // isochronic: carrier * smooth pulse (sine LFO through a soft-clip shaper)
    this.iso = ctx.createOscillator();
    this.iso.frequency.value = carrier * 2;
    const iso2 = ctx.createOscillator(); // soft fifth for warmth
    iso2.frequency.value = carrier * 3;
    const iso2g = ctx.createGain();
    iso2g.gain.value = 0.25;
    this.isoAmp = ctx.createGain();
    this.isoAmp.gain.value = 0.5;
    this.lfo = ctx.createOscillator();
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(4 * x) / Math.tanh(4);
    }
    shaper.curve = curve;
    const depth = ctx.createGain();
    depth.gain.value = 0.5;
    this.lfo.connect(shaper).connect(depth).connect(this.isoAmp.gain);
    this.iso.connect(this.isoAmp);
    iso2.connect(iso2g).connect(this.isoAmp);
    this.isoGain = ctx.createGain();
    this.isoGain.gain.value = 0;
    this.isoAmp.connect(this.isoGain).connect(this.out);

    // schedule the beat-rate journey
    const pts = this.profile.pts;
    this.bR.frequency.setValueAtTime(carrier + pts[0][1], t0);
    this.lfo.frequency.setValueAtTime(pts[0][1], t0);
    for (const [f, hz] of pts.slice(1)) {
      const at = t0 + f * duration;
      this.bR.frequency.linearRampToValueAtTime(carrier + hz, at);
      this.lfo.frequency.linearRampToValueAtTime(hz, at);
    }
    this.oscs = [this.bL, this.bR, this.iso, iso2, this.lfo];
    this.oscs.forEach((o) => o.start(t0));
    this.setMode(mode, 10);
  }

  setMode(mode, fade = 1.5) {
    this.mode = mode;
    const t = this.ctx.currentTime;
    const bin = mode === 'binaural' || mode === 'both' ? 0.055 : 0;
    const iso = mode === 'isochronic' || mode === 'both' ? 0.045 : 0;
    this.binGain.gain.cancelScheduledValues(t);
    this.isoGain.gain.cancelScheduledValues(t);
    this.binGain.gain.setTargetAtTime(bin, t, fade / 3);
    this.isoGain.gain.setTargetAtTime(iso, t, fade / 3);
  }

  beatAt(now) {
    const f = Math.min(1, Math.max(0, (now - this.t0) / this.duration));
    const pts = this.profile.pts;
    for (let i = 1; i < pts.length; i++) {
      if (f <= pts[i][0]) {
        const [f0, h0] = pts[i - 1], [f1, h1] = pts[i];
        return h0 + ((h1 - h0) * (f - f0)) / (f1 - f0);
      }
    }
    return pts[pts.length - 1][1];
  }

  stop(fade = 3) {
    const t = this.ctx.currentTime;
    this.out.gain.setTargetAtTime(0, t, fade / 4);
    this.oscs.forEach((o) => { try { o.stop(t + fade + 0.5); } catch (_) {} });
  }
}
