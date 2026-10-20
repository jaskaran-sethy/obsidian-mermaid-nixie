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
const common = { bundle: true, minify: true, platform: "browser", target: "es2020", plugins: [elkShim], logLevel: "warning", legalComments: "none" };
// main.js stays small; elk.js (ELK + renderer, ~5 MB) is loaded by the plugin on first use.
await esbuild.build({ ...common, entryPoints: ["src/main.js"], format: "cjs", external: ["obsidian"], outfile: "dist/main.js", minify: false });
await esbuild.build({ ...common, entryPoints: ["src/elk-entry.js"], format: "cjs", outfile: "dist/elk.js" });
