import { createPlanner, buildICS, timeLabel } from './planner.js';
import { GROUP, MEMBER_COLORS, SCRIPT } from './script.js';

const $ = (sel) => document.querySelector(sel);
const chat = $('#chat');
const log = $('#log');
const logEmpty = $('#log-empty');
const suggest = $('#suggest');
const suggestText = $('#suggest-text');
const pinned = $('#pinned');
const pinnedText = $('#pinned-text');
const playBtn = $('#play');
const stepBtn = $('#step');
const input = $('#composer-input');

const ME = 'You';
const TYPING_MS = 950;
const GAP_MS = 650;

const HIGHLIGHT_RE = new RegExp(
  [
    String.raw`\b(?:today|tonight|tmr|tmrw|tomorrow|weekend|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)\b`,
    String.raw`\b\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)\b`,
    String.raw`\b(?:bangsar|klcc|pavilion|mid ?valley|trx|ss2|jalan alor|sunway|petaling street|chinatown|damansara)\b`,
  ].join('|'),
  'gi',
);

let state;

function freshState(mode) {
  return {
    mode,
    planner: createPlanner({ now: new Date(), members: GROUP.members }),
    scriptIndex: 0,
    playing: false,
    timer: null,
    typingEl: null,
    lastAuthor: null,
    clock: 20 * 60 + 5, // messages start at 20:05
    suggestionShown: false,
    suggestionDismissed: false,
    planCard: null,
    planCreatedAt: null,
    myPlace: null,
  };
}

/* ---------- helpers ---------- */
function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function highlight(text) {
  return escapeHTML(text).replace(HIGHLIGHT_RE, (m) => `<mark class="hl">${m}</mark>`);
}

