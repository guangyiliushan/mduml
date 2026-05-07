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

  const svgProto = (dom.window as any).SVGElement?.prototype;
  if (svgProto && typeof svgProto.getBBox !== "function") {
    svgProto.getBBox = function getBBox() {
      const el = this as any;
      if (el?.tagName?.toLowerCase?.() === "rect") {
        const x = Number(el.getAttribute("x") ?? "0");
        const y = Number(el.getAttribute("y") ?? "0");
        const width = Number(el.getAttribute("width") ?? "0");
        const height = Number(el.getAttribute("height") ?? "0");
        return { x, y, width, height };
      }
      const rect = el?.querySelector?.("rect");
      if (rect) {
        const x = Number(rect.getAttribute("x") ?? "0");
        const y = Number(rect.getAttribute("y") ?? "0");
        const width = Number(rect.getAttribute("width") ?? "0");
        const height = Number(rect.getAttribute("height") ?? "0");
        return { x, y, width, height };
      }
      return { x: 0, y: 0, width: 0, height: 0 };
    };
  }

  const fakeMermaid = {
    initialize() {},
    async render() {
      return {
        svg: [
          '<svg xmlns="http://www.w3.org/2000/svg">',
          '  <g class="nodes">',
          '    <g class="node" id="A"><rect x="200" y="200" width="80" height="40"/></g>',
          '    <g class="node" id="B"><rect x="40" y="60" width="80" height="40"/></g>',
          "  </g>",
          '  <g class="edgePaths">',
          '    <path id="h" stroke="black" fill="none" d="M 0 10 L 40 10" />',
          '    <path id="vDown" stroke="black" fill="none" d="M 20 0 L 20 40" />',
          '    <path id="diag" stroke="black" fill="none" d="M 0 0 L 10 10" />',
          '    <path id="AtoB" stroke="black" fill="none" d="M 240 240 L 80 60" />',
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
  assert.ok(rendered.innerHTML.includes("id=\"diag\""));

  const svg = rendered.querySelector("svg") as unknown as SVGSVGElement | null;
  assert.ok(svg);

  const nodeA = dom.window.document.getElementById("A") as unknown as SVGGElement | null;
  const nodeB = dom.window.document.getElementById("B") as unknown as SVGGElement | null;
  assert.ok(nodeA);
  assert.ok(nodeB);
  const parseTranslateY = (el: Element) => {
    const t = el.getAttribute("transform") ?? "";
    const m = /translate\(\s*(-?\d*\.?\d+)\s+(-?\d*\.?\d+)\s*\)/.exec(t);
    return m ? Number(m[2]) : 0;
  };
  const dyA = parseTranslateY(nodeA as unknown as Element);
  const dyB = parseTranslateY(nodeB as unknown as Element);
  assert.ok(Number.isFinite(dyA));
  assert.ok(Number.isFinite(dyB));

  const e = dom.window.document.getElementById("AtoB") as unknown as SVGPathElement | null;
  assert.ok(e);
  const ed = e?.getAttribute("d") ?? "";
  assert.ok(!/[cqsat]/i.test(ed));
  assert.ok(!/[cqstaz]/i.test(ed));
  const pts2: { x: number; y: number }[] = [];
  const rx2 = /([ML])\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  for (;;) {
    const m = rx2.exec(ed);
    if (!m) break;
    pts2.push({ x: Number(m[2]), y: Number(m[3]) });
  }
  assert.ok(pts2.length >= 2);

  const diagPath = dom.window.document.getElementById("diag") as unknown as SVGPathElement | null;
  assert.ok(diagPath);
  const d = diagPath?.getAttribute("d") ?? "";
  const pts: { x: number; y: number }[] = [];
  const rx = /([ML])\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)\s*(-?\d*\.?\d+(?:e[-+]?\d+)?)/gi;
  for (;;) {
    const m = rx.exec(d);
    if (!m) break;
    pts.push({ x: Number(m[2]), y: Number(m[3]) });
  }
  assert.ok(pts.length >= 2);

  const empty = blocks[1]!;
  assert.equal(empty.dataset.umlFlowRendered, "true");
  assert.ok(empty.innerHTML.includes("uml-flow-error"));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
