// Runs ELK for the diagrams. By default it lives in a Web Worker, so layout never blocks the editor and
// the engine can warm up while Mermaid is still loading. If a worker can't be used (blocked, fails to
// start, or a graph can't be copied to it) the same ELK code runs on the main thread instead.
import ELKApi from "elkjs/lib/elk-api.js";
// The text of elkjs/lib/elk-worker.min.js (see build.mjs). That one file is both a worker script and,
// when evaluated on the main thread, a module exporting an in-process stand-in for a worker.
import WORKER_SOURCE from "elk-worker-source";

const START_TIMEOUT_MS = 15000;

const timeout = (ms) => new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));

export class ElkEngine {
  constructor() {
    this.remote = null;
    this.local = null;
    this.workerUnusable = false;
    this.warmed = false;
  }

  // One shared worker. Every diagram talks to it through this single ELK client.
  remoteEngine() {
    if (!this.remote) {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" }));
      const worker = new Worker(url);
      const api = new ELKApi({ workerFactory: () => worker });
      // A worker that fails to load never answers: catch its error event, and give it a deadline as a backstop.
      const failed = new Promise((resolve) => worker.addEventListener("error", () => resolve(false), { once: true }));
      const ready = Promise.race([api.knownLayoutAlgorithms().then(() => true), failed, timeout(START_TIMEOUT_MS)])
        .catch(() => false)
        .then((ok) => { if (!ok) this.workerUnusable = true; return ok; });
      this.remote = { api, worker, url, ready };
    }
    return this.remote;
  }

  localEngine() {
    if (!this.local) {
      const module = { exports: {} };
      new Function("module", "exports", WORKER_SOURCE)(module, module.exports);
      const FakeWorker = module.exports.Worker;
      this.local = new ELKApi({ workerFactory: () => new FakeWorker() });
    }
    return this.local;
  }

  async layout(graph, options) {
    if (!this.workerUnusable) {
      try {
        const remote = this.remoteEngine();
        if (await remote.ready) return await remote.api.layout(graph, options);
      } catch (e) {
        if (e?.name !== "DataCloneError") {
          // A worker that can't even be created is unusable; anything else is a real layout error.
          if (!this.remote) this.workerUnusable = true;
          else throw e;
        }
        // DataCloneError: this graph can't be copied to the worker. It was not modified, so lay it out here.
      }
    }
    return this.localEngine().layout(graph, options);
  }

  // Start the worker and run a tiny layout so ELK is compiled and warm before the first real diagram.
  warm(placement) {
    if (this.warmed || this.workerUnusable) return;
    this.warmed = true;
    try {
      const remote = this.remoteEngine();
      const node = (id) => ({ id, width: 80, height: 30 });
      remote.ready.then((ok) => ok && remote.api.layout({
        id: "root",
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.hierarchyHandling": "INCLUDE_CHILDREN",
          "nodePlacement.strategy": placement,
        },
        children: [node("a"), node("b"), node("c"), node("d")],
        edges: [
          { id: "e1", sources: ["a"], targets: ["b"] },
          { id: "e2", sources: ["a"], targets: ["c"] },
          { id: "e3", sources: ["b"], targets: ["d"] },
        ],
      })).catch(() => {});
    } catch {
      this.workerUnusable = true;
    }
  }

  dispose() {
    if (this.remote) {
      this.remote.worker.terminate();
      URL.revokeObjectURL(this.remote.url);
      this.remote = null;
    }
    // The in-process stand-in for a worker has nothing to terminate (and no terminate()), so ignore that.
    try { this.local?.terminateWorker(); } catch {}
    this.local = null;
    this.warmed = false;
  }
}
