// Track library. Each track is a *generative* composition: the Composer reads
// this recipe and writes the music live, seeded so the same track always has
// the same character but never loops identically.
//
// Solfeggio associations below are the traditional ones used in sound-healing
// practice. They are descriptive, not medical claims.

export const SCALES = {
  majorPent: [0, 2, 4, 7, 9],
  minorPent: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  hirajoshi: [0, 2, 3, 7, 8],
};

// Sections are expressed as fractions of the session so any duration works.
// energy: pads/brightness, melody: note density, pulse: heartbeat thump, shimmer: high sparkles
// dive: length in bars of a deep dive launched as the section begins;
// diveChance: chance of a shorter dive every 8 bars inside the section.
const ARC = [
  { name: 'Arrive', frac: 0.12, energy: 0.25, melody: 0.0, pulse: 0.0, shimmer: 0.0 },
  { name: 'Settle', frac: 0.18, energy: 0.45, melody: 0.18, pulse: 0.0, shimmer: 0.1 },
  { name: 'Open', frac: 0.25, energy: 0.7, melody: 0.32, pulse: 0.5, shimmer: 0.3, dive: 4, diveAmt: 0.7 },
  { name: 'Deep', frac: 0.25, energy: 0.9, melody: 0.22, pulse: 0.8, shimmer: 0.6, dive: 6, diveAmt: 1, diveChance: 0.4 },
  { name: 'Return', frac: 0.2, energy: 0.35, melody: 0.1, pulse: 0.0, shimmer: 0.15 },
];

// Voice-led sessions: sparser music so the voice sits clearly on top.
const GUIDED_ARC = [
  { name: 'Arrive', frac: 0.12, energy: 0.3, melody: 0.04, pulse: 0, shimmer: 0 },
  { name: 'Settle', frac: 0.25, energy: 0.4, melody: 0.08, pulse: 0, shimmer: 0.1 },
  { name: 'Open', frac: 0.25, energy: 0.5, melody: 0.1, pulse: 0.25, shimmer: 0.2 },
  { name: 'Deep', frac: 0.25, energy: 0.55, melody: 0.08, pulse: 0.3, shimmer: 0.3 },
  { name: 'Return', frac: 0.13, energy: 0.35, melody: 0.05, pulse: 0, shimmer: 0.1 },
];

const SLEEP_ARC = [
  { name: 'Arrive', frac: 0.15, energy: 0.32, melody: 0.04, pulse: 0, shimmer: 0 },
  { name: 'Settle', frac: 0.2, energy: 0.28, melody: 0.05, pulse: 0, shimmer: 0.05 },
  { name: 'Descend', frac: 0.2, energy: 0.22, melody: 0.03, pulse: 0, shimmer: 0.05 },
  { name: 'Drift', frac: 0.25, energy: 0.16, melody: 0.02, pulse: 0, shimmer: 0 },
  { name: 'Sleep', frac: 0.2, energy: 0.08, melody: 0, pulse: 0, shimmer: 0 },
];

