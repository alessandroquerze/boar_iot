// HTTP entry point: serves the IDE in public/, exposes the REST API and pushes
// live updates over Server-Sent Events. Node built-ins only, no web framework.
//
// Usage:  node server/index.js [--port 7000] [--simulate] [--broker host:1883]
//                              [--apps ./apps]

import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { readFile } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AppStore, nameError } from "./apps.js";
import { createAtlasGateway } from "./gateway-atlas.js";
import { createSimGateway } from "./gateway-sim.js";
import { RelationshipStore } from "./relationships.js";
import { RunManager } from "./runtime.js";
import { Space } from "./space.js";

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
    // resolve(), not join(): an absolute path must be taken as given.
    else if (arg === "--apps") config.appsDir = resolve(process.cwd(), argv[++i]);
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

// --- the space, and the gateway that fills it ------------------------------

const config = parseArgs(process.argv.slice(2));

const space = new Space({
  id: "BoarSmartSpace",
  ideAddress: `http://${lanAddress()}:${config.port}`,
});

// Discovery runs here, in the server process, independent of any browser — the
// background scan the guidelines ask for.
const gateway = config.simulate
  ? createSimGateway({ onTweet: (tweet) => space.applyTweet(tweet) })
  : createAtlasGateway({
      broker: config.broker,
      onTweet: (tweet) => space.applyTweet(tweet),
      onStatus: (status) => space.setBroker(status),
    });

// The Atlas working directory, scanned when the IDE starts.
const apps = new AppStore(config.appsDir);

// The developer's own relationships live beside the apps and survive a restart.
const relationships = new RelationshipStore(config.appsDir);

// Runs live here, not in the browser, so activate/stop/Completed are a real
// life cycle and the status panel is empty every time the IDE starts.
const runs = new RunManager({
  gateway,
  space,
  onChange: (list) => broadcast("runs", list),
  onLog: (line) => broadcast("log", line),
});

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
  response.write(`event: state\ndata: ${JSON.stringify(space.toJSON())}\n\n`);
  response.write(`event: runs\ndata: ${JSON.stringify(runs.list())}\n\n`);
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

/** Read a JSON request body, with a small cap so a stray request cannot grow. */
function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error("request too large"));
    });
    request.on("end", () => {
      try {
        resolve(body === "" ? {} : JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendNoContent(response) {
  response.writeHead(204);
  response.end();
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
    if (route === "GET /api/state") return send(response, 200, space.toJSON());
    if (route === "GET /api/events") return openEventStream(response);

    if (route === "GET /api/config") {
      return send(response, 200, { appsDir: config.appsDir, simulate: config.simulate, broker: config.broker });
    }

    if (route === "GET /api/apps") return send(response, 200, await apps.list());
    if (route === "GET /api/runs") return send(response, 200, runs.list());

    // Relationships. A change is pushed as a new space state, because the
    // advertised and the user-defined ones are one list in the browser.
    if (route === "GET /api/relationships") {
      return send(response, 200, space.toJSON().relationships);
    }

    if (route === "POST /api/relationships") {
      const { error, relationship } = await relationships.add(await readJson(request), space.toJSON());
      if (error) return send(response, 400, { error });

      space.setUserRelationships(relationships.list());
      return send(response, 201, relationship);
    }

    const relationshipRoute = /^\/api\/relationships\/(.+)$/.exec(url.pathname);
    if (relationshipRoute && request.method === "DELETE") {
      const id = decodeURIComponent(relationshipRoute[1]);
      const { status, error } = await relationships.remove(id, space.toJSON());
      if (error) return send(response, status, { error });

      space.setUserRelationships(relationships.list());
      return sendNoContent(response);
    }

    const stopRoute = /^\/api\/runs\/([^/]+)\/stop$/.exec(url.pathname);
    if (stopRoute && request.method === "POST") {
      const { error } = runs.stop(stopRoute[1]);
      return send(response, error ? 409 : 200, error ? { error } : runs.list());
    }

    const activateRoute = /^\/api\/apps\/(.+)\/activate$/.exec(url.pathname);
    if (activateRoute && request.method === "POST") {
      const file = decodeURIComponent(activateRoute[1]);
      const app = await apps.read(file);
      const { error, run } = runs.activate({ file: app.file, name: app.name, source: app.source });
      return send(response, error ? 409 : 200, error ? { error } : run && { id: run.id });
    }

    const appRoute = /^\/api\/apps\/(.+)$/.exec(url.pathname);
    if (appRoute) {
      const fileName = decodeURIComponent(appRoute[1]);

      if (request.method === "GET") return send(response, 200, await apps.read(fileName));

      if (request.method === "PUT") {
        const problem = nameError(fileName);
        if (problem) return send(response, 400, { error: problem });

        const saved = await apps.write(fileName, await readJson(request));
        broadcast("apps", await apps.list());
        return send(response, 200, saved);
      }

      if (request.method === "DELETE") {
        await apps.remove(fileName);
        broadcast("apps", await apps.list());
        return send(response, 200, { deleted: fileName });
      }
    }

    if (request.method === "GET") return await serveStatic(url.pathname, response);
    send(response, 404, `no route for ${route}`);
  } catch (error) {
    if (error.code === "ENOENT") return send(response, 404, { error: `no such app: ${url.pathname}` });
    console.error(`${route} failed:`, error);
    send(response, 500, { error: String(error.message ?? error) });
  }
});

server.listen(config.port, "0.0.0.0", async () => {
  await apps.ready();

  // Read the saved relationships before the first state goes out, so the
  // Relationships view is complete from the first frame.
  const saved = await relationships.load();
  space.userRelationships = saved;

  // Printed in one go, after the working directory has been read: the first
  // line of output is what the tests wait for to know the IDE is up.
  console.log(`Atlas IoT IDE on ${space.ideAddress}`);
  console.log(`  apps directory  ${config.appsDir}`);
  console.log(`  relationships   ${saved.length} user-defined`);
  console.log(`  space           ${config.simulate ? "simulated" : `broker ${config.broker}`}`);

  // Only start listening to the space once the IDE can be reached, so the
  // start-up scan and the overlay that goes with it line up.
  space.on("change", (state) => broadcast("state", state));
  if (config.simulate) space.setBroker("simulated");
  space.startScanning();
  gateway.start();
});

function shutdown() {
  runs.stopAll();
  gateway.stop();
  space.stop();
  server.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { broadcast, config, gateway, relationships, space };
