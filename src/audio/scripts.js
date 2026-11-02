// Voice scripts. All original writing.
//
// Format: one spoken line per row. A trailing [n] is the pause (seconds)
// after the line. Rows starting with @ are cues:
//   @dive <seconds> <intensity>   start a slow dive through the stars
//
// Each spoken line gets a stable id (<script>-<n>) so recorded voice clips
// can replace the device voice: see tools/generate-voice.mjs.

const RAW = {
  sleep: `
Hello. I'm glad you're here. [3]
Make yourself comfortable, the way you'd lie down at the end of a long, long day. [5]
There's nothing you need to do now. Nothing to get right. [4]
You can just listen to the sound of my voice, and the music, and let everything else drift. [5]
And if at any time you need to wake up, for any reason at all, you'll wake easily, fully alert, and feeling well. [5]
But for now, let your eyes close, if they haven't already. [6]
Take a slow breath in through your nose. [5]
And let it go, out through your mouth, like a long, quiet sigh. [6]
Again. Breathe in. [5]
And let it all go. [6]
That's it. Each breath out is a little heavier than the last. [6]
Now bring your attention to the top of your head. [4]
Imagine a warm, soft light resting there, the colour of the stars above you. [5]
Let that light melt down over your forehead, smoothing it. [5]
Over your eyes, so your eyelids grow heavy and still. [6]
Down through your cheeks and your jaw. Let your jaw drop, just a little. [6]
The warmth flows down your neck, and your shoulders let go. [5]
Down through your arms. Your elbows. Your wrists. All the way to the tips of your fingers. [7]
Your arms are so heavy now, it would be too much effort to lift them. And you don't need to. [7]
The warmth moves down through your chest, and your breathing slows all by itself. [6]
Through your stomach. Your lower back. Sinking down into the bed beneath you. [7]
Down through your hips. Your thighs. Your knees. [5]
Your calves. Your ankles. And out through the soles of your feet. [8]
Your whole body is heavy, and warm, and safe. [8]
In a moment, I'm going to count down from ten to one. [4]
With every number, you'll drift twice as deep. [4]
You don't have to try. Just let the numbers carry you, the way the tide carries a little boat. [6]
@dive 60 0.35
Ten. Drifting down, deeper and deeper. [6]
Nine. Every muscle softening, letting go. [6]
Eight. The sounds around you fading far away. [7]
Seven. Deeper still. Floating down through the stars. [7]
Six. So calm. So peaceful. [7]
Five. Halfway down, and twice as relaxed. [8]
Four. Your mind drifting like a cloud on a still night. [8]
Three. Deeper. [8]
Two. Almost there. [8]
One. [4]
Deep, deep asleep. Resting now. [10]
And while your body rests, your mind can keep drifting, out among the stars. [7]
Imagine you're floating on a soft, slow current of light. [7]
There's nowhere to go. Nothing to solve tonight. [7]
Any thought that comes, you can place it on a passing star, and watch it drift away. [9]
Tomorrow will take care of tomorrow. [8]
Tonight is only for rest. [9]
And every night from now on, when your head touches the pillow, your body will remember this feeling. [7]
Heavy. Warm. Safe. Drifting easily into deep, restful sleep. [9]
Sleeping soundly, all through the night. [8]
And waking in the morning at just the right time, refreshed, and clear, and glad to be alive. [9]
Your sleep is getting deeper. And deeper. And deeper. [10]
Sinking down. [10]
Drifting off. [12]
Sleep now. [14]
Sleep well. [20]
`,

  abundance: `
Hello again. Let's take the next few minutes, just for you. [4]
Settle in, and breathe slowly. In. [4]
And out. [5]
Imagine you're drifting through a quiet galaxy, gold and violet light all around you. [6]
Somewhere ahead there's a star that's brighter than the rest. It's been waiting for you. [6]
@dive 14 0.6
Let yourself move toward it, easily, the way a river finds the sea. [6]
As you get closer, you see it isn't a star at all. It's a doorway, glowing warm and golden. [6]
On the other side is a version of your life, a little further along. [5]
Step through. [6]
Notice where you are. The light. The colours. The air. [6]
This is a life where money comes to you easily, and often. [5]
Not as a struggle, but as a natural flow, like water running downhill. [6]
See yourself checking your accounts, and feeling calm. More than enough. [6]
Notice the feeling in your chest. That quiet ease. That sense of room to breathe. [7]
See yourself paying your bills without a second thought, and smiling as you do. [6]
Imagine treating the people you love. Giving freely, because there is plenty. [7]
Money is simply energy. It moves toward people who welcome it, and use it well. [6]
Say to yourself, quietly. I am open to receiving. [6]
I am worthy of abundance. [6]
Opportunities find me, and I notice them. [6]
I act on good ideas, and they grow. [6]
Feel how natural this is. As if it's already who you are. [7]
Now picture one small step you could take tomorrow. A call. An idea. An offer. [6]
See yourself taking it, with confidence. [6]
Abundance isn't only money. It's time, and love, and the freedom to choose. [6]
Let gratitude fill you now, for everything you already have. [6]
Because gratitude is the doorway that everything else walks through. [7]
In a moment you'll come back, carrying this feeling with you. [5]
And whenever you think of money in the days ahead, you'll feel this same calm, open ease. [6]
Take a deep breath in. [4]
And let it go. [5]
When you're ready, come back gently, knowing the door is always open. [8]
`,

  okay: `
Hiya. Come here and sit with me a minute. [4]
Whatever brought you here today, you don't have to explain it. [5]
Just breathe with me. In. [4]
And out. [5]
There. That's a little better already, isn't it. [5]
I want you to hear something, and really let it land. [4]
It's going to be okay. [6]
Maybe not this minute. Maybe not in the way you planned. [5]
But it is going to be okay. [6]
Look up at all those stars. Every one of them has burned through darker nights than this. [6]
And so have you. [6]
Think of all the times you were sure you couldn't get through something. [5]
And then you did. [5]
You're still here. Still breathing. Still finding your way. [6]
That's not luck, love. That's strength. [6]
You don't have to have it all figured out. Nobody does, not really. [5]
You only have to take the next small step. And then the next. [6]
@dive 12 0.45
Let the worry loosen its grip now. Just a little. [6]
Imagine handing it up to the night sky. It's big enough to hold it. [7]
There's an old Irish saying. We live in the shelter of each other. [5]
You are not alone in this. Not for a second. [6]
There are people who'd be so glad to help you carry it. Let them. [6]
And there's a part of you, deep down, that has always known how to heal. [6]
Trust that part. It's wiser than the worry. [6]
Things change. They always do. The tide goes out, and the tide comes back in. [6]
The morning always comes. [6]
So rest now. You've done enough for today. [6]
Breathe in. [4]
And let it go. [5]
Everything is going to be okay. [6]
You're going to be okay. [8]
I really believe that. [10]
`,
};

export const WELCOMES = [
  "You made it here. That's enough for today.",
  'Welcome back. Let the day fall off your shoulders now.',
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
  "It's grand. You're grand. Let that be the whole of it for now.",
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
      items.push({ mark: cmd, args: args.map(Number) });
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
  return out;
}
