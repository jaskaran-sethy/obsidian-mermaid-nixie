# Mermaid Nixie

An Obsidian plugin that sets how Mermaid diagrams are laid out across your vault: the ELK layout engine with right-angle edges, plus spacing settings.

![The same diagram with Mermaid's default Dagre layout and with ELK](screenshots/desktop-3-compare.png)

## Features

- **Layout engine:** ELK (right angles, fewest bends) or Dagre (Mermaid's default).
- **Edge corners:** rounded, sharp, step, or one of the smooth curves (for diagrams that use Dagre).
- **Node spacing** and **layer spacing** sliders, which also apply to ELK (Mermaid's own ELK integration ignores them).
- **ELK node placement:** centred by default (`NETWORK_SIMPLEX`), so parents sit over their children.
- **Merge parallel edges** toggle.
- **Fast to start:** nothing is loaded when Obsidian starts. Mermaid and ELK load the first time a diagram is shown, or in the background a couple of seconds after startup if **Preload after startup** is on (the default).
- **Off the main thread:** ELK runs in a Web Worker, so laying out a diagram doesn't freeze the editor. If a worker can't be used, ELK runs on the main thread instead.
- A command to re-render diagrams in open notes.

![Mermaid Nixie settings](screenshots/desktop-4-settings.png)

These settings are only defaults. A single diagram can still override them on its first line:

```
%%{init: {"layout": "dagre"}}%%
```

It works on mobile too. Before and after:

<p>
  <img src="screenshots/mobile-2-before.png" width="240" alt="Dagre layout on a phone">
  <img src="screenshots/mobile-1.png" width="240" alt="ELK layout with Mermaid Nixie on a phone">
</p>

## Install

Download `main.js` and `manifest.json` from the [latest release](../../releases/latest) into `<vault>/.obsidian/plugins/mermaid-nixie/`, then enable **Mermaid Nixie** under *Settings → Community plugins*.

ELK is bundled into `main.js` (~2.6 MB) and only starts the first time a diagram needs it.

## How it works

Obsidian loads Mermaid the first time a diagram is shown. The plugin waits for that, then merges its settings into Mermaid's configuration after Obsidian has initialised it, and registers the ELK layout. It restores Mermaid's original settings when disabled. Layouts run in a Web Worker created from a bundled copy of ELK; the plugin makes no network requests.

## Build

```sh
npm ci
npm run build
```

The build writes `dist/main.js`, and builds on different machines produce identical files. `npm run analyze` lists what ends up in the bundle (useful after upgrading `@mermaid-js/layout-elk`, whose build patches fail loudly if its code changes). Pushing a version tag (e.g. `1.0.2`) builds the plugin on GitHub Actions, attests `main.js` and publishes the release.

## License

MIT. `main.js` bundles [@mermaid-js/layout-elk](https://github.com/mermaid-js/mermaid) (MIT) and [elkjs](https://github.com/kieler/elkjs) (EPL-2.0).
