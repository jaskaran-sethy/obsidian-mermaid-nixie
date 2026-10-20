// Heavy half of the plugin, built to elk.js and loaded on first use.
import layouts from "@mermaid-js/layout-elk/dist/mermaid-layout-elk.core.mjs";
export { elkOverrides } from "./elk-shim.js";

// Every ELK algorithm shares the same renderer module.
export const loadRender = () => layouts[0].loader();
