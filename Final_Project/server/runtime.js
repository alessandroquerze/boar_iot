// The run life cycle: ACTIVATE, STOP, and the status panel behind them.
//
// Runs live in this process only, so the status panel is empty when the IDE
// starts and whatever was running is abandoned when it stops — which is what
// the guidelines ask for. An app that ends by itself shows Completed and
// cannot be stopped; one that loops stays Active until STOP.

import { buildAst } from "../lang/ast.js";
import { runProgram } from "../lang/run.js";

let nextId = 1;

export class RunManager {
  /**
   * @param {{gateway: object, space: object, onChange: Function, onLog: Function}} deps
   */
  constructor({ gateway, space, onChange = () => {}, onLog = () => {} }) {
    this.gateway = gateway;
    this.space = space;
    this.onChange = onChange;
    this.onLog = onLog;
    this.runs = new Map();
  }

  list() {
    return [...this.runs.values()].map(({ id, file, name, startedAt, endedAt, status }) => ({
      id,
      file,
      name,
      startedAt,
      endedAt,
      status,
    }));
  }

  /** ACTIVATE: start an execution life cycle for an app. */
  activate({ file, name, source }) {
    const existing = [...this.runs.values()].find(
      (run) => run.file === file && run.status === "Active",
    );
    if (existing) return { error: `${name} is already running`, run: null };

    const run = {
      id: `r${nextId++}`,
      file,
      name,
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: "Active",
      signal: { stopped: false },
    };
    this.runs.set(run.id, run);
    this.onChange(this.list());

    // Deliberately not awaited: activation starts a life cycle, it does not
    // block the IDE.
    this.execute(run, source);
    return { error: null, run };
  }

  async execute(run, source) {
    const log = (line) => {
      this.onLog({ runId: run.id, app: run.name, ...line });
    };

    try {
      const outcome = await runProgram(buildAst(source), {
        invoke: (call) => this.invoke(call, log),
        log,
        signal: run.signal,
      });
      run.status = outcome === "stopped" ? "Stopped" : "Completed";
    } catch (error) {
      log({ kind: "error", text: `the run failed: ${error.message}` });
      run.status = "Stopped";
    }

    run.endedAt = new Date().toISOString();
    this.onChange(this.list());
  }

  /**
   * STOP: end an activation. Pending calls are abandoned and nothing further
   * is started. An app that already finished cannot be stopped.
   */
  stop(runId) {
    const run = this.runs.get(runId);
    if (!run) return { error: `no such run: ${runId}` };
    if (run.status !== "Active") return { error: `${run.name} is ${run.status.toLowerCase()}` };

    run.signal.stopped = true;
    this.onLog({ runId: run.id, app: run.name, kind: "info", text: "stop requested" });
    return { error: null };
  }

  stopAll() {
    for (const run of this.runs.values()) run.signal.stopped = true;
  }

  /** Route a call to the thing that offers it, and spell out why if we cannot. */
  async invoke(call, log) {
    const state = this.space.toJSON();
    const candidates = state.things.filter((thing) =>
      thing.entities.some((entity) => entity.services.some((service) => service.name === call.name)),
    );

    const thing = call.thing
      ? candidates.find((candidate) => candidate.id === call.thing)
      : candidates[0];

    if (!thing) {
      return {
        status: "Unsuccessful",
        result: null,
        description: call.thing
          ? `${call.thing} does not offer ${call.name}`
          : `no thing in the space offers ${call.name}`,
      };
    }
    if (!call.thing && candidates.length > 1) {
      log?.({ kind: "other", text: `${call.name} is ambiguous; using ${thing.id}` });
    }

    return this.gateway.call({
      thing: thing.id,
      space: state.space.id,
      service: call.name,
      args: call.args,
      ip: thing.ip,
      port: thing.port,
    });
  }
}
