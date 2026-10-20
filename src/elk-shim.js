// Stands in for "elkjs/lib/elk.bundled.js" inside @mermaid-js/layout-elk.
// Mermaid's ELK integration hard-codes spacing, so before each layout we
// write the plugin's spacing onto the root graph and every subgraph.
import RealELK from "elkjs/lib/elk.bundled.js";

export const elkOverrides = { layoutOptions: null };

function apply(node, opts) {
  if (!node.children?.length) return;
  node.layoutOptions = { ...node.layoutOptions, ...opts };
  for (const child of node.children) apply(child, opts);
}

export default class ELK extends RealELK {
  layout(graph, options) {
    if (elkOverrides.layoutOptions) apply(graph, elkOverrides.layoutOptions);
    return super.layout(graph, options);
  }
}