function initials(name) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function clockLabel(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function scrollChat(el) {
  // Scroll only inside the chat, never the page around it.
  const top = el ? el.offsetTop - chat.offsetTop - 8 : chat.scrollHeight;
  chat.scrollTo({ top, behavior: 'smooth' });
}

function addSystemChip(text) {
  const chip = document.createElement('div');
  chip.className = 'sys-chip';
  chip.textContent = text;
  chat.append(chip);
  state.lastAuthor = null;
  scrollChat();
}

/* ---------- messages ---------- */
function renderMessage({ author, text }) {
  const mine = author === ME;
  const el = document.createElement('div');
  el.className = `msg ${mine ? 'out' : 'in'}${state.lastAuthor !== author ? ' first' : ''}`;
  const who =
    !mine && state.lastAuthor !== author
      ? `<span class="who" style="color:${MEMBER_COLORS[author] || '#555'}">${escapeHTML(author)}</span>`
      : '';
  state.clock += 1;
  el.innerHTML = `${who}${highlight(text)}<span class="meta">${clockLabel(state.clock)}${
    mine ? '<span class="ticks">✓✓</span>' : ''
  }</span>`;
  chat.append(el);
  state.lastAuthor = author;
  scrollChat();
}

function postMessage(message) {
  removeTyping();
  renderMessage(message);
  const result = state.planner.ingest(message);
  if (state.mode === 'after') {
    logDetections(message, result.detections);
    if (result.intentTriggered || (state.planner.getPlan().intent && !state.suggestionShown)) {
      showSuggestion();
    }
    if (state.planCard) {
      // The live plan travels with the conversation so it's always in view.
      chat.append(state.planCard);
      state.lastAuthor = null;
      updatePlanCard(true);
      scrollChat();
    }
  }
  updateScoreboard();
}

function showTyping(author) {
  removeTyping();
  const el = document.createElement('div');
  el.className = 'typing';
  el.innerHTML = `${escapeHTML(author)} is typing<i></i><i></i><i></i>`;
  chat.append(el);
  state.typingEl = el;
  scrollChat();
}

function removeTyping() {
  if (state.typingEl) {
    state.typingEl.remove();
    state.typingEl = null;
  }
}

/* ---------- under-the-hood log ---------- */
function logDetections({ author, text }, detections) {
  logEmpty.hidden = true;
  const li = document.createElement('li');
  const unique = [];
  const seen = new Set();
  for (const d of detections) {
    const k = `${d.type}:${d.label}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(d);
    }
  }
  if (unique.some((d) => d.type === 'trigger')) li.className = 'trigger';
  const tags = unique.length
    ? unique.map((d) => `<span class="tag ${d.type}">${escapeHTML(d.label)}</span>`).join('')
    : '<span class="tag none">nothing plan-related</span>';
  const short = text.length > 46 ? `${text.slice(0, 44)}…` : text;
  li.innerHTML = `<span class="said"><b>${escapeHTML(author)}</b> “${escapeHTML(short)}”</span><span class="tags">${tags}</span>`;
  log.append(li);
  log.scrollTop = log.scrollHeight;
}

/* ---------- suggestion ---------- */
function showSuggestion() {
  if (state.suggestionShown || state.suggestionDismissed || state.planCard) return;
  state.suggestionShown = true;
  const { activity } = state.planner.getPlan();
  suggestText.textContent = `Looks like you're planning ${activity.label.toLowerCase()}. Turn it into a plan?`;
  suggest.hidden = false;
}

function hideSuggestion() {
  suggest.hidden = true;
}

/* ---------- plan card ---------- */
function personChip(name, status) {
  const color = MEMBER_COLORS[name] || '#888';
  return `<span class="person ${status}"><span class="dot" style="background:${color}">${initials(name)}</span>${escapeHTML(name)}</span>`;
}

function planCardHTML(plan) {
  const { best, bestPlace } = plan;
  const where = bestPlace ? ` · ${escapeHTML(bestPlace.name)}` : '';
  const when = best
    ? `${best.dayLabel}, ${timeLabel(best.time)}${best.timeIsSuggested ? ' (suggested)' : ''}${where}`
    : 'Pick a day below';
  const myVote = best ? best.votes[ME] : undefined;
  const total = plan.members.length;
  const disabled = plan.locked ? 'disabled' : '';

  const people = [
    ...plan.going.map((n) => personChip(n, 'yes')),
    ...plan.pending.map((n) => personChip(n, 'pending')),
    ...plan.cantMake.map((n) => personChip(n, 'no')),
  ].join('');

  const slots = plan.slots
    .map((s, i) => {
      const pct = Math.round((s.yes / total) * 100);
      const nope = s.no ? `<span class="nope">${s.no} can't</span>` : '';
      return `<li class="option"><button type="button" class="option-btn${i === 0 ? ' leading' : ''}${
        s.votes[ME] === 'yes' ? ' mine' : ''
      }" data-slot="${s.key}" ${disabled} aria-pressed="${s.votes[ME] === 'yes'}">
        <span class="bar" style="width:${pct}%"></span>
        <span>${s.dayLabel}, ${timeLabel(s.time)}${nope}</span>
        <span class="count">${s.votes[ME] === 'yes' ? '<span class="tick" aria-label="your choice">✓</span>' : ''}${s.yes} going</span>
      </button></li>`;
    })
    .join('');

  const places = plan.places
    .map(
      (p, i) => `<li class="option"><button type="button" class="option-btn${i === 0 ? ' leading' : ''}${
        p.voters.includes(ME) ? ' mine' : ''
      }" data-place="${escapeHTML(p.name)}" ${disabled} aria-pressed="${p.voters.includes(ME)}">
        <span class="bar" style="width:${Math.round((p.votes / total) * 100)}%"></span>
        <span>${escapeHTML(p.name)}</span>
        <span class="count">${p.voters.includes(ME) ? '<span class="tick" aria-label="your choice">✓</span>' : ''}${p.votes} ${p.votes === 1 ? 'vote' : 'votes'}</span>
      </button></li>`,
    )
    .join('');

  const actions = plan.locked
    ? `<button type="button" class="wide is-on" data-act="ics">Add to calendar</button>`
    : `<button type="button" data-act="yes" class="${myVote === 'yes' ? 'is-on' : ''}" ${best ? '' : 'disabled'}>I'm going</button>
       <button type="button" data-act="no" class="${myVote === 'no' ? 'is-on' : ''}" ${best ? '' : 'disabled'}>Can't make it</button>
       <button type="button" class="wide" data-act="lock" ${best ? '' : 'disabled'}>Lock plan and add to calendar</button>`;

  return `
    <div class="plan-head">
      <div class="plan-kicker"><span>📅 Plan from this chat</span><span>${plan.locked ? '🔒 Locked' : '● Live'}</span></div>
      <div class="plan-title">${plan.activity.emoji} ${escapeHTML(plan.activity.label)}</div>
      <div class="plan-when">${when}</div>
    </div>
    <div class="plan-section">
      <h4>Who's in for ${best ? best.dayLabel : 'it'}</h4>
      <div class="people">${people}</div>
    </div>
    ${slots ? `<div class="plan-section"><h4>When</h4><ul class="options">${slots}</ul></div>` : ''}
    ${places ? `<div class="plan-section"><h4>Where</h4><ul class="options">${places}</ul></div>` : ''}
    <div class="plan-actions">${actions}</div>
    <div class="plan-foot">${
      plan.locked ? 'Locked by You. Everyone can add it to their calendar.' : 'Keeps updating as the group chats. Tap an option to vote.'
    }</div>`;
}

function createPlanCard() {
  hideSuggestion();
  if (state.planCard) return;
  addSystemChip('You turned this conversation into a plan');
  const card = document.createElement('section');
  card.className = 'plan';
  card.setAttribute('aria-label', 'Plan');
  chat.append(card);
  state.planCard = card;
  state.planCreatedAt = state.planner.getPlan().messageCount;
  state.lastAuthor = null;
  updatePlanCard(false);
  scrollChat(card);
  updateScoreboard();
}

function updatePlanCard(flash) {
  const plan = state.planner.getPlan();
  state.planCard.innerHTML = planCardHTML(plan);
  if (flash) {
    state.planCard.classList.remove('flash');
    void state.planCard.offsetWidth;
    state.planCard.classList.add('flash');
  }
  updatePinned(plan);
}

function updatePinned(plan) {
  if (!plan.best) {
    pinned.hidden = true;
    return;
  }
  const place = plan.bestPlace ? ` · ${escapeHTML(plan.bestPlace.name)}` : '';
  pinnedText.innerHTML = `<b>${plan.activity.emoji} ${escapeHTML(plan.activity.label)}</b> · ${plan.best.dayLabel}, ${timeLabel(
    plan.best.time,
  )}${place} · ${plan.going.length} going${plan.locked ? ' · 🔒' : ''}`;
  pinned.hidden = false;
}

function downloadICS(plan) {
  const ics = buildICS(plan);
  if (!ics) return;
  const blob = new Blob([ics], { type: 'text/calendar' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${plan.activity.label.toLowerCase().replace(/\s+/g, '-')}-plan.ics`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

chat.addEventListener('click', (e) => {
  const btn = e.target.closest('.plan button');
  if (!btn || btn.disabled) return;
  const plan = state.planner.getPlan();
  if (btn.dataset.slot) {
    const current = plan.slots.find((s) => s.key === btn.dataset.slot)?.votes[ME];
    state.planner.rsvp(ME, btn.dataset.slot, current === 'yes' ? 'no' : 'yes');
  } else if (btn.dataset.place) {
    state.planner.votePlace(ME, btn.dataset.place);
  } else if (btn.dataset.act === 'yes' || btn.dataset.act === 'no') {
    state.planner.rsvp(ME, plan.best.key, btn.dataset.act);
  } else if (btn.dataset.act === 'lock') {
    const locked = state.planner.lock();
    updatePlanCard(true);
    const place = locked.bestPlace ? ` at ${locked.bestPlace.name}` : '';
    addSystemChip(`You locked the plan: ${locked.activity.label}, ${locked.best.dayLabel}, ${timeLabel(locked.best.time)}${place}`);
    downloadICS(locked);
    return;
  } else if (btn.dataset.act === 'ics') {
    downloadICS(plan);
    return;
  }
  updatePlanCard(true);
});

pinned.addEventListener('click', () => state.planCard && scrollChat(state.planCard));
$('#suggest-go').addEventListener('click', createPlanCard);
$('#suggest-x').addEventListener('click', () => {
  state.suggestionDismissed = true;
  hideSuggestion();
});

/* ---------- scoreboard ---------- */
function updateScoreboard() {
  const plan = state.planner.getPlan();
  $('#stat-messages').textContent = plan.messageCount;
  if (state.mode === 'before') {
    $('#stat-label').textContent = 'Event created';
    $('#stat-plan').textContent = plan.messageCount ? 'No' : '—';
  } else {
    $('#stat-label').textContent = 'Messages until a plan';
    $('#stat-plan').textContent = state.planCreatedAt ? String(state.planCreatedAt) : plan.intent ? '…' : '—';
  }
}

/* ---------- playback ---------- */
function nextScripted(withTyping) {
  if (state.scriptIndex >= SCRIPT.length) {
    stopPlaying();
    return;
  }
  const msg = SCRIPT[state.scriptIndex++];
  if (!withTyping) {
    postMessage(msg);
    if (state.scriptIndex >= SCRIPT.length) stopPlaying();
    return;
  }
  showTyping(msg.author);
  state.timer = setTimeout(() => {
    postMessage(msg);
    if (state.scriptIndex >= SCRIPT.length) {
      stopPlaying();
      return;
    }
    state.timer = setTimeout(() => state.playing && nextScripted(true), GAP_MS);
  }, TYPING_MS);
}

function startPlaying() {
  if (state.scriptIndex >= SCRIPT.length) return;
  state.playing = true;
  playBtn.textContent = 'Pause';
  nextScripted(true);
}

function stopPlaying() {
  state.playing = false;
  clearTimeout(state.timer);
  removeTyping();
  const done = state.scriptIndex >= SCRIPT.length;
  playBtn.textContent = done ? 'Conversation finished' : 'Keep playing';
  playBtn.disabled = done;
  stepBtn.disabled = done;
}

playBtn.addEventListener('click', () => (state.playing ? stopPlaying() : startPlaying()));
stepBtn.addEventListener('click', () => {
  if (state.playing) stopPlaying();
  nextScripted(false);
  if (state.scriptIndex < SCRIPT.length) playBtn.textContent = 'Keep playing';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' && document.activeElement !== input) {
    e.preventDefault();
    stepBtn.click();
  }
});

$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  postMessage({ author: ME, text });
});

/* ---------- mode + reset ---------- */
function reset(mode = state?.mode || 'after') {
  if (state) clearTimeout(state.timer);
  state = freshState(mode);
  document.body.dataset.mode = mode;
  document.querySelectorAll('.mode-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === mode)));
  chat.querySelectorAll('.msg, .plan, .sys-chip, .typing').forEach((n) => n.remove());
  log.innerHTML = '';
  logEmpty.hidden = false;
  logEmpty.textContent =
    mode === 'before'
      ? "In today's WhatsApp nothing reads the conversation for plans. Someone has to scroll back, work out who said what, and create the event by hand."
      : "Press play. Each message's dates, times, places and replies show up here as they're understood.";
  $('.e2e-chip').textContent =
    mode === 'before'
      ? 'Messages and calls are end-to-end encrypted.'
      : 'Messages are end-to-end encrypted. Plans reads them on your phone only.';
  hideSuggestion();
  pinned.hidden = true;
  playBtn.textContent = 'Play the conversation';
  playBtn.disabled = false;
  stepBtn.disabled = false;
  updateScoreboard();
}

document.querySelectorAll('.mode-btn').forEach((b) => b.addEventListener('click', () => reset(b.dataset.mode)));
$('#reset').addEventListener('click', () => reset());

$('#group-name').textContent = GROUP.name;
$('#group-members').textContent = GROUP.members.join(', ');

const params = new URLSearchParams(location.search);
reset(params.get('mode') === 'before' ? 'before' : 'after');
if (params.has('autoplay')) startPlaying();
