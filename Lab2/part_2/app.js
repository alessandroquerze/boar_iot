// Dashboard for the Metronome Thing.
// Talks to the REST endpoints actually exposed by the device's main.cpp
// (note the trailing slash, required by the device's listener):
//   GET/PUT    /bpm/     -> { "bpm": <number> }
//   GET/DELETE /bpm/min/ -> { "min": <number> }
//   GET/DELETE /bpm/max/ -> { "max": <number> }

const hostInput = document.getElementById("host");
const connectBtn = document.getElementById("connectBtn");
const connStatus = document.getElementById("connStatus");
const refreshBtn = document.getElementById("refreshBtn");
const bpmValue = document.getElementById("bpmValue");
const bpmInput = document.getElementById("bpmInput");
const bpmSlider = document.getElementById("bpmSlider");
const setBtn = document.getElementById("setBtn");
const minValue = document.getElementById("minValue");
const maxValue = document.getElementById("maxValue");
const resetMinBtn = document.getElementById("resetMinBtn");
const resetMaxBtn = document.getElementById("resetMaxBtn");
const message = document.getElementById("message");
const pulseDot = document.getElementById("pulseDot");

const STORAGE_KEY = "metronome_host";
let pulseTimer = null;

function getBaseUrl() {
  const host = hostInput.value.trim();
  if (!host) return null;
  return host.startsWith("http") ? host : `http://${host}`;
}

function setStatus(kind, text) {
  connStatus.textContent = text;
  connStatus.className = `status status-${kind}`;
}

function showMessage(text, kind = "") {
  message.textContent = text;
  message.className = `message ${kind}`;
}

function startPulse(bpm) {
  clearInterval(pulseTimer);
  pulseDot.classList.remove("on");
  if (!bpm || bpm <= 0) return;

  const periodMs = 60000 / bpm;
  const pulseMs = Math.min(periodMs / 2, 100);

  pulseTimer = setInterval(() => {
    pulseDot.classList.add("on");
    setTimeout(() => pulseDot.classList.remove("on"), pulseMs);
  }, periodMs);
}

function updateBpmDisplay(bpm) {
  bpmValue.textContent = bpm;
  bpmSlider.value = Math.min(bpm, bpmSlider.max);
  startPulse(bpm);
}

async function apiRequest(path, options = {}) {
  const base = getBaseUrl();
  if (!base) {
    showMessage("Enter the device address first.", "error");
    return null;
  }
  const res = await fetch(`${base}${path}`, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function refreshAll() {
  if (!getBaseUrl()) {
    showMessage("Enter the device address first.", "error");
    return;
  }
  try {
    const [bpmData, minData, maxData] = await Promise.all([
      apiRequest("/bpm/"),
      apiRequest("/bpm/min/"),
      apiRequest("/bpm/max/"),
    ]);
    updateBpmDisplay(bpmData.bpm);
    minValue.textContent = minData.min;
    maxValue.textContent = maxData.max;
    setStatus("ok", "Connected");
    showMessage("Data refreshed.", "success");
  } catch (err) {
    setStatus("error", "Connection error");
    showMessage(`Unable to read data: ${err.message}`, "error");
  }
}

async function setBpm(newBpm) {
  if (Number.isNaN(newBpm) || newBpm < 0) {
    showMessage("Enter a valid BPM value.", "error");
    return;
  }
  try {
    await apiRequest("/bpm/", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bpm: newBpm }),
    });
    showMessage(`BPM set to ${newBpm}.`, "success");
    await refreshAll();
  } catch (err) {
    setStatus("error", "Connection error");
    showMessage(`Unable to set BPM: ${err.message}`, "error");
  }
}

async function resetBound(kind) {
  try {
    await apiRequest(`/bpm/${kind}/`, { method: "DELETE" });
    showMessage(`${kind === "min" ? "Min" : "Max"} BPM reset.`, "success");
    await refreshAll();
  } catch (err) {
    setStatus("error", "Connection error");
    showMessage(`Unable to reset ${kind}: ${err.message}`, "error");
  }
}

connectBtn.addEventListener("click", () => {
  localStorage.setItem(STORAGE_KEY, hostInput.value.trim());
  refreshAll();
});

refreshBtn.addEventListener("click", refreshAll);

setBtn.addEventListener("click", () => {
  setBpm(parseInt(bpmInput.value, 10));
});

bpmSlider.addEventListener("change", () => {
  bpmInput.value = bpmSlider.value;
  setBpm(parseInt(bpmSlider.value, 10));
});

resetMinBtn.addEventListener("click", () => resetBound("min"));
resetMaxBtn.addEventListener("click", () => resetBound("max"));

// Restore the last used host.
const savedHost = localStorage.getItem(STORAGE_KEY);
if (savedHost) {
  hostInput.value = savedHost;
  refreshAll();
}
