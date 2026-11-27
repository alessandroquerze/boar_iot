// The real Atlas gateway.
//
// Discovery: the things publish their tweets over MQTT under a topic root (the
// Lab 4 thing uses /Atlas). We subscribe to the whole subtree and route on the
// "Tweet Type" field rather than on the topic, because which topic carries which
// tweet is the least certain part of docs/tweets.md.
//
// Calls: one TCP connection to the thing's port 6668 per call, one JSON object
// out, reply read until the thing closes the connection. Calls to the same
// thing run in order and the next call can start as soon as the reply arrives.

import mqtt from "mqtt";
import { createConnection } from "node:net";

const CALL_TIMEOUT_MS = 15000;

export function createAtlasGateway({
  broker,
  topicRoot = "/Atlas",
  onTweet,
  onStatus,
  timeoutMs = CALL_TIMEOUT_MS,
} = {}) {
  let client = null;
  // One promise chain per thing: calls to the same thing never overlap.
  const queues = new Map();

  function start() {
    const [host, port = "1883"] = broker.split(":");
    client = mqtt.connect(`mqtt://${host}:${port}`, { reconnectPeriod: 4000 });

    client.on("connect", () => {
      onStatus?.("connected");
      client.subscribe(`${topicRoot}/#`, { qos: 0 });
    });
    client.on("reconnect", () => onStatus?.("connecting"));
    client.on("close", () => onStatus?.("disconnected"));
    client.on("error", () => onStatus?.("error"));

    client.on("message", (_topic, payload) => {
      const tweet = parseJson(payload.toString());
      // A thing may send several tweets in one payload, one per line.
      if (tweet) onTweet?.(tweet);
    });
  }

  function stop() {
    client?.end(true);
    client = null;
  }

  function call(request) {
    const key = request.thing;
    const previous = queues.get(key) ?? Promise.resolve();
    const next = previous
      .catch(() => {})
      .then(() => sendCall(request, timeoutMs));

    queues.set(key, next);
    return next;
  }

  return { name: "atlas", start, stop, call };
}

// --- one service call --------------------------------------------------------

function sendCall({ thing, space, service, args = [], ip, port = 6668 }, timeoutMs) {
  const request = JSON.stringify({
    "Tweet Type": "Service call",
    "Thing ID": thing,
    "Space ID": space,
    "Service Name": service,
    "Service Inputs": `(${args.join(",")})`,
  });

  return new Promise((resolve) => {
    if (!ip) {
      resolve({ status: "Unsuccessful", result: null, description: `no address known for ${thing}` });
      return;
    }

    const socket = createConnection({ host: ip, port }, () => socket.write(request));
    let reply = "";
    let settled = false;

    const finish = (outcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(outcome);
    };

    socket.setTimeout(timeoutMs, () =>
      finish({ status: "Unsuccessful", result: null, description: `timeout waiting for ${service}` }),
    );
    socket.on("data", (chunk) => (reply += chunk.toString()));
    socket.on("error", (error) =>
      finish({ status: "Unsuccessful", result: null, description: error.message }),
    );
    // Atlas closes the connection when the reply is complete.
    socket.on("end", () => finish(readReply(reply, service)));
    socket.on("close", () => finish(readReply(reply, service)));
  });
}

function readReply(reply, service) {
  const parsed = parseJson(reply);
  if (!parsed) {
    return { status: "Unsuccessful", result: null, description: `no reply to ${service}` };
  }

  const raw = parsed["Service Result"];
  return {
    status: parsed.Status === "Successful" ? "Successful" : "Unsuccessful",
    // "No Output" is what a void service answers; everything else is a number
    // sent as text, which the orchestrator needs as a number to compare.
    result: raw === undefined || raw === null || raw === "No Output" ? null : toNumber(raw),
    description: parsed.Description ?? "",
  };
}

function toNumber(value) {
  const number = Number(String(value).trim());
  return Number.isFinite(number) ? number : value;
}

function parseJson(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
