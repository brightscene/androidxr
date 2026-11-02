// AudioStrobe® / SpectraStrobe™ decoder.
//
// Light-and-sound tracks hide light control signals as near-inaudible tones
// high in the audio spectrum. The loudness of each tone in the left/right
// channel sets the brightness of the left/right light.
//
//   AudioStrobe    one carrier (nominally 19.2 kHz; some encoders use others,
//                  e.g. 19.5 kHz) -> left & right brightness
//   SpectraStrobe  18.2 kHz reference tone (pulsed 10 Hz, marks the format and
//                  sets full scale) + red 18.7, green 19.2, blue 19.7 kHz
//                  -> full RGB per eye
//
// The decoder scans the track to detect which format is present and the exact
// carrier frequencies, then demodulates every control tone (complex
// heterodyne, low-pass, decimate) into per-eye RGB envelopes at 500 Hz.

export const SS_FREQS = { ref: 18200, r: 18700, g: 19200, b: 19700 };
export const RATE = 500; // control frames per second

const yieldUI = () => new Promise((r) => setTimeout(r, 0));

// Windowed Goertzel magnitude of frequency f over x[start..start+n)
function goertzel(x, start, n, f, sr, win) {
  const w = (2 * Math.PI * f) / sr;
  const c = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const s0 = x[start + i] * win[i] + c * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - c * s1 * s2));
}

