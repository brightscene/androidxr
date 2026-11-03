// Voice scripts. All original writing.
//
// Written to be spoken slowly and warmly: plain words, invitations rather
// than instructions, short phrases and plenty of silence.
//
// Format: one spoken line per row. A trailing [n] is the pause (seconds)
// after the line. Rows starting with @ are cues that weave the scene into
// the meditation:
//   @scene <name>                 move to another scene (when Background is Auto)
//   @cue <name>                   a scene moment: wave, calm (beach), gust (meadow), bloom (lotus)
//   @dive <seconds> <intensity>   a slow dive through the stars
//   @dim <0..1> <seconds>         slowly dim the whole view (for sleep)
//
// Each spoken line gets a stable id (<script>-<n>) so recorded voice clips
// can replace the device voice: see tools/generate-voice.mjs.

import { AFFIRMATIONS } from './affirmations.js';

const RAW = {
  sleep: `
@scene lotus
Hello, and welcome. [3]
This is your time to rest. [4]
Let yourself settle in, in whatever way feels comfortable tonight. [5]
You don't need to do this well. [2]
There's nothing to get right. [5]
And if you need to wake at any point, you'll wake easily, clear and comfortable. [4]
For now, let your eyes soften, and close. [6]
Picture the water in front of you, still and dark, holding the moon. [6]
And notice your breath, just as it is. [6]
Breathe in slowly through your nose. [5]
And let it go, long and soft, through your mouth. [7]
Once more. Breathing in. [5]
And out, a little slower than before. [8]
Let your breathing find its own easy rhythm now. You don't have to manage it at all. [8]
Bring your attention to your face. [4]
Let your forehead be smooth. [4]
Let the little muscles around your eyes go soft. [5]
Unclench your jaw, and let your tongue rest. [6]
Feel your shoulders. [3]
And see if they can drop, just a little further. [6]
Your arms are heavy now. [3]
Your hands are open, and still. [7]
Feel the gentle rise and fall of your chest. [4]
It has carried you all day. [6]
Let your belly be soft. [6]
Feel the weight of your hips, sinking down into the bed. [5]
Your legs, heavy and warm. [4]
Your feet, completely at rest. [8]
Your whole body is held now. [4]
There's nothing left to hold up. [8]
@cue bloom
In a moment, I'll count slowly down from ten to one. [4]
With each number, you might drift a little deeper. [4]
And if your mind wanders, that's perfectly fine. Just let the numbers find you again. [6]
@scene galaxy
@dive 70 0.3
Ten. [4]
Letting go. [6]
Nine. [4]
Deeper, and softer. [6]
Eight. [4]
The day is behind you now. [7]
Seven. [4]
Floating, among the stars. [7]
Six. [4]
Nothing to do. [7]
Five. [4]
Nowhere to be. [8]
Four. [4]
So heavy. So peaceful. [8]
Three. [6]
Two. [6]
One. [8]
Resting now. [10]
And as you rest, you might picture a soft light far above you, like a single star. [7]
It isn't going anywhere. [4]
It's simply keeping watch while you sleep. [9]
Any thoughts that come can drift past, like slow clouds across the night. [8]
You don't need to follow them. [9]
Tomorrow can take care of itself. [8]
Tonight, you're allowed to rest completely. [10]
@dim 0.6 90
Your body knows how to sleep. [5]
It has always known. [9]
Each breath, a little slower. [8]
A little deeper. [10]
And whenever you lie down from now on, your body will remember this ease. [9]
Heavy. [6]
Warm. [6]
Safe. [10]
Sleeping deeply, all through the night. [9]
And waking, when it's time, rested and clear. [12]
@scene stars
@dim 0.88 180
Sleep now. [16]
Sleep well. [25]
`,

  abundance: `
@scene meadow
Welcome. [3]
Take a moment to arrive. [5]
Feel the ground beneath you, and the warm air on your skin. [5]
@cue gust
Listen to the wind moving through the grass. [6]
Breathe in slowly. [4]
And let it out. [6]
Let your shoulders soften, and your face relax. [6]
For the next few minutes, we'll spend some time with the feeling of having enough. [4]
More than enough. [6]
Look up into the sky, and notice one star glowing a soft, warm gold. [5]
@scene galaxy
@dive 16 0.6
Let it draw you gently upward, out past the clouds, into the quiet of space. [8]
The star grows warmer as you come closer. [5]
And you realise it's a doorway, glowing with golden light. [6]
On the other side is your life, a little further along. [5]
Take your time. [3]
And when you're ready, step through. [6]
@scene meadow
Look around. [4]
Notice how open and calm everything feels here. [5]
This is a life where money moves toward you easily. [5]
Not as a struggle, but as a steady flow, like a river finding its way to the sea. [6]
Picture opening your accounts, and feeling a quiet ease. [4]
There is plenty. [6]
Notice where you feel that ease in your body. [4]
Maybe in your chest. Maybe in your breath. [6]
See yourself paying what you owe, gladly, and with time to spare. [6]
See yourself sharing with the people you love. [4]
Giving, because there's enough to give. [7]
Money is a kind of energy. [4]
It grows where it's welcomed, and used with care. [6]
Let these words land softly. [4]
I am open to receiving. [6]
I am worthy of good things. [6]
Opportunities find me, and I notice them. [6]
I take simple steps, and they grow. [7]
Now picture one small, real step you could take tomorrow. [5]
Maybe a call. An idea. An offer. [6]
See yourself taking it, steady and sure. [7]
Abundance isn't only money. [3]
It's time. It's love. It's the freedom to choose. [7]
@scene meadow
Let a feeling of gratitude rise up, for everything that's already here. [6]
Gratitude is the door that everything else walks through. [7]
Take a deep breath in. [4]
And let it go. [6]
Carry this ease with you into your day. [5]
And whenever money comes to mind, you can come back to this calm, open feeling. [7]
When you're ready, gently open your eyes. [8]
`,

  okay: `
@scene beach
Hi. [2]
I'm glad you're here. [4]
Come and sit with me for a little while, by the water. [5]
Whatever brought you here today, you don't have to explain it. [6]
Just listen to the waves for a moment. [8]
@cue wave
Breathe in with the wave as it rises. [5]
And breathe out as it spills up onto the sand. [7]
@cue wave
Again. Breathing in. [5]
And out. [8]
There. [3]
A little softer already. [6]
I want to tell you something, and I'd like you to really let it in. [4]
It's going to be okay. [8]
Maybe not this minute. Maybe not in the way you planned. [5]
But it is going to be okay. [8]
Look at the ocean. [3]
It has met every storm there's ever been. [4]
And it's still here. [6]
So are you. [7]
Think of the hard days you've already come through. [4]
The ones you weren't sure you would. [6]
And yet, here you are. [4]
Still breathing. Still finding your way. [7]
That isn't luck. [3]
That's strength. [7]
You don't have to have it all worked out. [4]
Nobody does, not really. [6]
You only need the next small step. [4]
And then the one after that. [7]
@cue calm
Let the worry loosen its grip, just a little. [6]
Imagine handing it to the sea. [4]
Watch the water carry it away. [8]
There's an old Irish saying. We live in the shelter of each other. [5]
You're not alone in this. [4]
Not for a moment. [6]
There are people who would be so glad to help you carry it. [4]
Let them. [7]
@cue wave
The tide goes out. [4]
And the tide comes back in. [5]
It always does. [7]
Things change. [4]
Even this. [8]
Breathe in. [4]
And let it go. [7]
Everything is going to be okay. [6]
You're going to be okay. [9]
I really believe that. [12]
`,
};

