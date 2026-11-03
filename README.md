# MindLyte: XR meditation for Android XR

**Live:** https://brightscene.github.io/androidxr/

MindLyte is a meditation app for Android XR. You drift slowly through a field of stars and galaxies under a turning, projector-style nebula. Underneath plays generative music tuned to the nine solfeggio frequencies, with optional brainwave tones. Now and then a soft voice speaks. At certain points in the music the journey surges forward into a deep dive through the stars, then settles back to a drift.

## Journeys

**Guided (voice-led)**

| | Length | Brainwave journey |
|---|---|---|
| **Drift to Sleep**: a hypnotic sleep script. It relaxes you head to toe, counts you down from ten to one, gives sleep suggestions, and then fades out without waking you | ~11 min of voice, then 8 min of music fading out | theta → delta |
| **Abundance**: a manifestation story. You travel toward a golden star doorway and step into a life where money comes easily | ~6 min | deep theta |
| **It's Going to Be Okay**: comfort and reassurance | ~6 min | alpha → theta |

**Light & sound** (built-in, with the light signals decoded ahead of time):
- *Oceamniotic*: AudioStrobe on a 19.5 kHz carrier. Left light about 8 Hz, right about 4 Hz. 16 min.
- *Lost Worlds Discovery 3*: **SpectraStrobe**, full colour (18.2 kHz reference plus R/G/B tones), mostly deep blue and violet. Runs 10 Hz → 5 Hz → 23–37 Hz → back to 10 Hz. 30 min.
- *Midnight · Level One*: AudioStrobe at 19.2 kHz, a theta meditation going 10 → 6.4 → 4 Hz. 30 min.

 The audio streams from `public/tracks/`, and the light data was decoded ahead of time into `oceamniotic.lights`, so the track starts straight away. To add more light tracks, put an entry in `LIGHT_TRACKS` in `src/audio/tracks.js`.

**Soundscapes**: nine generative tracks, one for each solfeggio frequency from 174 to 963 Hz, each 5–30 minutes long. With *Whispers* switched on, the guide voice says a short, thoughtful line every couple of minutes.

## What makes it tick

**The voyage** (`src/visuals/voyage.js`, `world.js`, `scenes/galaxy.js`)
- You move slowly forward through a deep star field. A domain-warped nebula and twinkling "laser" stars turn overhead, like a star projector on a ceiling.
- Spiral galaxies drift past you. One huge galaxy turns slowly overhead. Chord changes send a glow out along the spiral arms, and beats pulse the galaxy cores.
- **Deep dives** are tied to the music. One starts as the *Open* and *Deep* sections begin, and shorter ones can follow inside *Deep*. Guided scripts trigger them too, for example during the sleep countdown. Each dive has a whoosh riser and a low sub drop in the audio, and on screen the stars stretch into streaks. A comfort vignette closes in during a dive. **Dives** can be set to *Gentle* (the default), *Full speed* or *Off*. Use *Off* if you're prone to motion sickness.

**Brainwave tones** (`src/audio/entrainment.js`), inspired by long-form descending-carrier programmes
- *Binaural* (needs headphones), *Isochronic* (smoothly pulsed, works on speakers) or *Both*.
- Over the session the beat rate glides slowly: **Relax** (alpha → theta), **Meditate** (deep theta), **Sleep** (theta → delta) or **Focus**. The carrier tone is an octave of the track's solfeggio frequency, so it is always in tune with the music.
- Optional **soft rain** or **ocean** nature bed.

**The voice** (`src/audio/voice.js`, `scripts.js`)
- All the scripts are original and live in `src/audio/scripts.js`. They're easy to edit: one line per row, with `[n]` setting the pause in seconds after a line and `@dive seconds intensity` starting a dive.
- **Recorded narration (default):** every line is pre-recorded with **Kokoro**, an open-source neural voice (*af_heart*, a warm, unhurried female voice), at a slow pace. Each clip gets light processing (a little warmth, softened sibilance, even loudness) and plays centred and close, with the music dipping gently underneath. To regenerate the clips, for example with a different voice or pace, run `tools/generate-voice-kokoro.py`.
- **The scripts are written to be spoken slowly and warmly,** with plain words, invitations rather than instructions, and lots of silence. They also **steer the scene as they go:** *Drift to Sleep* moves from a moonlit lotus pond out into the stars as the countdown starts, then slowly dims toward darkness. *Abundance* rises from a golden meadow toward a golden star and through into floating islands. *It's Going to Be Okay* sits on the beach, where a set of waves rolls in as you're asked to breathe with them and the sea calms as you hand it your worries.
- If the recordings aren't available, MindLyte falls back to the device's own text-to-speech. It picks an **Irish English (en-IE)** voice if the device has one, and otherwise the closest British-Isles female voice. You can choose a different voice under *Voice*.
- **For a real Irish voice**, record every line once with ElevenLabs, which has Irish-accented voices in its Voice Library:
  ```bash
  ELEVENLABS_API_KEY=your_key node tools/generate-voice.mjs --voice <voice_id> --name "Aoife"
  git add public/voice && git commit -m "Add recorded voice" && git push
  ```
  The app then uses the recordings automatically. They play spatially, just in front of you.
- The music ducks gently whenever the voice speaks.

**Lights: AudioStrobe® and SpectraStrobe™ decoding** (`src/audio/strobe.js`, `src/visuals/strobe.js`)
- Light-and-sound tracks hide their light signals as near-inaudible tones in the audio. When you import a track (*Bring your own AI track*), MindLyte scans 17.5–20.6 kHz and works out which format the track uses:
  - **AudioStrobe**: a single carrier, normally 19.2 kHz. Other frequencies are detected automatically too, such as the 19.5 kHz used by *Oceamniotic*. Its level in the left and right channels sets the left and right light.
  - **SpectraStrobe**: an 18.2 kHz reference tone plus red at 18.7, green at 19.2 and blue at 19.7 kHz, giving full colour in each eye. Each colour is scaled against the reference tone.
