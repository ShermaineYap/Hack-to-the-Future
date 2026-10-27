# Devpost submission — copy and paste

Deadline: **27 Oct 2026, 5:00pm EDT = 28 Oct 2026, 5:00am Malaysia time.**

---

## Project name

Plans for WhatsApp — group chats that plan themselves

## Tagline (Devpost "elevator pitch")

WhatsApp groups that turn "fri?" "can't" "sat?" into one live plan everyone answers in a tap.

## 1. App upgraded and new feature

**App:** WhatsApp (group chats)
**New feature:** Plans — notices when a group is organising something and turns the conversation into a live plan card with the best day, time, place and who's coming.

## 2. Problem statement

Every WhatsApp group eventually tries to meet up, and the plan drowns in dozens of "fri?" "can't" "sat?" messages. WhatsApp has polls and events, but someone still has to read the whole argument, work out who can make which day, and create the event by hand, so most plans quietly die. This affects anyone who organises anything over WhatsApp: friend groups, families, students and project teams.

## 3. Before and after

Upload `docs/before-after.png` as the first image in the gallery (also `docs/before.png`, `docs/after.png`, `docs/suggestion.png`).

**Before:** In WhatsApp today, the group sends 9 messages agreeing on Saturday 8pm in Bangsar, but no event exists. Someone has to scroll back, work out who said yes to what, and create the event manually.

**After:** With Plans, a suggestion appears after the 2nd message. One tap creates a Plan card that fills itself from the conversation (Sat 31 Oct, 8pm, Bangsar, 4 going, 1 still to reply) and keeps updating as people talk. Everyone answers with one tap, and the plan can be locked and added to the calendar.

## 4. Demo video

<YouTube / Loom link — unlisted, under 3 minutes>

## 5. Source code

https://github.com/ShermaineYap/hack-to-the-future

**Live demo:** https://shermaineyap.github.io/Hack-to-the-Future/

## 6. How it works (tools, APIs, languages, AI models)

- HTML, CSS and vanilla JavaScript (ES modules), no framework or build step
- A rule-based, on-device planning engine (`src/planner.js`) that extracts activities, days, times, places and yes/no replies from each message, with 10 automated tests (Node.js test runner)
- iCalendar (.ics) export for "Add to calendar"
- GitHub Pages hosting; Playwright for screenshots
- No AI model at runtime, by design: detection runs entirely on the phone so it is compatible with end-to-end encryption
- Claude (Anthropic) used as an AI coding assistant during the build

## 7. Team members

- Shermaine Yap — shermaine8268@gmail.com

## Optional: how WhatsApp could roll it out

Ship Plans as an upgrade to the existing Events feature in groups: detection runs on-device only, it is off by default with a one-time opt-in per group, and it launches with common plans (meals, meetups) before expanding languages and local place names.

---

## 3-minute video script

**0:00–0:20 — The pain.** Open the demo in "WhatsApp today" mode, press Next message through all 9 messages.
"This is every group chat I'm in. Nine messages, everyone agreed on Saturday 8pm in Bangsar... and there's still no plan. Someone has to scroll back and make the event by hand."

**0:20–0:35 — The idea.** Switch to "With Plans".
"So I built Plans for WhatsApp: the chat notices you're planning something and builds the plan for you."

**0:35–2:05 — The feature working.** Press Play (or step with →).
- After message 2: "Two messages in, it spots that we're planning dinner and offers to make a plan." Tap **Make a plan**.
- Keep playing: "Priya can't do Friday — the card marks her out for Friday. Saturday takes the lead. Bangsar gets the votes. Daniel says 8pm is better — the time updates on its own."
- Point at the right-hand panel: "Here's what it understood from each message — days, times, places, yes and no."
- Type `can't sat, sun?` as You: "It works on anything you type, not just my script." (Optional — then Start over and replay to the end.)
- Tap **I'm going**, then **Lock plan and add to calendar**: "One tap to say I'm in, one tap to lock it, and it goes straight into my calendar."

**2:05–2:40 — How it's built.**
"It runs entirely on the phone — a rule-based engine that reads dates like 'fri' and 'tmr', times like 7.30pm, places, and replies like 'can't' or 👍, with automated tests. Because nothing leaves the device, it fits WhatsApp's end-to-end encryption."

**2:40–2:55 — Rollout.**
"WhatsApp could ship this as an upgrade to group Events: on-device, opt-in per group, starting with meals and meetups. Plans for WhatsApp — the chat that plans itself."

## Final checklist

- [ ] Registered on Devpost before the deadline
- [ ] Video under 3:00, public or unlisted, link opens in a private window
- [ ] Repo is public and README renders with images
- [ ] Live demo link works
- [ ] Name and email match registration
- [ ] `docs/before-after.png` is the first gallery image
- [ ] Organizer's IEEE form filled (posted in Discussions)
