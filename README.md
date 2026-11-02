# Stillpoint: XR meditation for Android XR

Stillpoint has nine generative soundscapes, one for each solfeggio frequency (174–963 Hz). Each one plays with spatial light scenes that are driven by the music as it plays.

## What's inside

**Music (`src/audio/`)**
- `tracks.js` holds the nine track recipes: frequency, scale, chord progression, tempo, binaural offset, breathing pattern, scene and colour palette.
- `composer.js` writes the music live. Each track has a fixed seed, so it keeps its character, but it never loops the same way twice. It includes:
  - The solfeggio tone as a pure sine, with an optional binaural beat (the right ear is offset by 3–8 Hz). This part is head-locked.
  - The musical root is an octave of the solfeggio frequency, so the tone and the music are always in tune with each other.
  - Warm pads are placed on a ring around you, glassy FM bells are placed by pitch (low notes on the left and below, high notes on the right and above), and there is a drone, a soft heartbeat pulse and a breath-noise guide.
  - Each session moves through five sections: **Arrive → Settle → Open → Deep → Return**. They scale to 5, 10 or 20 minutes.
- `engine.js` contains the master bus, a generated reverb, and an HRTF listener that follows your head. Sounds stay fixed in the room as you turn.
- **Bring your own AI track:** you can load an MP3 or WAV made with Suno, Udio and similar tools. It is analysed for onsets and dynamics, so the visuals follow it too. The solfeggio tone is layered underneath.

**Visuals (`src/visuals/`)**: every scene responds to the same timed events (`beat`, `bar`, `chord`, `note`, `section`) and to your breathing cycle.

| Scene | Used by | What follows the music |
|---|---|---|
| Light ocean | Ground 174 | A particle sea around you. Each note drops a ripple at the spot where its sound is placed, and accented beats lift the swell |
| Breathing orb | Mend 285, Connect 639 | The orb grows on the inhale. Notes flare the core and kick the halo that matches their pitch, and chords reverse the halos |
| Aurora | Release 396, Intuition 852 | Curtains overhead. Chords send a wave of light along them and notes light up the nearest fold |
| Sacred geometry | Undo 417, Crown 963 | The Flower of Life draws itself one section at a time, Metatron's Cube appears in Deep, and large solids step round on each bar |
| Lotus mandala | Bloom 528 | Petals open on the inhale. Rings turn on the bar and change direction on chords, and notes light petals |
| Cymatics | Clarity 741 | 9,000 grains settle into the Chladni pattern of each chord and are shaken by notes |

Every note also produces a small burst of light at its 3D audio position, so you see light where you hear the sound.

## Run it

```bash
npm install
npm run build        # -> dist/ (deployable PWA) and dist-single/index.html (single file)
npm run serve        # http://localhost:8080
```

On a flat screen you can drag to look around. Headphones help with the binaural beats.

## Put it on an Android XR headset

WebXR needs **HTTPS** (or localhost).

1. Host `dist/` on any static HTTPS host: GitHub Pages, Netlify, Cloudflare Pages or Firebase Hosting.
2. On the headset, open the URL in **Chrome**. Use **⋮ → Add to home screen / Install app**. Stillpoint then appears in your apps and works offline, because the service worker caches the whole app.
3. Choose **Enter immersive** for a full environment, or **Enter passthrough** to see the visuals in your room.
4. In the headset you point and pinch with your hands (a controller trigger also works). A small ☰ orb below your view brings the menu back during a session.

**Testing from your dev machine:** connect the headset over USB or wireless ADB, then run `adb reverse tcp:8080 tcp:8080` and open `http://localhost:8080` on the headset.

### Publishing on Google Play (optional)
Wrap the hosted PWA as a Trusted Web Activity with [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap):
```bash
npx @bubblewrap/cli init --manifest https://YOUR-DOMAIN/manifest.webmanifest
npx @bubblewrap/cli build
```
Upload the generated `.aab` to the Play Console. Add `/.well-known/assetlinks.json` to your site; Bubblewrap prints the contents for you.

## Customising

- **Add a track:** add an entry to `TRACKS` in `src/audio/tracks.js`. Scales live in `SCALES`. `progression` is a list of scale degrees, and `breath` is `[inhale, hold, exhale, rest]` in seconds.
- **Add a scene:** subclass `BaseScene` (`src/visuals/common.js`), handle `onEvent(e)` and `update(dt, t, state)`, then register it in `SCENE_TYPES` in `src/main.js`.
- **Change the session arc:** edit `ARC` in `tracks.js`.

## Notes

- The tracks are composed procedurally on the device. No audio files ship with the app and it needs no network connection.
- The solfeggio descriptions are the traditional associations from sound-healing practice, not medical claims.
- Tuned for Galaxy XR-class hardware. If a scene is heavy on other devices, reduce the particle counts in `ocean.js` (`N`) and `cymatics.js` (`N`).
