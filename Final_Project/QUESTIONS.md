# QUESTIONS.md

**Closed on 2026-11-20.** All thirteen questions were answered with their
recommended default; the answers are recorded as decisions D1–D13 in
[`PLAN.md` §12](PLAN.md#12-decisions), and §§4–9 of the plan were already written
around them.

The questions themselves are preserved in the history of this file
(`git show plan-approved:Final_Project/QUESTIONS.md`), together with the reasoning
behind each recommendation.

Two of the decisions leave work that only the user can unblock:

- **D1** — no Raspberry Pi, MQTT broker or Atlas middleware is reachable from this
  machine. Development runs against `server/gateway-sim.js`. Still needed from the
  user: a capture of the real tweets (`mosquitto_sub -h <pi> -t '/Atlas/#' -v`) for
  plan step 1, and a hardware pass for step 11. Until then the tweet field names in
  `PLAN.md` §5.2 come from reading the Lab 4 middleware source, not from observed
  traffic.
- **D12** — if more than one Raspberry Pi will be on the space for the demo, say how
  many, so the simulator mirrors the real setup.

New questions raised while building go in `CHECKPOINT.md` under *Open questions*.
