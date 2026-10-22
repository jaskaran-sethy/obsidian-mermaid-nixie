import * as esbuild from "esbuild";
import { elkShim, trimMermaidCopy, stubLazyDiagrams, common } from "./plugins.mjs";

const r = await esbuild.build({ ...common, entryPoints: ["src/elk-entry.js"], format: "cjs", plugins: [elkShim, trimMermaidCopy, stubLazyDiagrams], write: false, metafile: true });
const out = r.metafile.outputs[Object.keys(r.metafile.outputs)[0]];
const rows = Object.entries(out.inputs).map(([k, v]) => [k.replace(/^.*node_modules\//, ""), v.bytesInOutput]).sort((a, b) => b[1] - a[1]);
console.log("total output", (out.bytes / 1024) | 0, "KB");
for (const [k, v] of rows.slice(0, 16)) console.log(String((v / 1024) | 0).padStart(6), "KB ", k);
console.log("\nwho imports the diagram-type chunks:");
for (const [k, v] of Object.entries(r.metafile.inputs)) for (const i of v.imports) if (/(sequenceDiagram|architectureDiagram|c4Diagram|swimlanes|cose-bilkent)/.test(i.path)) console.log(" ", k.replace(/^.*node_modules\//, ""), "->", i.path.replace(/^.*chunks\//, ""), i.kind);
