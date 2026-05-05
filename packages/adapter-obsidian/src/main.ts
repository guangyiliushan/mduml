import { App, Plugin, PluginSettingTab, Setting } from "obsidian";
import { createErrorBlockHtml, renderMermaidCodeToSvg } from "@mduml/runtime-mermaid";
import { createPlantUmlRenderer } from "@mduml/renderer-plantuml";

type UmlFlowObsidianSettings = {
  enabled: boolean;
  debug: boolean;
  mermaidUseElk: boolean;
  mermaidElkEdgeRouting: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
  plantumlLocalJarPath: string;
  plantumlTimeoutMs: number;
  plantumlEnableRemoteFallback: boolean;
  plantumlRemoteServerUrl: string;
};

const defaultSettings: UmlFlowObsidianSettings = {
  enabled: true,
  debug: false,
  mermaidUseElk: true,
  mermaidElkEdgeRouting: "ORTHOGONAL",
  plantumlLocalJarPath: "",
  plantumlTimeoutMs: 20000,
  plantumlEnableRemoteFallback: false,
  plantumlRemoteServerUrl: ""
};

export default class UmlFlowObsidianPlugin extends Plugin {
  private settings: UmlFlowObsidianSettings = defaultSettings;

  async onload() {
    this.settings = Object.assign({}, defaultSettings, await this.loadData());

    this.addSettingTab(new UmlFlowSettingTab(this.app, this));

    const plantUmlRenderer = createPlantUmlRenderer({
      config: {
        localJarPath: this.settings.plantumlLocalJarPath || undefined,
        timeoutMs: this.settings.plantumlTimeoutMs,
        enableRemoteFallback: this.settings.plantumlEnableRemoteFallback,
        remoteServerUrl: this.settings.plantumlRemoteServerUrl || undefined
      }
    });

    this.registerMarkdownCodeBlockProcessor("mermaid", async (source, el) => {
      if (!this.settings.enabled) return;
      const result = await renderMermaidCodeToSvg({
        code: source,
        config: {
          debug: this.settings.debug,
          layout: { useElk: this.settings.mermaidUseElk, elkEdgeRouting: this.settings.mermaidElkEdgeRouting },
          flowchart: { curve: "linear" },
          jumpLinks: { enabled: true, radius: 4, prefer: "verticalThenHorizontal" }
        }
      });
      el.innerHTML = result.ok ? result.svg : createErrorBlockHtml({ rendererId: "obsidian/mermaid", message: result.message });
    });

    const renderPlantUml = async (language: "plantuml" | "uml", source: string, el: HTMLElement) => {
      if (!this.settings.enabled) return;
      try {
        const output = await plantUmlRenderer.render({ code: source, language, config: {} }, { debug: this.settings.debug });
        el.innerHTML = output.content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        el.innerHTML = createErrorBlockHtml({ rendererId: "obsidian/plantuml", message });
      }
    };

    this.registerMarkdownCodeBlockProcessor("plantuml", async (source, el) => renderPlantUml("plantuml", source, el));
    this.registerMarkdownCodeBlockProcessor("uml", async (source, el) => renderPlantUml("uml", source, el));
  }

  async onunload() {}

  async saveSettings() {
    await this.saveData(this.settings);
  }

  setSettings(next: UmlFlowObsidianSettings) {
    this.settings = next;
    void this.saveSettings();
  }
}

class UmlFlowSettingTab extends PluginSettingTab {
  private plugin: UmlFlowObsidianPlugin;

  constructor(app: App, plugin: UmlFlowObsidianPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("启用渲染")
      .setDesc("关闭后不替换任何代码块展示")
      .addToggle((toggle) => {
        toggle.setValue((this.plugin as any).settings.enabled).onChange(async (value) => {
          this.plugin.setSettings({ ...(this.plugin as any).settings, enabled: value });
        });
      });

    new Setting(containerEl)
      .setName("调试模式")
      .setDesc("启用后输出更多内部日志（影响渲染性能）")
      .addToggle((toggle) => {
        toggle.setValue((this.plugin as any).settings.debug).onChange(async (value) => {
          this.plugin.setSettings({ ...(this.plugin as any).settings, debug: value });
        });
      });

    new Setting(containerEl)
      .setName("Mermaid 使用 ELK")
      .setDesc("启用后倾向横平竖直布局（推荐）")
      .addToggle((toggle) => {
        toggle.setValue((this.plugin as any).settings.mermaidUseElk).onChange(async (value) => {
          this.plugin.setSettings({ ...(this.plugin as any).settings, mermaidUseElk: value });
        });
      });

    new Setting(containerEl)
      .setName("PlantUML 本地 jar 路径")
      .setDesc("配置后可在本地渲染 PlantUML（需要系统可用 java）")
      .addText((text) => {
        text.setValue((this.plugin as any).settings.plantumlLocalJarPath).onChange(async (value) => {
          this.plugin.setSettings({ ...(this.plugin as any).settings, plantumlLocalJarPath: value });
        });
      });

    new Setting(containerEl)
      .setName("PlantUML 远程兜底")
      .setDesc("默认关闭；开启后在本地不可用时可请求远程 server 渲染")
      .addToggle((toggle) => {
        toggle.setValue((this.plugin as any).settings.plantumlEnableRemoteFallback).onChange(async (value) => {
          this.plugin.setSettings({ ...(this.plugin as any).settings, plantumlEnableRemoteFallback: value });
        });
      });

    new Setting(containerEl)
      .setName("PlantUML 远程 server URL")
      .setDesc("仅在开启远程兜底时生效")
      .addText((text) => {
        text.setValue((this.plugin as any).settings.plantumlRemoteServerUrl).onChange(async (value) => {
          this.plugin.setSettings({ ...(this.plugin as any).settings, plantumlRemoteServerUrl: value });
        });
      });
  }
}
