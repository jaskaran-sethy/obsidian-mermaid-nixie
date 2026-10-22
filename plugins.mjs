import fs from "node:fs/promises";
import path from "node:path";

export const shim = path.resolve("src/elk-shim.js");
// layout-elk imports the bundled ELK. Route that to our shim, which hands layouts to the plugin's engine
// (src/engine.js, ELK in a Web Worker) so ELK itself is not part of the renderer bundle.
export const elkShim = {
  name: "elk-shim",
  setup(b) {
    b.onResolve({ filter: /^elkjs\/lib\/elk\.bundled\.js$/ }, () => ({ path: shim }));
  },
};

// layout-elk 0.2.3 bundles a complete second copy of Mermaid (its own parser, every diagram type,
// and the node/edge/cluster painters). The painters are needed. The parsers are not, but two
// statements keep all of them in the bundle: a call through `mermaid_default.mermaidAPI`, and a
// `window` "load" listener that would start a second Mermaid on the page. Neither is wanted, so cut
// them. Every patch must match exactly once so a layout-elk upgrade fails the build, not the plugin.
const PATCHES = [
  ["mermaid_default.mermaidAPI.setConfig(elkContext.getConfig());", "setConfig(elkContext.getConfig());"],
  ['if (typeof document !== "undefined") {\n  window.addEventListener("load", contentLoaded, false);\n}\n', ""],
];
export const trimMermaidCopy = {
  name: "trim-mermaid-copy",
  setup(b) {
    b.onLoad({ filter: /layout-elk[\\/]dist[\\/].*\.mjs$/ }, async (args) => {
      let src = await fs.readFile(args.path, "utf8");
      // `__name(fn, "fn")` only sets fn.name, but as a bare statement esbuild must assume it has effects,
      // which keeps `fn` (and so everything it reaches) alive. Mark it pure so unused code can go.
      src = src.replace(/^(__name2?\()/gm, "/* @__PURE__ */ $1");
      if (/render-[A-Z0-9]+\.mjs$/.test(args.path)) {
        for (const [from, to] of PATCHES) {
          const hits = src.split(from).length - 1;
          if (hits !== 1) throw new Error(`trim-mermaid-copy: expected 1 match in ${path.basename(args.path)}, found ${hits} for: ${from.slice(0, 70)}`);
          src = src.replace(from, () => to);
        }
      }
      return { contents: src, loader: "js", resolveDir: path.dirname(args.path) };
    });
  },
};

// The copy's lazy loaders for every diagram type and for its other layout engines (dagre, cose-bilkent,
// swimlanes) are `import()`s of two-hash files like sequenceDiagram-WJ2MYXX4-Q2IOPB4R.mjs. Nothing on the ELK
// paint path calls them, so resolve them to an empty module. (katex and the render chunk have one hash: kept.)
export const stubLazyDiagrams = {
  name: "stub-lazy-diagrams",
  setup(b) {
    b.onResolve({ filter: /-[A-Z0-9]{8}-[A-Z0-9]{8}\.mjs$/ }, (args) =>
      args.kind === "dynamic-import" && /layout-elk/.test(args.importer)
        ? { path: path.basename(args.path), namespace: "stub-lazy-diagram" }
        : undefined);
    b.onLoad({ filter: /.*/, namespace: "stub-lazy-diagram" }, () => ({ contents: "export default {};", loader: "js" }));
  },
};

export const common = { bundle: true, minify: true, platform: "browser", target: "es2020", logLevel: "warning", legalComments: "none" };