export const WELCOMES = [
  "You made it here. That's enough for today.",
  'Welcome back. Let the day slip off your shoulders.',
  "There's nowhere else you need to be. Just here.",
];

export const WHISPERS = [
  "You don't have to carry it all at once. Just this breath.",
  'The stars you are looking at were shining long before your worries were born. They will shine long after.',
  "Rest isn't a reward. It's part of the work.",
  "You're allowed to be a work in progress and a masterpiece at the same time.",
  'Every wave goes back to the ocean. So will this feeling.',
  "Be gentle with yourself. You're doing better than you think.",
  'Nothing in nature blooms all year. You don\'t have to either.',
  'Some days the bravest thing you can do is soften.',
  'The mind is like water. Leave it still, and it clears all by itself.',
  "You're made of the same stuff as the stars. No wonder you long to shine.",
  "What's for you won't go by you.",
  'Let go of the shore. The water will hold you.',
  'Breathe in, and let this moment be enough.',
  "You were never behind. You're right on time for your own life.",
  "The quiet isn't empty. It's full of answers.",
  'Your heart has been beating for you all day without being asked. Thank it.',
  "You're doing fine. Really. Let that be enough for now.",
  'A thought is only a cloud. Watch it pass. The sky is still there.',
  "You don't need to fix anything right now. Just notice.",
  'Some of the light you can see tonight left its star thousands of years ago, just to reach you.',
  "There's a calm inside you that has never once been disturbed.",
  'Small steps, taken gently, still cross the whole world.',
  'May the road rise to meet you. And may you let it.',
  'Kindness is never wasted. Start with yourself.',
  "Let the old stories go quiet. You're writing a new one.",
  'Even the moon takes its time to become full.',
  "Joy doesn't have to be earned. You can simply let it in.",
  "You're held by more than you know.",
  'The present moment is the only place life has ever happened.',
  'Slow down. The good things are walking toward you too.',
  "You've survived every hard day so far. That's a perfect record.",
  "Soften your jaw. Drop your shoulders. There. That's better.",
  'In the end, what matters most is how well you loved.',
  "There's no rush, love. The universe has been patient with you for billions of years.",
  'Let it be easy. Just this once, let it be easy.',
  "There's an old Irish saying. We live in the shelter of each other.",
];

