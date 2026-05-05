import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import { umlFlowMarkdownItPlugin } from "../src/index";

const main = () => {
  const md = new MarkdownIt({ html: true });
  md.use(umlFlowMarkdownItPlugin, { debug: false, mode: "runtime" });

  const input = [
    "# Title",
    "",
    "```mermaid",
    "graph TD",
    "A-->B",
    "```"
  ].join("\n");

  const html = md.render(input, {});
  assert.ok(html.includes("class=\"mermaid\""));
  assert.ok(html.includes("data-uml-flow-mermaid-config="));
  assert.ok(html.includes("curve"));
  assert.ok(html.includes("linear"));

  const mdAuto = new MarkdownIt({ html: true });
  mdAuto.use(umlFlowMarkdownItPlugin, { debug: false, mode: "auto" });
  const htmlAuto = mdAuto.render(input, {});
  assert.ok(htmlAuto.includes("class=\"mermaid\""));
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
