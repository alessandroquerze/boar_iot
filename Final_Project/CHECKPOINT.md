# Checkpoint
Updated: 2026-11-27
Done: plan steps 0–10, plus the relationships pass. The IDE works end to end
against the simulated space. Decisions D1–D13 are in `PLAN.md` §12 (D4 revised);
tag `plan-approved` is the planning-only tree to restart from. 130 tests pass;
`npm run build` outputs are committed.

 0 decisions · 1 `docs/tweets.md` · 2 server + VS Code shell · 3 the language
 (Lezer grammar, AST, printer, validator) · 4 discovery (space model, simulator,
 Atlas gateway, Devices panel) · 5 text editor · 6 graphical editor ·
 7 green/red sync, settings, selection sync · 8 independent projects and tabs ·
 9 app manager (.iot files, save/delete) · 10 runtime (activate, stop,
 status panel, the Lab 4 orchestrator).

Current: step 11 — the hardware pass. **Blocked: no Raspberry Pi, broker or
Atlas middleware is reachable from this machine** (decision D1). Everything is
developed and verified against `server/gateway-sim.js`.
On 2026-11-25 the user asked for five changes, all done: finalize dropped and
`update` renamed `save`; relationships only from `Atlas_IoTDDL.xml` (simulator
mirrors it; two `order` calibration relationships added to ClimateSensor); a
path typed as app name is refused; a LOOP has no `next` (a statement after it
is a validation error).
On 2026-11-27 the instructor's clarification on relationships was implemented:
one space-level `relationships` list (`PLAN.md` §5.1). Advertised IoT-DDL
relationships stay read-only and same-thing only; the developer can add
`order`/`condition` ones between any two discovered services, across things
included, saved in `relationships.json` beside the apps
(`server/relationships.js`, §5.4). Dropping a service offers them as connect
suggestions (§6.2). `runtime.js` is untouched. Conflicts C8 and C9 logged.
A second simulated thing, `AT_BoarLamp`, makes the cross-thing case testable.

Next action: either
 (a) step 11, once the user provides a tweet capture
     (`mosquitto_sub -h <pi> -t '/Atlas/#' -v`) and hardware access — correct
     `docs/tweets.md` and `server/gateway-atlas.js` against the real traffic,
     then run the Lab 4 Part II demo app from the IDE against the real thing; or
 (b) step 12 — screenshots of the IDE and every dialog (the *add relationship*
     dialog is new), the ≤5-page report and the 2-minute deck, which do not need
     hardware.

Open questions: none blocking. Still needed from the user, both from D1: the
tweet capture, and hardware access for step 11.

Known issues:
- `PLAN.md` §5.2 and `docs/tweets.md` describe the tweets as read from the Lab 4
  middleware source, not as observed on a live space. `gateway-atlas.js` has
  never run against a real thing.
- The IoT-DDL has `order` and `interfere` relationships but no `condition` one,
  so the *advertised* half of the Relationships view shows no condition-based
  relationship. This no longer blocks the demo — a condition relationship can be
  defined in the IDE — but adding one to `Atlas_IoTDDL.xml` is what would show it
  as advertised.
- The second simulated thing, `AT_BoarLamp`, is not Lab 4 hardware and has no
  IoT-DDL here, so it advertises services and **no** relationships. It exists so
  cross-thing apps and relationships can be built and tested without a second Pi;
  with real hardware it is another group's RPi instead.
- `npm test` fails on Node 22/Windows (directory arg); use
  `node --test "tests/*.test.js"`. The PATH npm here is v6; use Node's npm 10.
- A condition block holds its predicate as text rather than as sub-blocks. That
  keeps AND, OR and nesting available without a sub-editor, but it means part of
  a condition is typed even in the graphical editor.
- The probe's waits are browser-side virtual time, so scenarios that depend on
  the server's real-time timers (`run`) are only a smoke test; the runtime is
  verified over the event stream with curl instead.
