// Dashboard for the Metronome Thing, talking MQTT over WebSockets.
// Broker: ws://<host>:9001. Topic contract: metronome/boar/{cmd,state,event,status}.

const TOPIC_PREFIX = "metronome/boar/";
const MAX_BPM = 400;

const hostInput = document.getElementById("host");
const connectBtn = document.getElementById("connectBtn");
const connStatus = document.getElementById("connStatus");
const deviceStatus = document.getElementById("deviceStatus");
const reconnectBtn = document.getElementById("refreshBtn");
const bpmValue = document.getElementById("bpmValue");
const bpmInput = document.getElementById("bpmInput");
const bpmSlider = document.getElementById("bpmSlider");
const setBtn = document.getElementById("setBtn");
const minValue = document.getElementById("minValue");
const maxValue = document.getElementById("maxValue");
const resetMinBtn = document.getElementById("resetMinBtn");
const resetMaxBtn = document.getElementById("resetMaxBtn");
const gotoMinBtn = document.getElementById("gotoMinBtn");
const gotoMaxBtn = document.getElementById("gotoMaxBtn");
const modeValue = document.getElementById("modeValue");
const playModeBtn = document.getElementById("playModeBtn");
const learnModeBtn = document.getElementById("learnModeBtn");
const message = document.getElementById("message");
const pulseDot = document.getElementById("pulseDot");

const STORAGE_KEY = "metronome_host";
let client = null;
let lastMin = 0;
let lastMax = 0;
let pulseTimeout = null;

function setBrokerStatus(kind, text) {
  connStatus.textContent = `Broker: ${text}`;
  connStatus.className = `status status-${kind}`;
}

function setDeviceStatus(kind, text) {
  deviceStatus.textContent = `Device: ${text}`;
  deviceStatus.className = `status status-${kind}`;
}

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

function flashPulse() {
  pulseDot.classList.add("on");
  clearTimeout(pulseTimeout);
  pulseTimeout = setTimeout(() => pulseDot.classList.remove("on"), 100);
}

function updateGotoButtons() {
  gotoMinBtn.disabled = !lastMin;
  gotoMaxBtn.disabled = !lastMax;
}

function updateBpmDisplay(bpm) {
  bpmValue.textContent = bpm;
  bpmInput.value = bpm;
  bpmSlider.value = Math.min(bpm, bpmSlider.max);
}

function publish(topic, payload) {
  if (!client || !client.connected) {
    showMessage("Not connected to broker.", "error");
    return;
  }
  client.publish(TOPIC_PREFIX + topic, JSON.stringify(payload), { qos: 1, retain: false });
}

function handleMessage(topic, payloadStr) {
  const suffix = topic.slice(TOPIC_PREFIX.length);
  let data;
  try {
    data = JSON.parse(payloadStr);
  } catch {
    return;
  }

  switch (suffix) {
    case "state/bpm":
      updateBpmDisplay(data.bpm);
      break;
    case "state/mode":
      modeValue.textContent = data.mode;
      modeValue.className = `mode-value mode-${data.mode}`;
      break;
    case "state/min":
      lastMin = data.min;
      minValue.textContent = data.min || "--";
      updateGotoButtons();
      break;
    case "state/max":
      lastMax = data.max;
      maxValue.textContent = data.max || "--";
      updateGotoButtons();
      break;
    case "event/beat":
      flashPulse();
      if (data.bpm !== undefined && String(data.bpm) !== bpmValue.textContent) {
        updateBpmDisplay(data.bpm);
      }
      break;
    case "event/tap":
      showMessage(`Tap recorded (${data.count})`, "success");
      break;
    case "status":
      if (data.status === "online") {
        setDeviceStatus("ok", "online");
      } else {
        setDeviceStatus("error", "offline");
      }
      break;
  }
}

function connect() {
  const host = hostInput.value.trim();
  if (!host) {
    showMessage("Enter the device address first.", "error");
    return;
  }
  localStorage.setItem(STORAGE_KEY, host);

  if (client) {
    client.end(true);
  }

  setBrokerStatus("unknown", "connecting...");
  setDeviceStatus("unknown", "unknown");
  client = mqtt.connect(`ws://${host}:9001`);

  client.on("connect", () => {
    setBrokerStatus("ok", "connected");
    showMessage("Connected to broker.", "success");
    client.subscribe([
      `${TOPIC_PREFIX}state/#`,
      `${TOPIC_PREFIX}event/#`,
      `${TOPIC_PREFIX}status`,
    ], { qos: 1 });
  });

  client.on("reconnect", () => setBrokerStatus("unknown", "reconnecting..."));

  client.on("close", () => {
    setBrokerStatus("error", "disconnected");
    setDeviceStatus("unknown", "unknown");
  });

  client.on("error", (err) => {
    setBrokerStatus("error", "error");
    showMessage(`MQTT error: ${err.message}`, "error");
  });

  client.on("message", (topic, payload) => handleMessage(topic, payload.toString()));
}

connectBtn.addEventListener("click", connect);

reconnectBtn.addEventListener("click", () => {
  if (client) client.reconnect();
  else connect();
});

setBtn.addEventListener("click", () => {
  const bpm = parseInt(bpmInput.value, 10);
  if (Number.isNaN(bpm) || bpm < 0 || bpm > MAX_BPM) {
    showMessage(`Enter a BPM between 0 and ${MAX_BPM}.`, "error");
    return;
  }
  publish("cmd/set_bpm", { bpm });
});

bpmSlider.addEventListener("change", () => {
  const bpm = parseInt(bpmSlider.value, 10);
  if (Number.isNaN(bpm) || bpm < 0 || bpm > MAX_BPM) return;
  bpmInput.value = bpm;
  publish("cmd/set_bpm", { bpm });
});

playModeBtn.addEventListener("click", () => publish("cmd/set_mode", { mode: "play" }));
learnModeBtn.addEventListener("click", () => publish("cmd/set_mode", { mode: "learn" }));

resetMinBtn.addEventListener("click", () => publish("cmd/reset_min", { reset: true }));
resetMaxBtn.addEventListener("click", () => publish("cmd/reset_max", { reset: true }));

gotoMinBtn.addEventListener("click", () => {
  if (lastMin) publish("cmd/set_bpm", { bpm: lastMin });
});
gotoMaxBtn.addEventListener("click", () => {
  if (lastMax) publish("cmd/set_bpm", { bpm: lastMax });
});

updateGotoButtons();

// Restore the last used host and auto-connect.
const savedHost = localStorage.getItem(STORAGE_KEY);
if (savedHost) {
  hostInput.value = savedHost;
  connect();
}
