// The Atlas working directory: the .iot files the apps live in

import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const EXTENSION = ".iot";
const MAX_NAME = 32;
// A base name with no special characters, optionally followed by one extension.
const NAME_PATTERN = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)?$/;

export class AppStore {
  constructor(directory) {
    this.directory = directory;
  }

  async ready() {   // Creates the working directory if it doesn't exist
    await mkdir(this.directory, { recursive: true });
  }

  async list() {                                              // Lists every app in the working directory
    await this.ready();
    const entries = await readdir(this.directory);
    const apps = [];

    for (const entry of entries) {
      if (!entry.endsWith(EXTENSION)) continue;

      const file = join(this.directory, entry);
      const [info, app] = await Promise.all([stat(file), this.readQuietly(file)]);
      apps.push({
        file: entry,
        name: app?.name ?? entry.slice(0, -EXTENSION.length),
        modified: info.mtime.toISOString(),
      });
    }

    return apps.sort((a, b) => b.modified.localeCompare(a.modified));
  }

  async read(fileName) {                                      // Loads the app and returns all its content
    const file = this.resolve(fileName);
    const app = JSON.parse(await readFile(file, "utf8"));
    return { ...app, file: basename(file) };
  }

  async write(rawName, { source = "", layout = {} } = {}) {   // Saves the app
    await this.ready();

    const fileName = fileNameFor(rawName);
    const file = this.resolve(fileName);
    const existing = await this.readQuietly(file);

    const app = {
      format: "atlas-iot-app",
      version: 1,
      name: appNameOf(fileName),
      created: existing?.created ?? new Date().toISOString(),
      modified: new Date().toISOString(),
      source,
      layout,
    };

    await writeFile(file, `${JSON.stringify(app, null, 2)}\n`);
    return { ...app, file: fileName };
  }

  async remove(fileName) {                                    // Delete the app
    await unlink(this.resolve(fileName));
  }

  resolve(fileName) {                                         // Finds the app path
    const safe = basename(String(fileName));
    if (!safe.endsWith(EXTENSION)) throw new Error(`not an app file: ${safe}`);
    return join(this.directory, safe);
  }

  async readQuietly(file) {                                   // File parsing
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      return null;
    }
  }
}

export function fileNameFor(rawName) {                        // Turns the name gave by the user in the file name
  const name = String(rawName).trim();
  const error = nameError(name);
  if (error) throw new Error(error);

  return name.endsWith(EXTENSION) ? name : name + EXTENSION;
}

export function appNameOf(fileName) {
  return fileName.endsWith(EXTENSION) ? fileName.slice(0, -EXTENSION.length) : fileName;
}

export function nameError(rawName) {
  const name = String(rawName ?? "").trim();
  if (name === "") return "an app needs a name";
  if (name.length > MAX_NAME) return `an app name is at most ${MAX_NAME} characters`;
  if (name !== basename(name) || name.includes("/") || name.includes("\\")) {
    return "an app name cannot contain a path";
  }

  const base = name.endsWith(EXTENSION) ? name.slice(0, -EXTENSION.length) : name;
  if (base === "") return "an app needs a name";
  if (!NAME_PATTERN.test(base)) {
    return "an app name may only use letters, digits, - and _";
  }
  return null;
}
