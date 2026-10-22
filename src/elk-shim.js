// Stands in for "elkjs/lib/elk.bundled.js" inside @mermaid-js/layout-elk. ELK itself no longer lives in
// this bundle: layouts are handed to the plugin's engine (src/engine.js), which runs it in a worker.
// Mermaid's ELK integration also hard-codes spacing, so before each layout we write the plugin's spacing
// onto the root graph and every subgraph.
export const elkRuntime = { layoutOptions: null, engine: null };

function apply(node, opts) {
  if (!node.children?.length) return;
  node.layoutOptions = { ...node.layoutOptions, ...opts };
  for (const child of node.children) apply(child, opts);
}

export default class ELK {
  layout(graph, options) {
    if (elkRuntime.layoutOptions) apply(graph, elkRuntime.layoutOptions);
    return elkRuntime.engine.layout(graph, options);
  }
}
