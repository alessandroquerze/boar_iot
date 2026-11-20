# Checkpoint
Updated: 2026-11-20
Done: planning session — read `AGENTS.md`, `docs/Guidelines.pdf` and the Lab 4
reference (`../Lab4`: edge mini-IDE, device services, IoT-DDL, Atlas middleware
tweet/call formats). Wrote `PLAN.md` (= the `PROJECT.md` of `AGENTS.md`),
`directive_conflicts.md` (7 conflicts, C1–C7), `QUESTIONS.md` (13 questions) and the
two pointer files `PROJECT.md` / `docs/guideline-conflicts.md`.

Current: step 0 — waiting for the user's answers in `QUESTIONS.md`.
No code written yet, by design: the prompt says to stop and ask before building.

Next action: read the user's answers in `QUESTIONS.md`, fold them into `PLAN.md`
§§4–9, empty `QUESTIONS.md`, then start plan step 1 (capture the real Atlas tweets
into `docs/tweets.md`) or step 2 (skeleton) if no hardware is available.

Open questions: all 13 in `QUESTIONS.md`. The blocking ones are
Q1 (Node.js server + no hardware here), Q2 (where *clear*/*finalize*/*new*/*upload*
go, and whether `update` means SAVE APP), Q3 (does the bottom panel also host R4's
status panel), Q4 (relationships inside the Devices panel) and Q11 (add `LOOP`, so
that `stop` can be demonstrated at all).

Known issues: `PLAN.md` §5.2 lists the Atlas tweet fields as read from the middleware
source, **not** from a live capture — they must be confirmed on real hardware before
`gateway-atlas.js` is trusted. Issues inherited from Lab 4 and still to fix are listed
in `README.md` §4 (notably: `main.cpp` does not compile as uploaded, the servo/fan
constants disagree between files, and the IoT-DDL has no order-based or
condition-based relationship yet — only `interfere`).
