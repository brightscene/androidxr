// Exports the journey and scene catalogue for the native Android XR app,
// so both apps list the same journeys, scenes, colours and previews.
// Run: node tools/export-native.mjs  (writes android-native/app/src/main/assets/catalog.json)
import fs from 'fs';
import { buildJourneys } from '../src/journeys.js';

const SITE = 'https://brightscene.github.io/androidxr/';
const src = fs.readFileSync(new URL('../src/visuals/scenes/index.js', import.meta.url), 'utf8');
const scenes = [];
for (const m of src.matchAll(/^\s+(\w+): \{ type: \w+, label: '((?:[^'\\]|\\.)*)', group: '([^']+)'(.*)\},?$/gm)) {
  if (/hidden: true|premium: true/.test(m[4])) continue;
  scenes.push({ id: m[1], label: m[2].replace(/\\'/g, "'"), group: m[3] });
}
const pal = JSON.parse(fs.readFileSync(new URL('../src/ui/scenePalettes.json', import.meta.url), 'utf8'));
for (const s of scenes) s.palette = pal[s.id] || ['#0a0a1a', '#3a3a7a', '#c0c8ff'];

const J = buildJourneys();
const kind = (t) => (t.free ? 'Free' : t.plain ? 'Music' : t.stream ? 'Light & sound' : t.guided ? `Guided · ~${Math.round(t.estimate / 60)} min` : `Soundscape · ${t.freq} Hz`);
const one = (t) => ({
  id: t.id, title: t.title, intent: t.intent, scene: t.scene, palette: t.palette, free: !!t.free, kind: kind(t),
  freq: t.freq || 0, audio: t.stream ? SITE + t.stream : null,
});
const out = { site: SITE, journeys: { free: J.free.map(one), premium: J.premium.map(one) }, scenes };
const dir = new URL('../android-native/app/src/main/assets/', import.meta.url);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(new URL('catalog.json', dir), JSON.stringify(out, null, 1));
console.log(`catalog: ${out.journeys.free.length} free, ${out.journeys.premium.length} premium journeys, ${scenes.length} scenes`);
