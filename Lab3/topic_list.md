```markdown
# MQTT Topic Contract — Metronome (group: boar)

Prefix: `metronome/boar/`
All payloads are JSON objects.

| Topic              | Direction      | Payload                              | QoS | Retained |
|---------------------|----------------|---------------------------------------|-----|----------|
| cmd/set_bpm         | remote → device| `{"bpm": 120}`                        | 1   | no       |
| cmd/set_mode        | remote → device| `{"mode": "play"}` / `{"mode": "learn"}` | 1 | no      |
| cmd/reset_min       | remote → device| `{"reset": true}`                    | 1   | no       |
| cmd/reset_max       | remote → device| `{"reset": true}`                    | 1   | no       |
| state/bpm           | device → all   | `{"bpm": 120}`                        | 1   | yes      |
| state/mode          | device → all   | `{"mode": "play"}`                   | 1   | yes      |
| state/min           | device → all   | `{"min": 60}`                        | 1   | yes      |
| state/max           | device → all   | `{"max": 140}`                       | 1   | yes      |
| event/beat          | device → all   | `{"bpm": 120, "seq": 42}`             | 0   | no       |
| event/tap           | device → all   | `{"count": 3}`                        | 0   | no       |
| status              | device → all   | `{"status": "online"}` / `{"status": "offline"}` | 1 | yes (LWT = offline) |

## Rules
- Commands are never retained (a retained command would replay on every device reconnect).
- State is always retained, so a late-joining client immediately sees current state.
- The device publishes the matching `state/*` topic after every change, whether triggered by a button or by MQTT.
- Invalid payloads (bad JSON, missing field, negative bpm, unknown mode) are logged and ignored — the device must not crash.
- Remote clients never write to `state/*`; only the device does.
```