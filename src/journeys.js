// The journeys on offer: a free set, and the rest with MindLyte Premium.
// A journey is a track (its sound, voice and lights) paired with its world.
import { TRACKS, GUIDED, LIGHT_TRACKS } from './audio/tracks.js';

export const PRICES = { month: '£4.99 / month', year: '£39.99 / year' };

const base = (id) => TRACKS.find((t) => t.id === id) || TRACKS[0];
const freeOne = (id, title, intent, scene, from, palette) => ({ ...base(from), id, title, intent, scene, palette, free: true });

export function buildJourneys() {
  const free = [
    freeOne('j-galaxy', 'Galaxy voyage', 'Drift through a spiral galaxy', 'galaxy', 'bloom', ['#04061a', '#3b2a8a', '#9fc4ff']),
    freeOne('j-nebula', 'Nebula drift', 'Float through glowing nebula clouds', 'nebula', 'connect', ['#0a0418', '#6a2a8a', '#ffb0e0']),
    freeOne('j-stars', 'White stars', 'A living night sky, the Milky Way and shooting stars', 'stars', 'ground', ['#020308', '#2a2f4a', '#e8ecff']),
    freeOne('j-bluestars', 'Blue stars', 'Blue stars all around, drifting past you', 'bluestars', 'intuition', ['#010414', '#1a3a8a', '#8fc0ff']),
    freeOne('j-starsaura', 'White stars with aura', 'Stars beneath soft curtains of coloured light', 'starsaura', 'crown', ['#05030f', '#4a2a7a', '#7ff0d8']),
    freeOne('j-bluestarsaura', 'Blue stars with aura', 'Blue stars and drifting aura light', 'bluestarsaura', 'clarity', ['#02051a', '#2a3a9a', '#d08fff']),
    freeOne('j-greenstarsaura', 'Green stars with aura', 'Green stars under curtains of green and teal light', 'greenstarsaura', 'mend', ['#02100a', '#1e7a55', '#9ff5c8']),
    freeOne('j-neonstarsaura', 'Neon stars with amber aura', 'Neon stars drifting past beneath an amber aura', 'neonstarsaura', 'release', ['#0c0414', '#8a3a1a', '#ffd27a']),
  ];
  const special = [
    { ...base('clarity'), id: 'j-cycle', title: 'Image cycling', intent: 'Time-line images of your best future, faster and faster', scene: 'cycle', palette: ['#0a0a1a', '#6a3aa8', '#ffd6a0'] },
    { ...base('reiki'), id: 'j-affirmtrace', title: 'Trace your affirmations', intent: 'Trace short affirmations with your finger, then hear them spoken', scene: 'affirmtrace', palette: ['#120a1f', '#b07d2b', '#ffe8a8'] },
    { ...base('bloom'), id: 'j-affirm', title: 'Affirmation field', intent: 'Words of affirmation lift off a field of light', scene: 'affirm', palette: ['#06061a', '#3a5aa8', '#ffe0b0'] },
  ];
  const premium = [...LIGHT_TRACKS, ...GUIDED, ...special, ...TRACKS].map((t) => { t.free = false; return t; });
  return { free, premium, all: [...free, ...premium] };
}

// Premium access. Real payments aren't connected yet; for testing on your own
// device, open the app once with ?premium=1 (and ?premium=0 to lock again).
export function premiumUnlocked() {
  try {
    const q = new URLSearchParams(location.search).get('premium');
    if (q === '1') localStorage.setItem('mindlyte-premium', '1');
    if (q === '0') localStorage.removeItem('mindlyte-premium');
    return localStorage.getItem('mindlyte-premium') === '1';
  } catch { return false; }
}
