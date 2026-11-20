// Integration tests for the IDE server: it serves the workbench, answers the
// state API and refuses to serve anything outside public/.

import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 7123;
const base = `http://127.0.0.1:${PORT}`;

let server;

before(async () => {
  server = spawn("node", [join(root, "server/index.js"), "--port", String(PORT)], {
    cwd: root,
    stdio: ["ignore", "pipe", "inherit"],
  });
  // The first line of output is printed from the listen callback.
  await once(server.stdout, "data");
});

after(() => server?.kill());

test("serves the workbench shell", async () => {
  const response = await fetch(`${base}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /<title>Atlas IoT IDE<\/title>/);
  // The pieces the prompt's layout is made of.
  for (const id of ["menubar", "metabar", "activitybar", "tabbar", "drawflow", "editor-host", "bottom-panel"]) {
    assert.match(html, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test("state carries the address the IDE is reachable at", async () => {
  const state = await (await fetch(`${base}/api/state`)).json();

  assert.match(state.space.ideAddress, /^http:\/\/[\w.-]+:\d+$/);
  assert.equal(typeof state.space.id, "string");
  assert.ok(Array.isArray(state.things));
});

test("static serving stays inside public/", async () => {
  for (const path of ["/../package.json", "/%2e%2e/package.json", "/a/../../server/index.js"]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404, `${path} should not be served`);
  }
});

test("unknown routes and files are 404, not 500", async () => {
  assert.equal((await fetch(`${base}/nothing.js`)).status, 404);
  assert.equal((await fetch(`${base}/api/nothing`)).status, 404);
});
