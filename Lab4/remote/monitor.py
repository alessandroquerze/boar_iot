#!/usr/bin/env python3
"""CLI to monitor the Metronome device over MQTT.

Usage:
    monitor.py [--host HOST] [--port PORT]

Broker host/port default to localhost:1883, override with --host/--port
or the MQTT_HOST/MQTT_PORT environment variables.
"""
import argparse
import datetime
import json
import os
import sys

import paho.mqtt.client as mqtt

TOPIC_PREFIX = "metronome/boar/"
DEFAULT_HOST = os.environ.get("MQTT_HOST", "localhost")
DEFAULT_PORT = int(os.environ.get("MQTT_PORT", "1883"))

SUBSCRIBE_TOPICS = [
    TOPIC_PREFIX + "state/#",
    TOPIC_PREFIX + "event/#",
    TOPIC_PREFIX + "status",
]

GREEN = "\033[32m"
RED = "\033[31m"
RESET = "\033[0m"

# True while the last line printed is an in-place beat line, so the next
# non-beat message knows to start on a fresh line instead of overwriting it.
beat_line_active = False


def timestamp():
    return datetime.datetime.now().strftime("%H:%M:%S")


def end_beat_line():
    global beat_line_active
    if beat_line_active:
        print()
        beat_line_active = False


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code.is_failure:
        print(f"Connection failed: {reason_code}", file=sys.stderr)
        return
    for topic in SUBSCRIBE_TOPICS:
        client.subscribe(topic, qos=1)
    print(f"Connected to broker. Subscribed to: {', '.join(SUBSCRIBE_TOPICS)}")


def on_message(client, userdata, msg):
    global beat_line_active

    suffix = msg.topic[len(TOPIC_PREFIX):] if msg.topic.startswith(TOPIC_PREFIX) else msg.topic
    retained_tag = " [retained]" if msg.retain else ""

    try:
        data = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        end_beat_line()
        print(f"{timestamp()} {suffix}{retained_tag} INVALID JSON: {msg.payload!r}", file=sys.stderr)
        return

    if suffix == "event/beat":
        seq = data.get("seq", "?")
        bpm = data.get("bpm", "?")
        sys.stdout.write(f"\r{timestamp()} event/beat{retained_tag} seq={seq} bpm={bpm}   ")
        sys.stdout.flush()
        beat_line_active = True
        return

    end_beat_line()

    if suffix == "status":
        status = data.get("status", "?")
        color = GREEN if status == "online" else RED if status == "offline" else ""
        print(f"{timestamp()} status{retained_tag} {color}{status.upper()}{RESET}")
        return

    print(f"{timestamp()} {suffix}{retained_tag} {json.dumps(data)}")


def build_client(host, port):
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(host, port, 60)
    return client


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--host", default=DEFAULT_HOST, help=f"broker host (default: {DEFAULT_HOST})")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"broker port (default: {DEFAULT_PORT})")
    args = parser.parse_args()

    client = build_client(args.host, args.port)
    try:
        client.loop_forever()
    except KeyboardInterrupt:
        pass
    finally:
        end_beat_line()
        client.disconnect()


if __name__ == "__main__":
    main()
