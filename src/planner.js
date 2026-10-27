/**
 * Plans engine — turns a messy group-chat conversation into a structured plan.
 *
 * Deliberately rule-based and deterministic: it runs fully on-device, needs no
 * API key, never sends message text anywhere, and behaves identically on every
 * demo run. Each message is split into clauses; each clause is scanned for an
 * activity, days, times, places and availability ("can't", "ok", "👍"), and
 * those signals update a live plan: candidate time slots with per-person RSVPs
 * and candidate places with votes.
 */

const DAY_INDEX = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

const DAY_PATTERNS = [
  { re: /\b(today|tonight|tdy)\b/i, offset: 0 },
  { re: /\b(tomorrow|tmr|tmrw|tml)\b/i, offset: 1 },
  { re: /\b(this )?weekend\b/i, weekday: 6 },
  { re: /\b(sunday|sun)\b/i, weekday: 0 },
  { re: /\b(monday|mon)\b/i, weekday: 1 },
  { re: /\b(tuesday|tues|tue)\b/i, weekday: 2 },
  { re: /\b(wednesday|wed)\b/i, weekday: 3 },
  { re: /\b(thursday|thurs|thur|thu)\b/i, weekday: 4 },
  { re: /\b(friday|fri)\b/i, weekday: 5 },
  { re: /\b(saturday|sat)\b/i, weekday: 6 },
];

const ACTIVITIES = [
  { re: /\b(dinner|makan malam)\b/i, label: 'Dinner', emoji: '🍜', defaultTime: '19:30' },
  { re: /\b(makan|eat out|food hunt)\b/i, label: 'Makan', emoji: '🍜', defaultTime: '19:30' },
  { re: /\blunch\b/i, label: 'Lunch', emoji: '🥗', defaultTime: '12:30' },
  { re: /\bbrunch\b/i, label: 'Brunch', emoji: '🥞', defaultTime: '11:00' },
  { re: /\bbreakfast\b/i, label: 'Breakfast', emoji: '☕', defaultTime: '09:00' },
  { re: /\b(supper|mamak)\b/i, label: 'Supper', emoji: '🫓', defaultTime: '22:00' },
  { re: /\b(movie|movies|wayang|cinema)\b/i, label: 'Movie', emoji: '🎬', defaultTime: '20:00' },
  { re: /\b(karaoke|ktv)\b/i, label: 'Karaoke', emoji: '🎤', defaultTime: '20:00' },
  { re: /\b(bbq|barbecue)\b/i, label: 'BBQ', emoji: '🔥', defaultTime: '18:00' },
  { re: /\b(coffee|kopi|cafe|café)\b/i, label: 'Coffee', emoji: '☕', defaultTime: '15:00' },
  { re: /\b(hike|hiking)\b/i, label: 'Hike', emoji: '🥾', defaultTime: '07:00' },
  { re: /\b(futsal|badminton|bowling)\b/i, label: 'Game night', emoji: '🏸', defaultTime: '20:00' },
  { re: /\bstudy (session|group)\b/i, label: 'Study session', emoji: '📚', defaultTime: '14:00' },
];

const PLACES = [
  { name: 'Bangsar', re: /\bbangsar\b/i },
  { name: 'KLCC', re: /\bklcc\b/i },
  { name: 'Pavilion', re: /\bpavilion\b/i },
  { name: 'Mid Valley', re: /\b(mid ?valley|mv)\b/i },
  { name: 'TRX', re: /\btrx\b/i },
  { name: 'SS2', re: /\bss2\b/i },
  { name: 'Jalan Alor', re: /\b(jalan|jln) alor\b/i },
  { name: 'Sunway Pyramid', re: /\bsunway\b/i },
  { name: 'Petaling Street', re: /\b(petaling (street|st)|chinatown)\b/i },
  { name: 'Damansara', re: /\bdamansara\b/i },
];

