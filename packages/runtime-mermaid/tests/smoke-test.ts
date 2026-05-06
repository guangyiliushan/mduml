import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const main = async () => {
  const { renderAllMermaidBlocks } = await import(new URL("../index.js", import.meta.url).href);

  const dom = new JSDOM(
    [
      "<!doctype html>",
      "<html>",
      "<body>",
      '  <div id="root">',
      '    <div class="mermaid" data-uml-flow-mermaid-config="{\\"jumpLinks\\":{\\"enabled\\":true,\\"radius\\":4,\\"safeDistance\\":8,\\"prefer\\":\\"vertical\\",\\"side\\":{\\"vertical\\":\\"right\\",\\"horizontal\\":\\"up\\"}}}">',
      "      graph TD",
      "      A-->B",
      "    </div>",
      '    <div class="mermaid"></div>',
      "  </div>",
      "</body>",
      "</html>"
    ].join("\n")
  );

  const fakeMermaid = {
    initialize() {},
    async render() {
      return {
        svg: [
          '<svg xmlns="http://www.w3.org/2000/svg">',
          '  <g class="edgePaths">',
          '    <path id="h" stroke="black" fill="none" d="M 0 10 L 40 10" />',
          '    <path id="vDown" stroke="black" fill="none" d="M 20 0 L 20 40" />',
          "  </g>",
          "</svg>"
        ].join("\n")
      };
    }
  };

  const root = dom.window.document.getElementById("root") as unknown as ParentNode;
  await renderAllMermaidBlocks({
    root,
    mermaid: fakeMermaid
  });

  const blocks = Array.from(dom.window.document.querySelectorAll(".mermaid")) as HTMLElement[];
  assert.equal(blocks.length, 2);

  const rendered = blocks[0]!;
  assert.equal(rendered.dataset.umlFlowRendered, "true");
  assert.ok(rendered.innerHTML.includes("<svg"));
  assert.ok(rendered.innerHTML.includes("a 4 4"));

  const empty = blocks[1]!;
  assert.equal(empty.dataset.umlFlowRendered, "true");
  assert.ok(empty.innerHTML.includes("uml-flow-error"));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