function hann(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

// Find narrow, persistent tones between 17.5 and 20.6 kHz.
export function detect(buffer) {
  const sr = buffer.sampleRate;
  const chans = Math.min(2, buffer.numberOfChannels);
  const data = [...Array(chans)].map((_, c) => buffer.getChannelData(c));
  const N = 4096, win = hann(N);
  const fMax = Math.min(20600, sr / 2 - 200);
  const freqs = [];
  for (let f = 17500; f <= fMax; f += 4) freqs.push(f);
  const spec = new Float64Array(freqs.length);
  const W = 10;
  for (let k = 0; k < W; k++) {
    const start = Math.floor(((k + 0.5) / W) * (buffer.length - N));
    for (const x of data) freqs.forEach((f, i) => { spec[i] += goertzel(x, start, N, f, sr, win); });
  }
  const db = Array.from(spec, (v) => 20 * Math.log10(v + 1e-12));
  const sorted = [...db].sort((a, b) => a - b);
  const floor = sorted[Math.floor(sorted.length / 2)];
  const peaks = [];
  for (let i = 2; i < db.length - 2; i++) {
    if (db[i] >= db[i - 1] && db[i] >= db[i + 1] && db[i] - floor > 18) peaks.push({ f: freqs[i], snr: db[i] - floor });
  }
  // refine each peak with a long window
  const N2 = 16384, win2 = hann(N2);
  const start = Math.floor(buffer.length / 2 - N2 / 2);
  for (const p of peaks) {
    let best = p.f, bm = -1;
    for (let f = p.f - 6; f <= p.f + 6; f += 0.5) {
      let m = 0;
      for (const x of data) m += goertzel(x, start, N2, f, sr, win2);
      if (m > bm) { bm = m; best = f; }
    }
    p.f = best;
  }
  const near = (f, tol = 70) => peaks.filter((p) => Math.abs(p.f - f) < tol).sort((a, b) => b.snr - a.snr)[0];
  const ref = near(SS_FREQS.ref);
  const colours = ['r', 'g', 'b'].map((k) => near(SS_FREQS[k]));
  if (ref && colours.some(Boolean)) {
    return {
      format: 'spectrastrobe',
      carriers: { ref: ref.f, r: colours[0]?.f ?? SS_FREQS.r, g: colours[1]?.f ?? SS_FREQS.g, b: colours[2]?.f ?? SS_FREQS.b },
      peaks,
    };
  }
  const as = peaks.filter((p) => p.f > 18400 && p.f < 20600).sort((a, b) => b.snr - a.snr)[0];
  if (as) return { format: 'audiostrobe', carriers: { a: as.f }, peaks };
  return { format: null, peaks };
}

// Demodulate tones at `freqs` (Hz) in one channel into envelopes at RATE.
// Heterodynes the whole control band down to baseband once, decimates, then
// demodulates each tone cheaply at the low rate.
async function demodChannel(x, sr, freqs, onProgress, base, span) {
  const centre = (Math.min(...freqs) + Math.max(...freqs)) / 2;
  // stage 1: shift centre -> 0 Hz, 4x one-pole low-pass @ 1.4 kHz, decimate to ~4 kHz
  const D1 = Math.max(1, Math.floor(sr / 4000));
  const sr1 = sr / D1;
  const a1 = 1 - Math.exp((-2 * Math.PI * 1400) / sr);
  const n1 = Math.floor(x.length / D1);
  const I1 = new Float32Array(n1), Q1 = new Float32Array(n1);
  let cr = 1, ci = 0;
  const dw = (-2 * Math.PI * centre) / sr;
  const rc = Math.cos(dw), rs = Math.sin(dw);
  let i1 = 0, i2 = 0, i3 = 0, i4 = 0, q1 = 0, q2 = 0, q3 = 0, q4 = 0;
  const CH = 1 << 20;
  for (let s = 0; s < x.length; s += CH) {
    const e = Math.min(x.length, s + CH);
    for (let i = s; i < e; i++) {
      const v = x[i];
      i1 += a1 * (v * cr - i1); i2 += a1 * (i1 - i2); i3 += a1 * (i2 - i3); i4 += a1 * (i3 - i4);
      q1 += a1 * (v * ci - q1); q2 += a1 * (q1 - q2); q3 += a1 * (q2 - q3); q4 += a1 * (q3 - q4);
      const nr = cr * rc - ci * rs; ci = cr * rs + ci * rc; cr = nr;
      if ((i & 1023) === 0) { const m = Math.hypot(cr, ci); cr /= m; ci /= m; }
      if (i % D1 === 0) { const k = i / D1; if (k < n1) { I1[k] = i4; Q1[k] = q4; } }
    }
    onProgress?.(base + (span * e) / x.length);
    await yieldUI();
  }
  // stage 2: each tone: shift by (f - centre), 4x one-pole @ 110 Hz, magnitude, decimate to RATE
  const D2 = sr1 / RATE;
  const nOut = Math.floor(n1 / D2);
  const a2 = 1 - Math.exp((-2 * Math.PI * 110) / sr1);
  return freqs.map((f) => {
    const out = new Float32Array(nOut);
    const g1 = Math.pow(1 + Math.pow((f - centre) / 1400, 2), -2); // undo stage-1 roll-off
    const w = (-2 * Math.PI * (f - centre)) / sr1;
    const wr = Math.cos(w), wi = Math.sin(w);
    let pr = 1, pi = 0, j1 = 0, j2 = 0, j3 = 0, j4 = 0, k1 = 0, k2 = 0, k3 = 0, k4 = 0;
    let next = 0, o = 0;
    for (let k = 0; k < n1; k++) {
      const re = I1[k] * pr - Q1[k] * pi, im = I1[k] * pi + Q1[k] * pr;
      j1 += a2 * (re - j1); j2 += a2 * (j1 - j2); j3 += a2 * (j2 - j3); j4 += a2 * (j3 - j4);
      k1 += a2 * (im - k1); k2 += a2 * (k1 - k2); k3 += a2 * (k2 - k3); k4 += a2 * (k3 - k4);
      const nr = pr * wr - pi * wi; pi = pr * wi + pi * wr; pr = nr;
      if ((k & 1023) === 0) { const m = Math.hypot(pr, pi); pr /= m; pi /= m; }
      if (k >= next && o < nOut) { out[o++] = (2 * Math.hypot(j4, k4)) / g1; next += D2; }
    }
    return out;
  });
}

function percentile(arr, p) {
  const step = Math.max(1, Math.floor(arr.length / 20000));
  const s = [];
  for (let i = 0; i < arr.length; i += step) s.push(arr[i]);
  s.sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

// Normalise an envelope to 0..1 using the track's own range.
function normalise(e) {
  const lo = percentile(e, 1), hi = percentile(e, 99.5);
  const span = Math.max(1e-9, hi - lo);
  for (let i = 0; i < e.length; i++) e[i] = Math.min(1, Math.max(0, (e[i] - lo) / span));
  return e;
}

// Full decode. Returns null if the track carries no light encoding.
// Result: { format, carriers, rate, frames, L: Float32Array(frames*3), R: ..., mono }
export async function decodeStrobe(buffer, onProgress) {
  const det = detect(buffer);
  if (!det.format) return null;
  const sr = buffer.sampleRate;
  const chans = Math.min(2, buffer.numberOfChannels);
  const keys = det.format === 'spectrastrobe' ? ['ref', 'r', 'g', 'b'] : ['a'];
  const freqs = keys.map((k) => det.carriers[k]);
  const env = [];
  for (let c = 0; c < chans; c++) {
    env.push(await demodChannel(buffer.getChannelData(c), sr, freqs, onProgress, c / chans, 1 / chans));
  }
  if (chans === 1) env.push(env[0]);
  const frames = env[0][0].length;
  const L = new Float32Array(frames * 3), R = new Float32Array(frames * 3);
  if (det.format === 'audiostrobe') {
    const eyes = [normalise(env[0][0]), normalise(env[1][0])];
    eyes.forEach((e, side) => {
      const out = side ? R : L;
      for (let i = 0; i < frames; i++) out[i * 3] = out[i * 3 + 1] = out[i * 3 + 2] = e[i];
    });
  } else {
    // colour tones are scaled against the reference tone's recent peak level
    env.forEach((chanEnv, side) => {
      const [ref, ...rgb] = chanEnv;
      const out = side ? R : L;
      let peak = 0;
      const decay = Math.exp(-1 / (RATE * 2));
      const fallback = Math.max(...rgb.map((e) => percentile(e, 99.5)), 1e-9);
      for (let i = 0; i < frames; i++) {
        peak = Math.max(ref[i], peak * decay);
        const scale = peak > fallback * 0.05 ? peak : fallback;
        for (let k = 0; k < 3; k++) out[i * 3 + k] = Math.min(1, rgb[k][i] / scale);
      }
    });
  }
  return { format: det.format, carriers: det.carriers, rate: RATE, frames, L, R, mono: det.format === 'audiostrobe' };
}

// Dominant flash rate (Hz) of an eye's brightness around time t (for display).
export function flashRateAt(strobe, side, t, span = 4) {
  const arr = side ? strobe.R : strobe.L;
  const r = strobe.rate;
  const a = Math.max(0, Math.floor((t - span / 2) * r));
  const b = Math.min(strobe.frames, a + Math.floor(span * r));
  const n = b - a;
  if (n < r) return 0;
  const x = new Float32Array(n);
  let mean = 0;
  for (let i = 0; i < n; i++) { const k = (a + i) * 3; x[i] = arr[k] + arr[k + 1] + arr[k + 2]; mean += x[i]; }
  // remove slow swells (moving average over ~0.4 s) so the flicker itself stands out
  const h = Math.floor(r * 0.2);
  const pre = new Float32Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i] + x[i];
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, i - h), hi = Math.min(n, i + h + 1);
    y[i] = (x[i] - (pre[hi] - pre[lo]) / (hi - lo)) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  x.set(y);
  let best = 0, bm = 0;
  for (let f = 2; f <= 40; f += 0.1) {
    const w = (2 * Math.PI * f) / r, c = 2 * Math.cos(w);
    let s1 = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const s0 = x[i] + c * s1 - s2; s2 = s1; s1 = s0; }
    const m = s1 * s1 + s2 * s2 - c * s1 * s2;
    if (m > bm) { bm = m; best = f; }
  }
  return best;
}
