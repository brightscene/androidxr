// Affirmations, grouped by the arc of a session:
//   Arrive: calm and safety · Settle: self-worth · Open: possibility
//   Deep: love and wholeness · Return: hope and tomorrow
export const AFFIRMATIONS = [
  ['You are safe here', 'Peace begins with this breath', 'Let it be easy', 'Calm is your home', 'You are allowed to rest', 'It\'s okay to slow down', 'All is well'],
  ['You are enough', 'You are worthy of good things', 'Be gentle with yourself', 'You deserve kindness', 'Your light matters', 'You belong here', 'You are growing'],
  ['Everything is possible', 'Your dreams are valid', 'Good things are coming', 'Trust the timing of your life', 'You can begin again', 'There is so much ahead of you', 'Small steps are still steps'],
  ['You are loved', 'You are whole', 'Love surrounds you', 'You are not alone', 'Your heart knows the way', 'You are made of stardust', 'You shine'],
  ['Tomorrow will be a better day', 'Every day is a fresh start', 'Hope is always here', 'Joy is finding you', 'You are stronger than you know', 'You are exactly where you need to be', 'Today, I choose peace'],
];

// clip id for a recorded affirmation
export const affirmationId = (text) => {
  for (let i = 0; i < AFFIRMATIONS.length; i++) { const j = AFFIRMATIONS[i].indexOf(text); if (j >= 0) return `aff-${i + 1}-${j + 1}`; }
  return null;
};

// Affirmation tracing: short lines you trace with your finger, then hear read back.
export const TRACE_AFFIRMATIONS = [
  'You are enough', 'I am amazing', 'I am full of energy', 'I am calm', 'I am loved', 'I believe in myself',
  'I am strong', 'I am grateful', 'I choose joy', 'I am at peace', 'I trust myself', 'I shine bright',
  'I am safe', 'I am worthy', 'Today is a gift', 'I am becoming',
];
export const traceId = (i) => `trace-${i + 1}`;
