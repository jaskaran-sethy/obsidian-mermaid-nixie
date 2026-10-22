import * as esbuild from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { elkShim, trimMermaidCopy, stubLazyDiagrams, common } from "./plugins.mjs";

// Heavy half (ELK + renderer), built first and kept in memory.
const elk = await esbuild.build({ ...common, entryPoints: ["src/elk-entry.js"], format: "cjs", plugins: [elkShim, trimMermaidCopy, stubLazyDiagrams], write: false });

// main.js imports it as a string from "elk-source", so it is evaluated only on first use.
const elkSource = {
  name: "elk-source",
  setup(b) {
    b.onResolve({ filter: /^elk-source$/ }, () => ({ path: "elk-source", namespace: "elk-source" }));
    b.onLoad({ filter: /.*/, namespace: "elk-source" }, () => ({ contents: elk.outputFiles[0].text, loader: "text" }));
  },
};
// The ELK worker script, embedded as text: it becomes a Blob worker at runtime (or runs in-process as a fallback).
const elkWorkerSource = {
  name: "elk-worker-source",
  setup(b) {
    // Keep the module path fixed ("elk-worker-source"): esbuild writes it into main.js as a comment, and a real
    // file path would leak the build machine's folders and make builds differ from machine to machine.
    const file = path.resolve("node_modules/elkjs/lib/elk-worker.min.js");
    b.onResolve({ filter: /^elk-worker-source$/ }, () => ({ path: "elk-worker-source", namespace: "elk-worker-source" }));
    b.onLoad({ filter: /.*/, namespace: "elk-worker-source" }, async () => ({ contents: await fs.readFile(file, "utf8"), loader: "text" }));
  },
};

await esbuild.build({ ...common, entryPoints: ["src/main.js"], format: "cjs", external: ["obsidian"], outfile: "dist/main.js", minify: false, plugins: [elkSource, elkWorkerSource] });