const PLANNING_RE = /\b(free|meet|meetup|hang ?out|lepak|jom|catch up|plan|anyone keen|who's in|whos in)\b/i;
const NEGATIVE_RE = /(can['’]?t|cannot|can not|not free|busy|unable|won['’]?t make|no la|nope|not coming|skip|out of town)/i;
const POSITIVE_RE = /(\byes\b|\byup\b|\bya\b|\bok\b|\bokay\b|\bokok\b|\bworks\b|\bcan\b|\bi['’]?m in\b|\bim in\b|\bcount me in\b|\bsure\b|\bconfirm\b|\bfree\b|👍|🙋|\+1)/i;
const TIME_RE = /\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/gi;
// Split into clauses on punctuation, but keep "7.30pm" intact.
const CLAUSE_SPLIT_RE = /(?<!\d)\.(?!\d)|[,!?;\n]+|\bbut\b|\bthen\b/i;

const INTENT_THRESHOLD = 3;

function pad(n) {
  return String(n).padStart(2, '0');
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, n) {
  const r = startOfDay(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isoDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(date) {
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeLabel(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${pad(m)}${suffix}` : `${h12}${suffix}`;
}

/** Find every day reference in a piece of text and resolve it to a date. */
export function parseDays(text, now) {
  const found = [];
  const seen = new Set();
  for (const p of DAY_PATTERNS) {
    if (!p.re.test(text)) continue;
    let date;
    if (p.offset !== undefined) {
      date = addDays(now, p.offset);
    } else {
      const diff = (p.weekday - now.getDay() + 7) % 7;
      date = addDays(now, diff);
    }
    const key = isoDate(date);
    if (!seen.has(key)) {
      seen.add(key);
      found.push({ key, date });
    }
  }
  return found;
}

/** Return the last explicit clock time in the text as "HH:MM", or null. */
export function parseTime(text) {
  let last = null;
  for (const m of text.matchAll(TIME_RE)) {
    let h = Number(m[1]);
    const min = m[2] ? Number(m[2]) : 0;
    const ampm = m[3].toLowerCase();
    if (h < 1 || h > 12 || min > 59) continue;
    if (ampm === 'pm' && h !== 12) h += 12;
    if (ampm === 'am' && h === 12) h = 0;
    last = `${pad(h)}:${pad(min)}`;
  }
  return last;
}

export function parseActivity(text) {
  return ACTIVITIES.find((a) => a.re.test(text)) || null;
}

export function parsePlaces(text) {
  return PLACES.filter((p) => p.re.test(text))
    .map((p) => ({ name: p.name, index: text.search(p.re) }))
    .sort((a, b) => a.index - b.index)
    .map((p) => p.name);
}

export function classifyAvailability(text) {
  if (NEGATIVE_RE.test(text)) return 'no';
  if (POSITIVE_RE.test(text)) return 'yes';
  return null;
}

export function splitClauses(text) {
  return text
    .split(CLAUSE_SPLIT_RE)
    .map((c) => (c || '').trim())
    .filter(Boolean);
}

export function createPlanner({ now = new Date(), members = [] } = {}) {
  const state = {
    now,
    members: [...members],
    activity: null,
    intentScore: 0,
    intent: false,
    slots: new Map(), // key -> { key, date, time, timeSource, votes: Map(name -> 'yes'|'no'), mentionedAt }
    places: new Map(), // name -> { name, voters: Set, addedAt }
    focusSlot: null,
    messageCount: 0,
    messagesSinceIntent: 0,
    locked: false,
  };

  function ensureMember(name) {
    if (name && !state.members.includes(name)) state.members.push(name);
  }

  function ensureSlot(key, date) {
    if (!state.slots.has(key)) {
      state.slots.set(key, {
        key,
        date,
        time: null,
        timeSource: null,
        votes: new Map(),
        mentionedAt: state.messageCount,
      });
    }
    const slot = state.slots.get(key);
    slot.mentionedAt = state.messageCount;
    return slot;
  }

  function ensurePlace(name) {
    if (!state.places.has(name)) {
      state.places.set(name, { name, voters: new Set(), addedAt: state.places.size });
    }
    return state.places.get(name);
  }

  function setPlaceVote(author, name) {
    for (const p of state.places.values()) p.voters.delete(author);
    ensurePlace(name).voters.add(author);
  }

  /** Feed one chat message in; returns what was detected (for the "under the hood" log). */
  function ingest({ author, text }) {
    state.messageCount += 1;
    if (state.intent) state.messagesSinceIntent += 1;
    ensureMember(author);
    const detections = [];
    const wasIntent = state.intent;

    // --- message-level signals ---
    const activity = parseActivity(text);
    if (activity) {
      if (!state.activity) state.activity = activity;
      detections.push({ type: 'activity', label: `${activity.emoji} ${activity.label}` });
    }
    if (PLANNING_RE.test(text)) detections.push({ type: 'intent', label: 'planning language' });

    const messageDays = parseDays(text, state.now);
    const time = parseTime(text);

    // --- clause-level signals (days + availability + places) ---
    let placeVoted = false;
    for (const clause of splitClauses(text)) {
      const days = parseDays(clause, state.now);
      const availability = classifyAvailability(clause);
      const places = parsePlaces(clause);

      for (const d of days) {
        const slot = ensureSlot(d.key, d.date);
        const vote = availability === 'no' ? 'no' : 'yes';
        slot.votes.set(author, vote);
        state.focusSlot = d.key;
        detections.push({ type: 'day', label: dayLabel(d.date) });
        detections.push({ type: vote, label: `${author} ${vote === 'yes' ? '✓' : '✗'} ${dayLabel(d.date)}` });
      }

      if (!days.length && availability && state.focusSlot) {
        const slot = state.slots.get(state.focusSlot);
        slot.votes.set(author, availability);
        detections.push({
          type: availability,
          label: `${author} ${availability === 'yes' ? '✓' : '✗'} ${dayLabel(slot.date)}`,
        });
      }

      if (places.length) {
        const isOptionList = places.length > 1 && /\bor\b/i.test(clause);
        if (isOptionList) {
          places.forEach(ensurePlace);
          detections.push({ type: 'place', label: `options: ${places.join(' / ')}` });
        } else if (!placeVoted) {
          setPlaceVote(author, places[0]);
          placeVoted = true;
          detections.push({ type: 'place', label: `${author} → ${places[0]}` });
        }
      }
    }

    if (time) {
      const targets = messageDays.length ? messageDays.map((d) => d.key) : state.focusSlot ? [state.focusSlot] : [];
      for (const key of targets) {
        const slot = state.slots.get(key);
        slot.time = time;
        slot.timeSource = author;
      }
      detections.push({ type: 'time', label: timeLabel(time) });
    }

    // --- intent scoring ---
    let score = 0;
    if (activity) score += 2;
    if (messageDays.length) score += 1;
    if (detections.some((d) => d.type === 'place')) score += 1;
    if (PLANNING_RE.test(text)) score += 1;
    state.intentScore += score;
    if (!state.intent && state.intentScore >= INTENT_THRESHOLD) {
      state.intent = true;
      detections.push({ type: 'trigger', label: 'Planning detected → suggest a Plan' });
    }

    return { detections, intentTriggered: !wasIntent && state.intent };
  }

  function rsvp(author, slotKey, vote) {
    const slot = state.slots.get(slotKey);
    if (!slot) return;
    ensureMember(author);
    slot.votes.set(author, vote);
  }

  function votePlace(author, name) {
    ensureMember(author);
    setPlaceVote(author, name);
  }

  function rankedSlots() {
    const tally = (s) => {
      let yes = 0;
      let no = 0;
      for (const v of s.votes.values()) v === 'yes' ? yes++ : no++;
      return { yes, no };
    };
    return [...state.slots.values()]
      .map((s) => ({ ...s, ...tally(s) }))
      .sort((a, b) => b.yes - a.yes || a.no - b.no || b.mentionedAt - a.mentionedAt);
  }

  function rankedPlaces() {
    return [...state.places.values()].sort((a, b) => b.voters.size - a.voters.size || a.addedAt - b.addedAt);
  }

  function getPlan() {
    const slots = rankedSlots().map((s) => ({
      key: s.key,
      date: s.date,
      dayLabel: dayLabel(s.date),
      time: s.time || state.activity?.defaultTime || '19:30',
      timeIsSuggested: !s.time,
      yes: s.yes,
      no: s.no,
      votes: Object.fromEntries(s.votes),
    }));
    const places = rankedPlaces().map((p) => ({ name: p.name, votes: p.voters.size, voters: [...p.voters] }));
    const best = slots[0] || null;
    const bestPlace = places[0] || null;
    const going = best ? Object.entries(best.votes).filter(([, v]) => v === 'yes').map(([n]) => n) : [];
    const cantMake = best ? Object.entries(best.votes).filter(([, v]) => v === 'no').map(([n]) => n) : [];
    const pending = state.members.filter((m) => !going.includes(m) && !cantMake.includes(m));
    const activity = state.activity || { label: 'Hangout', emoji: '📅', defaultTime: '19:30' };
    return {
      intent: state.intent,
      locked: state.locked,
      activity,
      title: activity.label,
      slots,
      places,
      best,
      bestPlace,
      going,
      cantMake,
      pending,
      members: [...state.members],
      messageCount: state.messageCount,
      messagesSinceIntent: state.messagesSinceIntent,
    };
  }

  function lock() {
    state.locked = true;
    return getPlan();
  }

  return { ingest, rsvp, votePlace, getPlan, lock };
}

/** Build an iCalendar (.ics) file for the locked plan. Times are local (floating). */
export function buildICS(plan, { durationMinutes = 120, uid = `plan-${Date.now()}@plans-demo` } = {}) {
  if (!plan.best) return null;
  const [h, m] = plan.best.time.split(':').map(Number);
  const start = new Date(plan.best.date);
  start.setHours(h, m, 0, 0);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  const fmt = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const location = plan.bestPlace ? plan.bestPlace.name : '';
  const desc = `Going: ${plan.going.join(', ') || '—'}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plans concept demo//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${plan.activity.label}${location ? ` @ ${location}` : ''}`,
    location ? `LOCATION:${location}` : null,
    `DESCRIPTION:${desc}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');
}