// ---------------------------------------------------------------- parsing
function parse(key, raw) {
  const items = [];
  let n = 0;
  for (const rowRaw of raw.split('\n')) {
    const row = rowRaw.trim();
    if (!row) continue;
    if (row.startsWith('@')) {
      const [cmd, ...args] = row.slice(1).split(/\s+/);
      items.push({ mark: cmd, args: args.map((a) => (isNaN(+a) ? a : +a)) });
      continue;
    }
    const m = row.match(/^(.*?)\s*\[(\d+(?:\.\d+)?)\]\s*$/);
    items.push({ id: `${key}-${++n}`, text: m ? m[1] : row, pause: m ? Number(m[2]) : 2.5 });
  }
  return items;
}

export const SCRIPTS = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, parse(k, v)]));

// Rough length at the device voice's slow speaking rate.
export function estimateSeconds(items, wpm = 125, startDelay = 12) {
  let s = startDelay;
  for (const it of items) if (it.text) s += (it.text.split(/\s+/).length / wpm) * 60 + 0.4 + it.pause;
  return s;
}

// Every spoken line in the app with its id (for the recording tool).
export function allLines() {
  const out = [];
  for (const items of Object.values(SCRIPTS)) for (const it of items) if (it.text) out.push({ id: it.id, text: it.text });
  WELCOMES.forEach((text, i) => out.push({ id: `welcome-${i + 1}`, text }));
  WHISPERS.forEach((text, i) => out.push({ id: `whisper-${i + 1}`, text }));
  AFFIRMATIONS.forEach((set, i) => set.forEach((text, j) => out.push({ id: `aff-${i + 1}-${j + 1}`, text })));
  return out;
}