- Each tone is demodulated (complex heterodyne, low-pass, then 500 Hz control frames). A 16-minute track decodes in a few seconds.
- **Solid lights:** a **glowing orb** (solid filled disc, the brightest option), a **chrome ball** (mirrored silver sphere that floods with colour on each flash), a **neon ring** or a faceted **crystal**. There's one per light channel.
- **Show:** symbol plus glow, symbol only, soft glow, **LED starfield** (NeuroVizr-style: a wide dome of about 400 LEDs, left half driven by the left channel and right half by the right) or **LED panel** (Pandora Star-style: one large round disc packed with LED rings, left half and right half).
- **Two symbols, side by side** (the default): the left and right light channels each drive their own symbol, about 2.6 m in front of you. Each symbol flashes at exactly the encoded rate and colour.
- **Each eye sees only its own light** (headset only): like LEDs in light glasses, the left eye sees only the left-channel symbol or LEDs and the right eye only the right.
- **Dim background** (Off to 85%, default 50%): darkens the scene behind the lights so the colours stand out.
- **Symbols:** Flower of Life, Sri Yantra, Lotus, Merkaba, Ripples and Seed of Life (or cycle through them all).
- **AudioStrobe colours** (AudioStrobe carries no colour information, only brightness). All are fully saturated: Vivid magenta/cyan (the default), track palette, warm white, amber, violet/green or slow rainbow.
- **Brightness** limit, and **Exact** or **Softened** flashing.
- The control tones are notched out of what you hear. MindLyte's own tones are switched off on light tracks, because those tracks carry their own entrainment programme.
- Optional: *Also pulse lights with MindLyte's brainwave tones*, which flashes the lights at the current binaural/isochronic beat on the generated tracks.
- ⚠️ Lights stay off until the photosensitivity warning has been accepted. This happens once, either on screen or in the headset.

**Background** (on the *Scene* tab in the headset, or *Scene, sound & journey* on the flat screen): *Auto* uses each track's own scene. You can also force any scene for every track (Galaxy voyage, Light ocean, Breathing orb, Aurora, Sacred geometry, Lotus mandala, Cymatics), choose **Stars only** for a still, quiet sky, or choose **Off** for pure black (in passthrough, just your room), leaving only the lights.

**27 scenes** (`src/visuals/scenes/`, registered in `scenes/index.js`). Ideas were drawn from the best VR meditation apps: nature places that react to the audio, dreamlike abstract worlds that follow your breath, and a world that grows as you practise. Everything is written from scratch and generated procedurally.
- **Nature:** Meadow (wind waves through the grass, gusts on chord changes, drifting clouds), White beach (waves roll in, break into foam and wash up the sand), Underwater kelp forest, Zen garden (raked sand, cherry blossom, lanterns; the blossom fills out as the session deepens), Glowing forest, Bamboo grove, Snowy peaks, Desert night (shooting stars on some notes).
- **Sky & water:** Cloud flight (fly through cumulus, towers, layers and wisps, with a soft white-out inside a cloud), Floating islands, Lantern lake, Rain on the lake (from a wooden jetty), Lotus pond (flowers open as you breathe in, and more bloom each section), Light ocean.
- **Space:** Galaxy voyage, Moon view (ringed gas giant, a blue world, a red planet and a spiral galaxy), Black hole, Nebula drift, Light ribbons, Aurora.
- **Mind:** Fractal tunnel, Crystal cave, Chakras (the seven chakras light in turn, one per bar), Breathing orb, Lotus mandala, Sacred geometry, Cymatics.
- **Simple:** Stars only, Off.

Each soundscape has its own default scene, for example Ground → Meadow, Undo → Zen garden, Connect → Lotus pond and Crown → Moon view. *It's Going to Be Okay* uses the beach.

**Smoothness:** procedural noise is baked into a 3D texture, so skies, water and clouds cost a fraction of what they did. Foveated rendering is kept light, so the edges of your view don't look blocky. A frame-rate governor in the headset quietly lowers detail if frames start to drop. You can also choose **Visual quality: Smooth / Balanced / Sharp**. A filmic grade with dithering keeps dark gradients from banding.

**The other scenes** (light ocean, breathing orb, aurora, sacred geometry, lotus mandala, cymatics) are all still included. The voyage now runs behind every one of them.

## Run locally

```bash
npm install
npm run build        # -> dist/ (deployable PWA) and dist-single/index.html (single file)
npm run serve        # http://localhost:8080
```

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages, using `.github/workflows/pages.yml`.

To use it on the headset, open the live link in **Chrome**, then choose **⋮ → Install app**. Inside the app, choose **Enter immersive** for full VR or **Enter passthrough** to see it in your room.

**In immersive mode**, point and pinch to make selections. The headset menu has four tabs:
- **Journeys**: every guided journey and soundscape, plus any track you imported before going immersive.
- **Sound**: length, brainwave tones, brainwave journey, nature bed, deep dives, solfeggio tone and volume.
- **Lights**: lights on/off (with the safety warning the first time), symbol or glow, which symbol, colours, exact or softened flashing, brightness, and pulsing with the brainwave tones.
- **Voice**: whispers, captions, choice of guide voice and a voice preview.

During a session, **pinch on empty space** (or pinch the ☰ Menu orb below your view) to bring the menu back.

Your settings are remembered on the device.

## Notes
- The music is composed live on the device, so the app works offline once it has been installed.
- The solfeggio and brainwave descriptions are traditional and popular associations, not medical claims. Don't use the sleep or brainwave tracks while driving.
