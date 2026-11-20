// HTTP entry point: serves the IDE in public/, exposes the REST API and pushes
// live updates over Server-Sent Events. Node built-ins only, no web framework.
//
// Usage:  node server/index.js [--port 7000] [--simulate] [--broker host:1883]
//                              [--apps ./apps]

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

// --- configuration ---------------------------------------------------------

function parseArgs(argv) {
  const config = {
    port: 7000,
    simulate: false,
    broker: "192.168.8.189:1883",
    appsDir: join(root, "apps"),
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--simulate") config.simulate = true;
    else if (arg === "--port") config.port = Number(argv[++i]);
    else if (arg === "--broker") config.broker = argv[++i];
    else if (arg === "--apps") config.appsDir = join(process.cwd(), argv[++i]);
    else throw new Error(`unknown option: ${arg}`);
  }
  return config;
}

// The guidelines ask the IDE to display the network address it was launched on,
// so prefer a real LAN address over localhost.
function lanAddress() {
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return "localhost";
}

// --- the space model (filled in by the gateways, plan step 4) --------------

const config = parseArgs(process.argv.slice(2));
const state = {
  space: {
    id: "BoarSmartSpace",
    ideAddress: `http://${lanAddress()}:${config.port}`,
    broker: config.simulate ? "simulated" : "disconnected",
    // "scanning" freezes the IDE behind the start-up overlay; nothing can be
    // scanned until a gateway exists (plan step 4), so start out ready.
    discovery: "ready",
  },
  things: [],
};

// --- Server-Sent Events ----------------------------------------------------

const clients = new Set();

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(frame);
}

function openEventStream(response) {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  response.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

// --- static files ----------------------------------------------------------

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json; charset=utf-8",
};

async function serveStatic(pathname, response) {
  // normalize() collapses "..", so a request can never escape public/.
  const relative = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const file = join(publicDir, relative);

  if (!file.startsWith(publicDir)) return send(response, 403, "forbidden");

  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    response.end(body);
  } catch {
    send(response, 404, `not found: ${relative}`);
  }
}

function send(response, status, body) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : CONTENT_TYPES[".json"],
  });
  response.end(payload);
}

// --- routing ---------------------------------------------------------------

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const route = `${request.method} ${url.pathname}`;

  try {
    if (route === "GET /api/state") return send(response, 200, state);
    if (route === "GET /api/events") return openEventStream(response);
    if (request.method === "GET") return await serveStatic(url.pathname, response);
    send(response, 404, `no route for ${route}`);
  } catch (error) {
    console.error(`${route} failed:`, error);
    send(response, 500, String(error.message ?? error));
  }
});

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Atlas IoT IDE on ${state.space.ideAddress}`);
  console.log(`  apps directory  ${config.appsDir}`);
  console.log(`  space           ${config.simulate ? "simulated" : `broker ${config.broker}`}`);
});

export { broadcast, config, state };
