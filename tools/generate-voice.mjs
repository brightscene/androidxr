// Record every spoken line in MindLyte with a real Irish voice.
//
// Uses ElevenLabs text-to-speech (their Voice Library has many Irish-accented
// voices). Clips are written to public/voice/<id>.mp3 plus a manifest; the app
// then uses them automatically instead of the device voice.
//
//   ELEVENLABS_API_KEY=xxxx node tools/generate-voice.mjs --voice <voice_id> [--name "Aoife"] [--only sleep]
//
// Re-running skips clips that already exist (delete a file to redo it).

import { mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { allLines } from '../src/audio/scripts.js';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), [])
);
const key = process.env.ELEVENLABS_API_KEY;
const voice = args.voice;
if (!key || !voice) {
  console.error('Usage: ELEVENLABS_API_KEY=... node tools/generate-voice.mjs --voice <voice_id> [--name "Voice name"] [--only sleep|abundance|okay|whisper|welcome]');
  process.exit(1);
}

const outDir = new URL('../public/voice/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const lines = allLines().filter((l) => !args.only || l.id.startsWith(args.only));

for (const [i, line] of lines.entries()) {
  const file = new URL(`${line.id}.mp3`, outDir);
  if (existsSync(file)) continue;
  process.stdout.write(`[${i + 1}/${lines.length}] ${line.id}  `);
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: line.text,
      model_id: args.model || 'eleven_multilingual_v2',
      // slow, soft and steady suits meditation
      voice_settings: { stability: 0.7, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: 0.88 },
    }),
  });
  if (!res.ok) {
    console.error(`failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log('ok');
}

const all = allLines().map((l) => l.id).filter((id) => existsSync(new URL(`${id}.mp3`, outDir)));
writeFileSync(new URL('manifest.json', outDir), JSON.stringify({ voiceName: args.name || 'Recorded voice', clips: all }, null, 2));
console.log(`\nmanifest.json lists ${all.length} clips. Rebuild (npm run build) and redeploy.`);
