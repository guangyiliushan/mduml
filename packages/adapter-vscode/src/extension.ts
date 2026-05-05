import type MarkdownIt from "markdown-it";
import * as vscode from "vscode";
import { umlFlowMarkdownItPlugin } from "@mduml/adapter-markdown-it";

export const activate = (_context: vscode.ExtensionContext) => {};

export const deactivate = () => {};

export const extendMarkdownIt = (md: MarkdownIt): MarkdownIt => {
  const debug = vscode.workspace.getConfiguration().get<boolean>("umlFlow.debug") ?? false;
  md.use(umlFlowMarkdownItPlugin, {
    debug,
    mode: "runtime",
    mermaid: { useElk: true, elkEdgeRouting: "ORTHOGONAL" }
  });
  return md;
};
