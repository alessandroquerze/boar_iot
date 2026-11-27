// The Atlas working directory: the .iot files the developer's apps live in.
//
// The naming rules come from the guidelines: an app name is short and has no
// special characters, and the IDE always gives the file a .iot extension — if
// the developer typed name.ext, the file is name.ext.iot.

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

  async ready() {
    await mkdir(this.directory, { recursive: true });
  }

  /** Every app in the working directory, newest first. Scanned at IDE start. */
  async list() {
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

  async read(fileName) {
    const file = this.resolve(fileName);
    const app = JSON.parse(await readFile(file, "utf8"));
    return { ...app, file: basename(file) };
  }

  /**
   * Save an app. The file name is fixed once: saving again overwrites it
   * silently, so the developer can save as often as they like.
   */
  async write(rawName, { source = "", layout = {} } = {}) {
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

  async remove(fileName) {
    await unlink(this.resolve(fileName));
  }

  /** Keep every path inside the working directory. */
  resolve(fileName) {
    const safe = basename(String(fileName));
    if (!safe.endsWith(EXTENSION)) throw new Error(`not an app file: ${safe}`);
    return join(this.directory, safe);
  }

  async readQuietly(file) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch {
      return null;
    }
  }
}

/**
 * The file an app name is saved under. Always ends in .iot, and never doubles
 * it: `x` -> `x.iot`, `x.ext` -> `x.ext.iot`, `x.iot` -> `x.iot`.
 */
export function fileNameFor(rawName) {
  const name = String(rawName).trim();
  const error = nameError(name);
  if (error) throw new Error(error);

  return name.endsWith(EXTENSION) ? name : name + EXTENSION;
}

/** The app's display name: the file name without the .iot the IDE added. */
export function appNameOf(fileName) {
  return fileName.endsWith(EXTENSION) ? fileName.slice(0, -EXTENSION.length) : fileName;
}

/** Why this app name is not allowed, or null if it is. */
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
