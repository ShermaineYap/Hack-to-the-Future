// The scripted group conversation used in the demo. Every message is plain
// text — the Plans engine reads it exactly as it would read a real chat.
export const GROUP = {
  name: 'Uni Kakis 🎓',
  members: ['Aisyah', 'Wei Jie', 'Priya', 'Daniel', 'You'],
};

export const MEMBER_COLORS = {
  Aisyah: '#e542a3',
  'Wei Jie': '#1f7aec',
  Priya: '#d97706',
  Daniel: '#0f9d58',
  You: '#7c3aed',
};

export const SCRIPT = [
  { author: 'Aisyah', text: 'Guys, dinner this week before finals? 🍜' },
  { author: 'Wei Jie', text: 'Yes!! Fri?' },
  { author: 'Priya', text: "Can't fri, got lab report due 😭 sat?" },
  { author: 'Daniel', text: 'Sat works for me' },
  { author: 'Wei Jie', text: 'sat ok also. where? bangsar or klcc?' },
  { author: 'Aisyah', text: 'Bangsar pls, KLCC parking is pain' },
  { author: 'Priya', text: 'bangsar 👍 7.30pm?' },
  { author: 'Daniel', text: '8pm better, I finish work late' },
  { author: 'Aisyah', text: 'ok 8pm sat at bangsar then' },
];
