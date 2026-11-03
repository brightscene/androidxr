// Prepare a built-in AudioStrobe / SpectraStrobe track for streaming:
//   node tools/prepare-light-track.mjs <input.mp3> <out-id>
// Writes public/tracks/<id>.mp3 (a copy), <id>.lights (pre-decoded light
// signals at 500 frames/s: 2 bytes/frame for AudioStrobe, 6 for SpectraStrobe)
// and <id>.json (format, carriers, beat onsets and section energy).
// Needs ffmpeg on the PATH.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeStrobe, detect, flashRateAt } from '../src/audio/strobe.js';

const [, , input, id] = process.argv;
const SR = 48000;
const tmp = join(mkdtempSync(join(tmpdir(), 'lt-')), 'a.f32');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', input, '-f', 'f32le', '-ac', '2', '-ar', String(SR), tmp]);
const raw = new Float32Array(readFileSync(tmp).buffer.slice(0));
const n = raw.length / 2, L = new Float32Array(n), R = new Float32Array(n);
for (let i = 0; i < n; i++) { L[i] = raw[2 * i]; R[i] = raw[2 * i + 1]; }
const buf = { sampleRate: SR, numberOfChannels: 2, length: n, getChannelData: (c) => (c ? R : L) };
const d = detect(buf);
console.log('peaks', d.peaks.map((p) => `${p.f}(+${p.snr.toFixed(0)})`).join(' '));
const s = await decodeStrobe(buf);
if (!s) { console.log('NO LIGHT ENCODING FOUND'); process.exit(1); }
console.log('format', s.format, JSON.stringify(s.carriers), 'frames', s.frames);
for (let m = 0; m * 60 < n / SR; m += 3) {
  const t = m * 60 + 30;
  if (t + 20 > n / SR) break;
  console.log(`${m}m  L ${flashRateAt(s, 0, t).toFixed(1)}Hz  R ${flashRateAt(s, 1, t).toFixed(1)}Hz`);
}
const per = s.mono ? 2 : 6;
const out = new Uint8Array(s.frames * per);
for (let i = 0; i < s.frames; i++) {
  if (s.mono) { out[i * 2] = Math.round(s.L[i * 3] * 255); out[i * 2 + 1] = Math.round(s.R[i * 3] * 255); }
  else for (let k = 0; k < 3; k++) { out[i * 6 + k] = Math.round(s.L[i * 3 + k] * 255); out[i * 6 + 3 + k] = Math.round(s.R[i * 3 + k] * 255); }
}

// beat onsets and section energy (same method as the composer's analysis)
const hop = 1024, frames = Math.floor(n / hop), env = new Float32Array(frames);
let lp = 0;
for (let f = 0; f < frames; f++) {
  let sum = 0;
  for (let i = f * hop; i < (f + 1) * hop; i++) { lp += 0.05 * ((L[i] + R[i]) / 2 - lp); sum += lp * lp; }
  env[f] = Math.sqrt(sum / hop);
}
let max = 1e-6; for (const v of env) max = Math.max(max, v);
const flux = new Float32Array(frames);
for (let f = 1; f < frames; f++) flux[f] = Math.max(0, env[f] - env[f - 1]) / max;
const onsets = []; const win = 43; let last = -1;
for (let f = 1; f < frames - 1; f++) {
  let mean = 0;
  for (let k = Math.max(0, f - win); k < Math.min(frames, f + win); k++) mean += flux[k];
  mean /= 2 * win;
  const thr = mean * 2.2 + 0.004;
  if (flux[f] > thr && flux[f] >= flux[f - 1] && flux[f] >= flux[f + 1]) {
    const time = (f * hop) / SR;
    if (last < 0 || time - last > 0.28) { onsets.push([+time.toFixed(3), +Math.min(1, flux[f] / (thr * 3)).toFixed(3), flux[f] > thr * 2.2 ? 1 : 0]); last = time; }
  }
}
const partEnergy = [];
for (let p = 0; p < 5; p++) {
  let sum = 0; const a = Math.floor((frames * p) / 5), b = Math.floor((frames * (p + 1)) / 5);
  for (let f = a; f < b; f++) sum += env[f];
  partEnergy.push(sum / Math.max(1, b - a) / max);
}
const dir = new URL('../public/tracks/', import.meta.url).pathname;
copyFileSync(input, join(dir, id + '.mp3'));
writeFileSync(join(dir, id + '.lights'), out);
writeFileSync(join(dir, id + '.json'), JSON.stringify({ duration: +(n / SR).toFixed(3), rate: s.rate, frames: s.frames, format: s.format, carriers: s.carriers, onsets, partEnergy }));
console.log('onsets', onsets.length, 'written', id);
