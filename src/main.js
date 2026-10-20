import { Plugin, PluginSettingTab, Setting, loadMermaid, debounce } from "obsidian";

const DEFAULTS = {
  layout: "elk",
  curve: "rounded",
  nodeSpacing: 30,
  layerSpacing: 40,
  // Mermaid's own ELK default (Brandes-Koepf, alignment NONE) pushes parents off-centre.
  placement: "NETWORK_SIMPLEX",
  mergeEdges: false,
};

const LAYOUTS = {
  elk: "ELK: right angles, fewest bends",
  dagre: "Dagre: Mermaid's default",
};

const CURVES = {
  rounded: "Rounded corners",
  linear: "Sharp corners",
  step: "Step",
  basis: "Smooth (Mermaid default)",
  monotoneX: "Smooth, no overshoot",
  bumpX: "S-curves",
  natural: "Natural",
  catmullRom: "Catmull-Rom",
};

const PLACEMENTS = {
  NETWORK_SIMPLEX: "Centred, straight edges (default)",
  BRANDES_KOEPF: "Compact",
  LINEAR_SEGMENTS: "Keep long edges straight",
  SIMPLE: "Simple",
};

// Same names and algorithms as @mermaid-js/layout-elk registers.
const ELK_ALGORITHMS = [
  ["elk", "elk.layered"],
  ["elk.stress", "elk.stress"],
  ["elk.force", "elk.force"],
  ["elk.mrtree", "elk.mrtree"],
  ["elk.sporeOverlap", "elk.sporeOverlap"],
];

export default class MermaidNixie extends Plugin {
  async onload() {
    this.settings = Object.assign({}, DEFAULTS, await this.loadData());
    this.addSettingTab(new MermaidNixieTab(this.app, this));
    this.addCommand({
      id: "rerender",
      name: "Re-render diagrams in open notes",
      callback: () => this.rerender(),
    });
    this.saveAndRefresh = debounce(async () => {
      await this.saveData(this.settings);
      await this.apply();
      this.rerender();
    }, 400, true);

    // Apply before notes render; anything drawn earlier is redrawn once the layout is ready.
    await this.apply();
    this.app.workspace.onLayoutReady(() => this.rerender());
  }

  async onunload() {
    if (!this.original) return;
    const mermaid = await loadMermaid();
    mermaid.mermaidAPI.updateSiteConfig(this.original);
    this.rerender();
  }

  // Merge our settings into Obsidian's Mermaid config (updateSiteConfig keeps everything else).
  async apply() {
    const mermaid = await loadMermaid();
    if (!this.registered) {
      mermaid.registerLayoutLoaders(ELK_ALGORITHMS.map(([name, algorithm]) => ({
        name,
        algorithm,
        loader: async () => (await this.loadElk()).loadRender(),
      })));
      this.registered = true;
    }
    const api = mermaid.mermaidAPI;
    if (!this.original) {
      const site = api.getSiteConfig();
      this.original = {
        layout: site.layout,
        flowchart: {
          curve: site.flowchart?.curve,
          nodeSpacing: site.flowchart?.nodeSpacing,
          rankSpacing: site.flowchart?.rankSpacing,
        },
        elk: { ...site.elk },
      };
    }
    const s = this.settings;
    api.updateSiteConfig({
      layout: s.layout,
      flowchart: { curve: s.curve, nodeSpacing: s.nodeSpacing, rankSpacing: s.layerSpacing },
      elk: { nodePlacementStrategy: s.placement, mergeEdges: s.mergeEdges },
    });
    this.syncElk();
  }

  // elk.js is ~5 MB, so it is only read and evaluated the first time a diagram needs ELK.
  loadElk() {
    if (!this.elkPromise) {
      this.elkPromise = (async () => {
        const code = await this.app.vault.adapter.read(`${this.manifest.dir}/elk.js`);
        const module = { exports: {} };
        new Function("module", "exports", code)(module, module.exports);
        this.elk = module.exports;
        this.syncElk();
        return this.elk;
      })();
      this.elkPromise.catch(() => { this.elkPromise = null; });
    }
    return this.elkPromise;
  }

  // Mermaid's ELK integration ignores nodeSpacing/rankSpacing, so hand them to the ELK shim directly.
  syncElk() {
    if (!this.elk) return;
    this.elk.elkOverrides.layoutOptions = {
      "elk.spacing.nodeNode": this.settings.nodeSpacing,
      "elk.layered.spacing.nodeNodeBetweenLayers": this.settings.layerSpacing,
    };
  }

  // Redraw open notes that contain a diagram (reading view and live preview).
  rerender() {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (!leaf.view.containerEl.querySelector(".mermaid")) continue;
      if (typeof leaf.rebuildView === "function") leaf.rebuildView();
      else leaf.view.previewMode?.rerender(true);
    }
  }
}

class MermaidNixieTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    const s = this.plugin.settings;
    const change = (key) => (value) => {
      s[key] = value;
      this.plugin.saveAndRefresh();
    };
    containerEl.empty();

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: 'These are defaults. A single diagram can still override them, e.g. %%{init: {"layout": "dagre"}}%% on its first line.',
    });

    new Setting(containerEl)
      .setName("Layout engine")
      .setDesc("ELK routes edges at right angles with as few bends as it can, always with rounded corners. Diagrams with loops may be arranged differently from Dagre.")
      .addDropdown((d) => d.addOptions(LAYOUTS).setValue(s.layout).onChange((v) => {
        change("layout")(v);
        this.display();
      }));

    // Mermaid's ELK renderer always draws rounded orthogonal edges and ignores `curve`.
    new Setting(containerEl)
      .setName("Edge corners")
      .setDesc(s.layout === "elk"
        ? "Used by diagrams that opt into Dagre. ELK diagrams always use rounded corners."
        : "How edges bend.")
      .addDropdown((d) => d.addOptions(CURVES).setValue(s.curve).onChange(change("curve")));

    new Setting(containerEl)
      .setName("Node spacing")
      .setDesc("Gap between nodes in the same column or row (px).")
      .addSlider((sl) => sl.setLimits(10, 120, 5).setValue(s.nodeSpacing).setDynamicTooltip().onChange(change("nodeSpacing")));

    new Setting(containerEl)
      .setName("Layer spacing")
      .setDesc("Gap between each step of the flow (px).")
      .addSlider((sl) => sl.setLimits(10, 200, 5).setValue(s.layerSpacing).setDynamicTooltip().onChange(change("layerSpacing")));

    if (s.layout === "elk") {
      new Setting(containerEl).setName("ELK").setHeading();

      new Setting(containerEl)
        .setName("Node placement")
        .setDesc("How ELK lines nodes up within each layer.")
        .addDropdown((d) => d.addOptions(PLACEMENTS).setValue(s.placement).onChange(change("placement")));

      new Setting(containerEl)
        .setName("Merge parallel edges")
        .setDesc("Edges from the same node share a trunk before splitting.")
        .addToggle((t) => t.setValue(s.mergeEdges).onChange(change("mergeEdges")));
    }

    new Setting(containerEl)
      .addButton((b) => b.setButtonText("Reset to defaults").onClick(() => {
        Object.assign(s, DEFAULTS);
        this.plugin.saveAndRefresh();
        this.display();
      }));
  }
}
