// Mermaid Nixie is deprecated and no longer works: Obsidian no longer supports Mermaid, so there is
// nothing left for it to configure. This final release (1.1.1) only tells users to uninstall it.
// The working plugin is in the history up to 1.1.0.
import { Notice, Plugin, PluginSettingTab } from "obsidian";

const MESSAGE =
  "Mermaid Nixie no longer works, because Obsidian no longer supports Mermaid diagrams. " +
  "It does nothing now; you can uninstall it from Settings → Community plugins.";

export default class MermaidNixie extends Plugin {
  onload() {
    this.addSettingTab(new DeprecatedTab(this.app, this));
    this.app.workspace.onLayoutReady(() => new Notice(MESSAGE, 15000));
  }
}

class DeprecatedTab extends PluginSettingTab {
  display() {
    this.containerEl.empty();
    this.containerEl.createEl("p", { cls: "mod-warning", text: "Deprecated: " + MESSAGE });
  }
}
