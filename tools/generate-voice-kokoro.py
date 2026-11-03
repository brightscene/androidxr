"""Record every MindLyte line with Kokoro (open-source neural TTS, Apache-2.0).

Setup (once):
  python3 -m venv .venv && .venv/bin/pip install kokoro-onnx soundfile
  download kokoro-v1.0.onnx and voices-v1.0.bin from
  https://github.com/thewh1teagle/kokoro-onnx/releases (model-files-v1.0)
  node -e "import('./src/audio/scripts.js').then(m=>require('fs').writeFileSync('lines.json', JSON.stringify(m.allLines())))"

Run:
  .venv/bin/python tools/generate-voice-kokoro.py --model kokoro-v1.0.onnx --voices voices-v1.0.bin [--voice af_heart] [--speed 0.8]

Each line is rendered slowly in a warm voice, then gently processed with ffmpeg
(a little low warmth, softened sibilance, even loudness, soft fade-out) and saved
as public/voice/<id>.mp3 with a manifest the app picks up automatically.
Delete a clip to re-render just that line.
"""
import argparse, json, os, subprocess, soundfile as sf
from kokoro_onnx import Kokoro

ap = argparse.ArgumentParser()
ap.add_argument('--model', required=True); ap.add_argument('--voices', required=True)
ap.add_argument('--lines', default='lines.json'); ap.add_argument('--out', default='public/voice')
ap.add_argument('--voice', default='af_heart'); ap.add_argument('--speed', type=float, default=0.8)
ap.add_argument('--name', default='Calm narrator')
a = ap.parse_args()
lines = json.load(open(a.lines))
os.makedirs(a.out, exist_ok=True)
k = Kokoro(a.model, a.voices)
FILTER = ('highpass=f=70,equalizer=f=170:t=q:w=1.0:g=2.5,equalizer=f=3200:t=q:w=1.2:g=-1.5,'
          'equalizer=f=7000:t=q:w=1.5:g=-3.5,deesser=i=0.4,loudnorm=I=-19:TP=-2:LRA=7,'
          'afade=t=in:d=0.04,areverse,afade=t=in:d=0.35,areverse,adelay=60')
for i, l in enumerate(lines):
    mp3 = os.path.join(a.out, l['id'] + '.mp3')
    if os.path.exists(mp3): continue
    samples, sr = k.create(l['text'], voice=a.voice, speed=a.speed, lang='en-us')
    wav = mp3[:-4] + '.wav'
    sf.write(wav, samples, sr)
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-af', FILTER, '-ar', '44100', '-ac', '1', '-b:a', '80k', mp3], check=True)
    os.remove(wav)
    print(f"{i + 1}/{len(lines)} {l['id']}")
ids = [l['id'] for l in lines if os.path.exists(os.path.join(a.out, l['id'] + '.mp3'))]
json.dump({'voiceName': a.name, 'clips': ids}, open(os.path.join(a.out, 'manifest.json'), 'w'), indent=1)
print('manifest lists', len(ids), 'clips')
