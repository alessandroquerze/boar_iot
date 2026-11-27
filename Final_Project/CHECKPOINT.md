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
 9 app manager (.iot files, save/finalize/delete) · 10 runtime (activate, stop,
 status panel, the Lab 4 orchestrator).

Current: the instructor's clarification on relationships is implemented and
merged into `main`. One space-level `relationships` list
(`PLAN.md` §5.1): advertised IoT-DDL relationships stay read-only and same-thing
only, the developer can add `order`/`condition` ones between any two discovered
services across things, saved in `relationships.json` beside the apps
(`server/relationships.js`, §5.4). Dropping a service offers them as connect
suggestions (§6.2). `runtime.js` is untouched. Conflicts C8 and C9 logged.

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
- The real IoT-DDL declares only `interfere` relationships. That no longer blocks
  the demo — the order-based and condition-based ones can now be defined in the
  IDE — but adding them to `Atlas_IoTDDL.xml` is still what shows the *advertised*
  half of the Relationships view against real hardware.
- The second simulated thing, `AT_BoarLamp`, is not Lab 4 hardware. It exists so
  cross-thing apps and relationships can be built and tested without a second Pi;
  with real hardware it is another group's RPi instead.
- A condition block holds its predicate as text rather than as sub-blocks. That
  keeps AND, OR and nesting available without a sub-editor, but it means part of
  a condition is typed even in the graphical editor.
- The probe's waits are browser-side virtual time, so scenarios that depend on
  the server's real-time timers (`run`) are only a smoke test; the runtime is
  verified over the event stream with curl instead.
