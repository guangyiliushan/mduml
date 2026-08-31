import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";

const main = async () => {
  const { umlFlowMarkdownItPlugin } = await import(new URL("../index.js", import.meta.url).href);

  const input = [
    "# Title",
    "",
    "```mermaid",
    "graph TD",
    "A-->B",
    "```",
    "",
    "```mermaid",
    "graph TD",
    "C-->D",
    "```",
    "",
    "```plantuml",
    "@startuml",
    "A -> B",
    "@enduml",
    "```"
  ].join("\n");

  const md = new MarkdownIt({ html: true });
  md.use(umlFlowMarkdownItPlugin, { debug: false, mode: "runtime" });
  const html = md.render(input, {});
  assert.ok(html.includes("class=\"mermaid\""));
  assert.ok(html.includes("data-uml-flow-mermaid-config="));
  assert.ok(html.includes("curve"));
  assert.ok(html.includes("linear"));
  assert.equal(html.split("class=\"mermaid\"").length - 1, 2);
  assert.ok(html.includes("PlantUML 需要构建期渲染"));

  const mdSplit = new MarkdownIt({ html: true });
  mdSplit.use(umlFlowMarkdownItPlugin, { debug: false, mode: { mermaid: "runtime", plantuml: "auto" } });
  const htmlSplit = mdSplit.render(input, {});
  assert.ok(htmlSplit.includes("class=\"mermaid\""));
  assert.ok(htmlSplit.includes("PlantUML"));

  const mdRemote = new MarkdownIt({ html: true });
  mdRemote.use(umlFlowMarkdownItPlugin, {
    debug: false,
    mode: "runtime",
    plantuml: { remoteRender: true }
  });
  const htmlRemote = mdRemote.render(input, {});
  assert.ok(htmlRemote.includes("<img"));
  assert.ok(htmlRemote.includes("https://www.plantuml.com/plantuml/svg/"));
  assert.ok(htmlRemote.includes("uml-flow-plantuml"));

  const mdRemoteCustom = new MarkdownIt({ html: true });
  mdRemoteCustom.use(umlFlowMarkdownItPlugin, {
    debug: false,
    mode: "runtime",
    plantuml: { remoteRender: true, remoteImageUrl: "https://uml.internal.example.com/plantuml" }
  });
  const htmlRemoteCustom = mdRemoteCustom.render(input, {});
  assert.ok(htmlRemoteCustom.includes("https://uml.internal.example.com/plantuml/svg/"));

  const mdRemoteViaServer = new MarkdownIt({ html: true });
  mdRemoteViaServer.use(umlFlowMarkdownItPlugin, {
    debug: false,
    mode: "runtime",
    plantuml: { remoteRender: true, remoteServerUrl: "https://uml.via-server.example.com/plantuml/" }
  });
  const htmlRemoteViaServer = mdRemoteViaServer.render(input, {});
  assert.ok(htmlRemoteViaServer.includes("https://uml.via-server.example.com/plantuml/svg/"));

  const mdEmpty = new MarkdownIt({ html: true });
  mdEmpty.use(umlFlowMarkdownItPlugin, { debug: false, mode: { mermaid: "build", plantuml: "build" } });
  const htmlEmpty = mdEmpty.render("```mermaid\n   \n```", {});
  assert.ok(htmlEmpty.includes("uml-flow-error"));

  if (process.env.UMLFLOW_E2E === "1") {
    const mdBuild = new MarkdownIt({ html: true });
    const t0 = Date.now();
    mdBuild.use(umlFlowMarkdownItPlugin, {
      debug: false,
      mode: { mermaid: "build", plantuml: "runtime" },
      mermaid: { useElk: true, elkEdgeRouting: "ORTHOGONAL", flowchartCurve: "linear" }
    });
    const htmlBuild = mdBuild.render(input, {});
    const elapsed = Date.now() - t0;
    assert.ok(htmlBuild.includes("<svg"));
    assert.ok(!htmlBuild.includes("class=\"mermaid\""));
    console.log(`[e2e] batch build render of 2 mermaid blocks took ${elapsed}ms (1 chromium launch)`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
