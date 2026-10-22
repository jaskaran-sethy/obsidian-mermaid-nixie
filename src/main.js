import { Plugin, PluginSettingTab, Setting, loadMermaid, debounce } from "obsidian";
// The ELK renderer as source text (see build.mjs). Obsidian only installs main.js, so it lives in here.
import ELK_SOURCE from "elk-source";
import { ElkEngine } from "./engine.js";

const DEFAULTS = {
  layout: "elk",
  curve: "rounded",
  nodeSpacing: 30,
  layerSpacing: 40,
  // Mermaid's own ELK default (Brandes-Koepf, alignment NONE) pushes parents off-centre.
  placement: "NETWORK_SIMPLEX",
  mergeEdges: false,
  // Load Mermaid and warm up ELK shortly after startup instead of when the first diagram is shown.
  preload: true,
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
    this.engine = new ElkEngine();
    this.addSettingTab(new MermaidNixieTab(this.app, this));
    this.addCommand({
      id: "rerender",
      name: "Re-render diagrams in open notes",
      callback: () => this.rerender(),
    });
    this.saveAndRefresh = debounce(async () => {
      await this.saveData(this.settings);
      if (this.mermaid) {
        this.apply();
        this.rerender();
      }
    }, 400, true);

    if (window.mermaid) {
      // Mermaid was already loaded, so diagrams may have drawn with the old settings: redo them once the workspace is up.
      this.attach(window.mermaid, true);
      this.app.workspace.onLayoutReady(() => this.rerender());
    } else {
      // Obsidian only loads Mermaid (~3 MB) when the first diagram is shown, so don't load it at startup.
      // Wait for it instead, and set up our config the moment it arrives.
      this.waitForMermaid();
      if (this.settings.preload) this.app.workspace.onLayoutReady(() => this.preloadWhenIdle());
    }
  }

  // A couple of seconds after startup, when the app is idle, load Mermaid ourselves so the first diagram
  // doesn't have to. Obsidian's loader assigns window.mermaid, which our hook in waitForMermaid() catches.
  preloadWhenIdle() {
    this.preloadTimer = setTimeout(() => {
      const run = () => { if (!window.mermaid || !this.mermaid) loadMermaid().catch(() => {}); };
      if (window.requestIdleCallback) window.requestIdleCallback(run, { timeout: 5000 });
      else run();
    }, 2000);
  }

  onunload() {
    clearTimeout(this.preloadTimer);
    if (this.trap && Object.getOwnPropertyDescriptor(window, "mermaid")?.get === this.trap) delete window.mermaid;
    if (this.mermaid) {
      this.mermaid.initialize = this.originalInitialize;
      if (this.original) this.mermaid.mermaidAPI.updateSiteConfig(this.original);
      this.rerender();
    }
    this.engine.dispose();
  }

  // Obsidian loads Mermaid with a script that assigns `window.mermaid`, then calls `mermaid.initialize(...)`.
  // Catch the assignment, and re-apply our config after every initialize so it always has the last word.
  waitForMermaid() {
    let value;
    this.trap = () => value;
    try {
      Object.defineProperty(window, "mermaid", {
        configurable: true,
        enumerable: true,
        get: this.trap,
        set: (v) => {
          // Put back an ordinary property so nothing else ever sees our hook.
          Object.defineProperty(window, "mermaid", { value: v, writable: true, configurable: true, enumerable: true });
          this.attach(v, false);
        },
      });
    } catch {
      // The property can't be watched here, so fall back to loading Mermaid ourselves (off the startup path).
      this.app.workspace.onLayoutReady(async () => {
        this.attach(await loadMermaid(), true);
        this.rerender();
      });
    }
  }

  attach(mermaid, applyNow) {
    if (this.mermaid) return;
    this.mermaid = mermaid;
    const plugin = this;
    this.originalInitialize = mermaid.initialize;
    mermaid.initialize = function (...args) {
      const result = plugin.originalInitialize.apply(this, args);
      plugin.apply();
      return result;
    };
    if (applyNow) this.apply();
    // Mermaid takes a while to load and start; get the layout engine ready in the meantime.
    this.engine.warm(this.settings.placement);
  }

  // Merge our settings into Obsidian's Mermaid config (updateSiteConfig keeps everything else).
  apply() {
    const mermaid = this.mermaid;
    const api = mermaid.mermaidAPI;
    if (!this.registered) {
      mermaid.registerLayoutLoaders(ELK_ALGORITHMS.map(([name, algorithm]) => ({
        name,
        algorithm,
        loader: async () => (await this.loadElk()).loadRender(),
      })));
      this.registered = true;
    }
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

  // The renderer is ~1 MB of source, kept as a string and only evaluated the first time a diagram needs ELK.
  loadElk() {
    if (!this.elkPromise) {
      this.elkPromise = (async () => {
        const module = { exports: {} };
        new Function("module", "exports", ELK_SOURCE)(module, module.exports);
        this.elk = module.exports;
        this.elk.elkRuntime.engine = this.engine;
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
    this.elk.elkRuntime.layoutOptions = {
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
      .setName("Preload after startup")
      .setDesc("A couple of seconds after Obsidian starts, load Mermaid and warm up the layout engine in the background so your first diagram appears faster. Turn off to load them only when a diagram is first shown. Takes effect next start.")
      .addToggle((t) => t.setValue(s.preload).onChange(change("preload")));

    new Setting(containerEl)
      .addButton((b) => b.setButtonText("Reset to defaults").onClick(() => {
        Object.assign(s, DEFAULTS);
        this.plugin.saveAndRefresh();
        this.display();
      }));
  }
}
