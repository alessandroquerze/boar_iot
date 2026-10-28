#!/usr/bin/env python3
"""Interactive CLI to publish commands to the Metronome device over MQTT.

Broker host/port default to localhost:1883, override with --host/--port
or the MQTT_HOST/MQTT_PORT environment variables.
"""
import argparse
import json
import os
import sys

import paho.mqtt.client as mqtt

TOPIC_PREFIX = "metronome/boar/"
DEFAULT_HOST = os.environ.get("MQTT_HOST", "localhost")
DEFAULT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
MAX_BPM = 400


def publish(client, topic, payload):
    info = client.publish(TOPIC_PREFIX + topic, json.dumps(payload), qos=1, retain=False)
    info.wait_for_publish(timeout=5)


def cmd_bpm(client, value):
    try:
        bpm = int(value)
    except ValueError:
        print(f"Invalid BPM value: {value!r} (must be an integer)", file=sys.stderr)
        return
    if bpm < 0 or bpm > MAX_BPM:
        print(f"Invalid BPM value: {bpm} (must be 0-{MAX_BPM})", file=sys.stderr)
        return
    publish(client, "cmd/set_bpm", {"bpm": bpm})
    print(f"Sent set_bpm: {bpm}")


def cmd_mode(client, value):
    mode = value.lower()
    if mode not in ("play", "learn"):
        print(f"Invalid mode: {value!r} (must be 'play' or 'learn')", file=sys.stderr)
        return
    publish(client, "cmd/set_mode", {"mode": mode})
    print(f"Sent set_mode: {mode}")


def cmd_reset(client, value):
    target = value.lower()
    if target not in ("min", "max"):
        print(f"Invalid reset target: {value!r} (must be 'min' or 'max')", file=sys.stderr)
        return
    publish(client, f"cmd/reset_{target}", {"reset": True})
    print(f"Sent reset_{target}")


def dispatch(client, parts):
    if len(parts) != 2:
        print(f"Unknown command: {' '.join(parts)!r}", file=sys.stderr)
        return
    cmd, value = parts
    if cmd == "bpm":
        cmd_bpm(client, value)
    elif cmd == "mode":
        cmd_mode(client, value)
    elif cmd == "reset":
        cmd_reset(client, value)
    else:
        print(f"Unknown command: {cmd!r}", file=sys.stderr)


def interactive(client):
    print("Metronome controller - interactive mode.")
    print("Commands: bpm <n> | mode play|learn | reset min|max | quit")
    while True:
        try:
            line = input("> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not line:
            continue
        if line in ("quit", "exit"):
            break
        dispatch(client, line.split())


def build_client(host, port):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id=f"controller-{os.getpid()}")
    client.connect(host, port)
    client.loop_start()
    return client


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"broker host (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"broker port (default: {DEFAULT_PORT})")

    args = parser.parse_args()

    client = build_client(args.host, args.port)
    try:
        interactive(client)
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
