// The renderer half of the plugin (layout-elk's node/edge painters), built to a string that main.js
// evaluates the first time a diagram needs ELK.
import layouts from "@mermaid-js/layout-elk/dist/mermaid-layout-elk.core.mjs";
export { elkRuntime } from "./elk-shim.js";

// Every ELK algorithm shares the same renderer module.
export const loadRender = () => layouts[0].loader();
