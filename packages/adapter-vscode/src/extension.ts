import path from "node:path";
import type MarkdownIt from "markdown-it";
import * as vscode from "vscode";
import { umlFlowMarkdownItPlugin } from "@mduml/adapter-markdown-it";

export const activate = (_context: vscode.ExtensionContext) => {
  return {
    extendMarkdownIt
  };
};

export const deactivate = () => {};

export const extendMarkdownIt = (md: MarkdownIt): MarkdownIt => {
  const config = vscode.workspace.getConfiguration();
  const debug = config.get<boolean>("umlFlow.debug") ?? false;
  md.use(umlFlowMarkdownItPlugin, {
    debug,
    mode: { mermaid: "runtime", plantuml: "auto" },
    mermaid: { useElk: true, elkEdgeRouting: "ORTHOGONAL" },
    plantuml: {
      localJarPath: config.get<string>("umlFlow.plantuml.localJarPath") || undefined,
      remoteRender: config.get<boolean>("umlFlow.plantuml.remoteRender") ?? false,
      remoteServerUrl: config.get<string>("umlFlow.plantuml.remoteServerUrl") || undefined
    },
    cliDir: path.join(__dirname, "cli")
  });
  return md;
};
