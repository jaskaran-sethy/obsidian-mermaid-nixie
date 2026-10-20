import * as esbuild from "esbuild";
import path from "node:path";

const shim = path.resolve("src/elk-shim.js");
// Route layout-elk's elkjs import through our shim (but let the shim reach the real one).
const elkShim = {
  name: "elk-shim",
  setup(b) {
    b.onResolve({ filter: /^elkjs\/lib\/elk\.bundled\.js$/ }, (args) =>
      args.importer === shim ? undefined : { path: shim });
  },
};
const common = { bundle: true, minify: true, platform: "browser", target: "es2020", logLevel: "warning", legalComments: "none" };

// Heavy half (ELK + renderer, ~5 MB), built first and kept in memory.
const elk = await esbuild.build({ ...common, entryPoints: ["src/elk-entry.js"], format: "cjs", plugins: [elkShim], write: false });

// main.js imports it as a string from "elk-source", so it is evaluated only on first use.
const elkSource = {
  name: "elk-source",
  setup(b) {
    b.onResolve({ filter: /^elk-source$/ }, () => ({ path: "elk-source", namespace: "elk-source" }));
    b.onLoad({ filter: /.*/, namespace: "elk-source" }, () => ({ contents: elk.outputFiles[0].text, loader: "text" }));
  },
};
await esbuild.build({ ...common, entryPoints: ["src/main.js"], format: "cjs", external: ["obsidian"], outfile: "dist/main.js", minify: false, plugins: [elkSource] });
