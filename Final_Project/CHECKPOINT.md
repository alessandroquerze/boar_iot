# Checkpoint
Updated: 2026-11-20
Done: plan steps 0–7. Decisions D1–D13 recorded in `PLAN.md` §12 (all the
recommended defaults; `QUESTIONS.md` is closed). Tag `plan-approved` is the
planning-only tree to restart from.
 0 decisions · 1 `docs/tweets.md` · 2 server + VS Code shell · 3 the language
 (Lezer grammar, AST, printer, validator) · 4 discovery (space model, simulator,
 Atlas gateway, Devices panel) · 5 text editor (CodeMirror 6, projects, tabs)
 · 6 graphical editor (Drawflow, AST↔graph) · 7 green/red sync, settings,
 selection sync. 69 tests pass; `npm run build` outputs are committed.

Current: step 8 — projects and tabs. Most of it landed in step 5 (one project
object per tab, each with its own AST, text, layout, console and lock state).
What is left is hardening: check that two tabs really do not leak state into
each other, and that closing the last tab leaves the editors empty.

Next action: open two projects with `?new=1`, confirm the Devices panel, the
console and the canvas all follow the active tab, then start step 9 (the app
manager: `server/apps.js`, the Apps panel, `update`/finalize/delete, the `.iot`
naming rules).

Open questions: none blocking. Still needed from the user, both from D1:
a capture of the real Atlas tweets (`mosquitto_sub -h <pi> -t '/Atlas/#' -v`)
for plan step 1, and hardware access for step 11.

Known issues:
- `PLAN.md` §5.2 and `docs/tweets.md` describe the tweets as read from the Lab 4
  middleware source, not as observed on a live space. Unconfirmed.
- The real IoT-DDL declares only `interfere` relationships; the order-based and
  condition-based ones the assignment needs exist only in the simulator so far.
- `public/dev/probe.html` is a development aid, not a feature; it is served
  because it has to run in the browser.
