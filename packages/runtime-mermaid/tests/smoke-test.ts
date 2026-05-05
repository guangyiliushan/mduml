import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { applySvgJumpLinks } from "../src/jump-links";

const main = () => {
  {
    const dom = new JSDOM(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <g class="edgePaths">
          <path id="h" stroke="black" fill="none" d="M 0 10 L 40 10" />
          <path id="vDown" stroke="black" fill="none" d="M 20 0 L 20 40" />
        </g>
      </svg>`,
      { contentType: "image/svg+xml" }
    );

    const svg = dom.window.document.querySelector("svg") as unknown as SVGSVGElement;
    const v = dom.window.document.getElementById("vDown") as unknown as SVGPathElement;

    applySvgJumpLinks(svg, { enabled: true, radius: 4, safeDistance: 8, prefer: "vertical", side: { vertical: "right", horizontal: "up" } });

    const d = v.getAttribute("d") ?? "";
    assert.ok(d.includes("a 4 4 0 0 1 0 8"));
  }

  {
    const dom = new JSDOM(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <g class="edgePaths">
          <path id="h" stroke="black" fill="none" d="M 0 10 L 40 10" />
          <path id="vUp" stroke="black" fill="none" d="M 20 40 L 20 0" />
        </g>
      </svg>`,
      { contentType: "image/svg+xml" }
    );

    const svg = dom.window.document.querySelector("svg") as unknown as SVGSVGElement;
    const v = dom.window.document.getElementById("vUp") as unknown as SVGPathElement;

    applySvgJumpLinks(svg, { enabled: true, radius: 4, safeDistance: 8, prefer: "vertical", side: { vertical: "right", horizontal: "up" } });

    const d = v.getAttribute("d") ?? "";
    assert.ok(d.includes("a 4 4 0 0 0 0 -8"));
  }

  {
    const dom = new JSDOM(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <g class="edgePaths">
          <path id="v" stroke="black" fill="none" d="M 20 0 L 20 40" />
          <path id="hRight" stroke="black" fill="none" d="M 0 20 L 40 20" />
        </g>
      </svg>`,
      { contentType: "image/svg+xml" }
    );

    const svg = dom.window.document.querySelector("svg") as unknown as SVGSVGElement;
    const h = dom.window.document.getElementById("hRight") as unknown as SVGPathElement;

    applySvgJumpLinks(svg, { enabled: true, radius: 4, safeDistance: 8, prefer: "horizontal", side: { vertical: "right", horizontal: "up" } });

    const d = h.getAttribute("d") ?? "";
    assert.ok(d.includes("a 4 4 0 0 0 8 0"));
  }

  {
    const dom = new JSDOM(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <g class="edgePaths">
          <path id="v" stroke="black" fill="none" d="M 20 0 L 20 40" />
          <path id="hLeft" stroke="black" fill="none" d="M 40 20 L 0 20" />
        </g>
      </svg>`,
      { contentType: "image/svg+xml" }
    );

    const svg = dom.window.document.querySelector("svg") as unknown as SVGSVGElement;
    const h = dom.window.document.getElementById("hLeft") as unknown as SVGPathElement;

    applySvgJumpLinks(svg, { enabled: true, radius: 4, safeDistance: 8, prefer: "horizontal", side: { vertical: "right", horizontal: "up" } });

    const d = h.getAttribute("d") ?? "";
    assert.ok(d.includes("a 4 4 0 0 1 -8 0"));
  }
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
