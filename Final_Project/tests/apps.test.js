// The Atlas working directory and the .iot naming rules the guidelines set.

import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import { AppStore, appNameOf, fileNameFor, nameError } from "../server/apps.js";

let store;
let directory;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), "atlas-apps-"));
  store = new AppStore(directory);
  await store.ready();
});

after(() => {});

// --- the extension rule -----------------------------------------------------

test("the IDE always gives the file a .iot extension", () => {
  assert.equal(fileNameFor("AirControl"), "AirControl.iot");
});

test("a name that already ends in .iot is not doubled", () => {
  assert.equal(fileNameFor("AirControl.iot"), "AirControl.iot");
});

test("name.ext becomes name.ext.iot, as requirement 2 spells out", () => {
  assert.equal(fileNameFor("AirControl.txt"), "AirControl.txt.iot");
});

test("the display name is the file name without the .iot the IDE added", () => {
  assert.equal(appNameOf("AirControl.iot"), "AirControl");
  assert.equal(appNameOf("AirControl.txt.iot"), "AirControl.txt");
});

// --- the name rule ----------------------------------------------------------

test("a short name of letters, digits, - and _ is accepted", () => {
  for (const name of ["AirControl", "night_mode", "app-2", "x"]) {
    assert.equal(nameError(name), null, name);
  }
});

test("an empty or over-long name is refused", () => {
  assert.match(nameError(""), /needs a name/);
  assert.match(nameError("   "), /needs a name/);
  assert.match(nameError("a".repeat(40)), /at most 32/);
});

test("special characters are refused", () => {
  for (const name of ["air control", "app!", "app#1", "app$", "é"]) {
    assert.match(nameError(name) ?? "", /letters, digits/, name);
  }
});

test("a name cannot carry a path", () => {
  for (const name of ["../escape", "/etc/passwd", "sub/app"]) {
    assert.ok(nameError(name), name);
  }
});

test("a path cannot escape the working directory even if it gets through", () => {
  // resolve() keeps only the file name, so a traversal lands in the directory
  // rather than above it.
  assert.equal(store.resolve("../../outside.iot"), join(directory, "outside.iot"));
  assert.equal(store.resolve("/etc/passwd.iot"), join(directory, "passwd.iot"));
  assert.equal(store.resolve("app.iot"), join(directory, "app.iot"));
  assert.throws(() => store.resolve("app.txt"), /not an app file/);
});

// --- saving and reading -----------------------------------------------------

test("saving writes an app file that can be read back", async () => {
  const saved = await store.write("AirControl", {
    source: "RUN Fan_Off()",
    layout: { "c:abc#0": { x: 10, y: 20 } },
  });

  assert.equal(saved.file, "AirControl.iot");
  assert.equal(saved.name, "AirControl");

  const read = await store.read("AirControl.iot");
  assert.equal(read.source, "RUN Fan_Off()");
  assert.deepEqual(read.layout, { "c:abc#0": { x: 10, y: 20 } });
  assert.equal(read.format, "atlas-iot-app");
});

test("saving again overwrites the same file and keeps the creation time", async () => {
  const first = await store.write("Repeat", { source: "RUN Fan_Off()" });
  const second = await store.write("Repeat", { source: "RUN Fan_On(10)" });

  assert.equal(second.created, first.created);
  assert.equal((await store.read("Repeat.iot")).source, "RUN Fan_On(10)");
  assert.equal((await store.list()).filter((app) => app.file === "Repeat.iot").length, 1);
});

test("an older file that still has a finalized flag opens and saves", async () => {
  const old = { format: "atlas-iot-app", version: 1, name: "Old", finalized: true, source: "RUN Fan_Off()", layout: {} };
  await writeFile(join(directory, "Old.iot"), JSON.stringify(old));

  assert.equal((await store.read("Old.iot")).source, "RUN Fan_Off()");
  assert.ok((await store.list()).some((app) => app.file === "Old.iot"));

  await store.write("Old", { source: "RUN Fan_On(1)", finalized: true });
  const saved = await store.read("Old.iot");
  assert.equal(saved.source, "RUN Fan_On(1)");
  assert.equal("finalized" in saved, false, "the flag is no longer written");
});

test("the working directory is scanned, newest first, ignoring other files", async () => {
  await writeFile(join(directory, "notes.txt"), "not an app");
  const list = await store.list();

  assert.ok(list.every((app) => app.file.endsWith(".iot")));
  assert.ok(list.some((app) => app.name === "AirControl"));
  for (let i = 1; i < list.length; i++) {
    assert.ok(list[i - 1].modified >= list[i].modified, "apps are not newest first");
  }
});

test("a file that is not valid JSON is listed, not fatal", async () => {
  await writeFile(join(directory, "broken.iot"), "{ this is not json");
  const broken = (await store.list()).find((app) => app.file === "broken.iot");

  assert.equal(broken.name, "broken");
});

test("deleting removes the file from the working directory", async () => {
  await store.write("Doomed", { source: "RUN Fan_Off()" });
  await store.remove("Doomed.iot");

  assert.ok(!(await store.list()).some((app) => app.file === "Doomed.iot"));
  await assert.rejects(() => store.read("Doomed.iot"));
});

test("the saved file is readable JSON, so it can be inspected by hand", async () => {
  await store.write("Readable", { source: "RUN Fan_Off()" });
  const text = await readFile(join(directory, "Readable.iot"), "utf8");

  assert.match(text, /\n {2}"source": "RUN Fan_Off\(\)"/);
  assert.ok(text.endsWith("\n"));
});