export const TRACKS = [
  {
    id: 'ground', title: 'Ground', freq: 174, intent: 'Foundation · ease',
    bpm: 52, scale: 'minorPent', progression: [0, 3, 1, 4], barsPerChord: 2,
    profile: 'relax', scene: 'ocean', seed: 174,
    palette: ['#0b1d3a', '#1f6f8b', '#99e1d9'], breath: [4, 2, 6, 1], arc: ARC,
  },
  {
    id: 'mend', title: 'Mend', freq: 285, intent: 'Restoration · renewal',
    bpm: 56, scale: 'majorPent', progression: [0, 2, 4, 1], barsPerChord: 2,
    profile: 'meditate', scene: 'galaxy', seed: 285,
    palette: ['#1a0f2e', '#7b4fa0', '#f5c6e6'], breath: [4, 4, 4, 4], arc: ARC,
  },
  {
    id: 'release', title: 'Release', freq: 396, intent: 'Letting go of fear',
    bpm: 58, scale: 'aeolian', progression: [0, 5, 3, 4], barsPerChord: 2,
    profile: 'relax', scene: 'aurora', seed: 396,
    palette: ['#050b1a', '#1ea896', '#b8f2e6'], breath: [4, 7, 8, 0], arc: ARC,
  },
  {
    id: 'undo', title: 'Undo', freq: 417, intent: 'Facilitating change',
    bpm: 60, scale: 'dorian', progression: [0, 3, 4, 6], barsPerChord: 2,
    profile: 'meditate', scene: 'geometry', seed: 417,
    palette: ['#120a1f', '#d4a373', '#fefae0'], breath: [5, 0, 5, 0], arc: ARC,
  },
  {
    id: 'bloom', title: 'Bloom', freq: 528, intent: 'Transformation · love',
    bpm: 60, scale: 'lydian', progression: [0, 4, 5, 2], barsPerChord: 2,
    profile: 'relax', scene: 'mandala', seed: 528,
    palette: ['#1b0a14', '#e07a5f', '#f9dcc4'], breath: [4, 2, 6, 0], arc: ARC,
  },
  {
    id: 'connect', title: 'Connect', freq: 639, intent: 'Harmony · relationships',
    bpm: 62, scale: 'majorPent', progression: [0, 3, 2, 4], barsPerChord: 2,
    profile: 'relax', scene: 'orb', seed: 639,
    palette: ['#071a1a', '#3a9d8f', '#f2e3bc'], breath: [5, 2, 5, 2], arc: ARC,
  },
  {
    id: 'clarity', title: 'Clarity', freq: 741, intent: 'Expression · solutions',
    bpm: 64, scale: 'hirajoshi', progression: [0, 2, 3, 1], barsPerChord: 2,
    profile: 'focus', scene: 'cymatics', seed: 741,
    palette: ['#03071e', '#4895ef', '#e0fbfc'], breath: [4, 4, 4, 4], arc: ARC,
  },
  {
    id: 'intuition', title: 'Intuition', freq: 852, intent: 'Inner sight',
    bpm: 56, scale: 'lydian', progression: [0, 1, 4, 3], barsPerChord: 2,
    profile: 'meditate', scene: 'galaxy', seed: 852,
    palette: ['#0d0221', '#9d4edd', '#c8f7ff'], breath: [4, 7, 8, 0], arc: ARC,
  },
  {
    id: 'crown', title: 'Crown', freq: 963, intent: 'Oneness · stillness',
    bpm: 50, scale: 'majorPent', progression: [0, 4, 2, 3], barsPerChord: 4,
    profile: 'meditate', scene: 'galaxy', seed: 963,
    palette: ['#05050f', '#c9a227', '#ffffff'], breath: [6, 2, 8, 2], arc: ARC,
  },
];

// Guided, voice-led sessions. Their length comes from the script.
export const GUIDED = [
  {
    id: 'sleep', title: 'Drift to Sleep', freq: 174, intent: 'Hypnotic sleep journey',
    guided: 'sleep', tail: 480, fadeOut: 40, bpm: 46, scale: 'minorPent', progression: [0, 3, 2, 1], barsPerChord: 4,
    profile: 'sleep', scene: 'galaxy', seed: 1174, dives: false,
    palette: ['#03030c', '#2b2d6e', '#9fb4ff'], breath: [4, 0, 8, 0], arc: SLEEP_ARC,
  },
  {
    id: 'abundance', title: 'Abundance', freq: 528, intent: 'Manifesting story · money',
    guided: 'abundance', tail: 40, bpm: 56, scale: 'lydian', progression: [0, 4, 1, 5], barsPerChord: 2,
    profile: 'meditate', scene: 'galaxy', seed: 1528,
    palette: ['#0f0817', '#b07d2b', '#ffe8a8'], breath: [4, 2, 6, 0], arc: GUIDED_ARC,
  },
  {
    id: 'okay', title: "It's Going to Be Okay", freq: 639, intent: 'Comfort & reassurance',
    guided: 'okay', tail: 40, bpm: 54, scale: 'majorPent', progression: [0, 3, 1, 2], barsPerChord: 2,
    profile: 'relax', scene: 'orb', seed: 1639,
    palette: ['#060f17', '#3a8fb7', '#ffd9c2'], breath: [4, 2, 6, 0], arc: GUIDED_ARC,
  },
];

export const SOLFEGGIO = [174, 285, 396, 417, 528, 639, 741, 852, 963];

export const SCENES = ['galaxy', 'ocean', 'orb', 'aurora', 'geometry', 'mandala', 'cymatics'];
