import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlanner,
  parseDays,
  parseTime,
  parsePlaces,
  classifyAvailability,
  splitClauses,
  buildICS,
} from '../src/planner.js';
import { SCRIPT, GROUP } from '../src/script.js';

// Tuesday 27 Oct 2026
const NOW = new Date(2026, 9, 27, 20, 0);

test('resolves weekday names to the next occurrence', () => {
  const [fri] = parseDays('Fri?', NOW);
  assert.equal(fri.key, '2026-10-30');
  const [sat] = parseDays('saturday night', NOW);
  assert.equal(sat.key, '2026-10-31');
  const [tue] = parseDays('tue', NOW);
  assert.equal(tue.key, '2026-10-27', 'same weekday means today');
  const [tmr] = parseDays('tmr can?', NOW);
  assert.equal(tmr.key, '2026-10-28');
});

test('does not treat words containing day names as days', () => {
  assert.equal(parseDays('the satay was great', NOW).length, 0);
  assert.equal(parseDays('monster energy', NOW).length, 0);
});

test('parses times including dot separators', () => {
  assert.equal(parseTime('7.30pm?'), '19:30');
  assert.equal(parseTime('8pm better'), '20:00');
  assert.equal(parseTime('12pm lunch'), '12:00');
  assert.equal(parseTime('10:15 am'), '10:15');
  assert.equal(parseTime('no time here'), null);
});

test('keeps 7.30pm intact when splitting clauses', () => {
  assert.deepEqual(splitClauses('bangsar 👍 7.30pm?'), ['bangsar 👍 7.30pm']);
  assert.deepEqual(splitClauses("Can't fri, sat?"), ["Can't fri", 'sat']);
});

test('classifies availability, negatives win over "can"', () => {
  assert.equal(classifyAvailability("Can't fri"), 'no');
  assert.equal(classifyAvailability('cant la'), 'no');
  assert.equal(classifyAvailability('sat ok also'), 'yes');
  assert.equal(classifyAvailability('count me in'), 'yes');
  assert.equal(classifyAvailability('where ah'), null);
});

test('finds places in order of mention', () => {
  assert.deepEqual(parsePlaces('Bangsar pls, KLCC parking is pain'), ['Bangsar', 'KLCC']);
});

test('the demo conversation produces the right plan', () => {
  const planner = createPlanner({ now: NOW, members: GROUP.members });
  let triggeredAt = null;
  SCRIPT.forEach((m, i) => {
    const { intentTriggered } = planner.ingest(m);
    if (intentTriggered && triggeredAt === null) triggeredAt = i;
  });
  const plan = planner.getPlan();

  assert.equal(triggeredAt, 1, 'planning is detected by the second message');
  assert.equal(plan.title, 'Dinner');
  assert.equal(plan.best.key, '2026-10-31', 'Saturday wins');
  assert.equal(plan.best.time, '20:00', 'latest agreed time wins');
  assert.equal(plan.bestPlace.name, 'Bangsar');
  assert.deepEqual(plan.going.sort(), ['Aisyah', 'Daniel', 'Priya', 'Wei Jie']);
  assert.deepEqual(plan.pending, ['You']);

  const fri = plan.slots.find((s) => s.key === '2026-10-30');
  assert.equal(fri.votes.Priya, 'no');
  assert.equal(fri.votes['Wei Jie'], 'yes');
});

test('RSVPs and place votes from the Plan card update the plan', () => {
  const planner = createPlanner({ now: NOW, members: GROUP.members });
  SCRIPT.forEach((m) => planner.ingest(m));
  planner.rsvp('You', '2026-10-31', 'yes');
  planner.votePlace('You', 'KLCC');
  const plan = planner.getPlan();
  assert.ok(plan.going.includes('You'));
  assert.equal(plan.pending.length, 0);
  assert.equal(plan.bestPlace.name, 'Bangsar', 'one vote does not flip a 3-vote lead');
});

test('casual chat without plans does not trigger', () => {
  const planner = createPlanner({ now: NOW, members: ['A', 'B'] });
  planner.ingest({ author: 'A', text: 'lol did you see that meme' });
  planner.ingest({ author: 'B', text: 'hahaha yes' });
  assert.equal(planner.getPlan().intent, false);
});

test('exports a valid calendar event', () => {
  const planner = createPlanner({ now: NOW, members: GROUP.members });
  SCRIPT.forEach((m) => planner.ingest(m));
  const ics = buildICS(planner.lock(), { uid: 'test' });
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:20261031T200000/);
  assert.match(ics, /SUMMARY:Dinner @ Bangsar/);
});
