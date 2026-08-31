import mermaid from "mermaid";
import MarkdownIt from "markdown-it";
import { renderMermaidCodeToSvg, renderAllMermaidBlocks } from "../packages/runtime-mermaid/src/index";
import { umlFlowMarkdownItPlugin } from "../packages/adapter-markdown-it/src/index";
import { examples, type Example } from "./examples";

const galleryEl = document.querySelector<HTMLDivElement>("#gallery")!;
const galleryStatusEl = document.querySelector<HTMLDivElement>("#gallery-status")!;
const mdSourceEl = document.querySelector<HTMLTextAreaElement>("#md-source")!;
const mdRenderBtn = document.querySelector<HTMLButtonElement>("#md-render")!;
const mdOutputEl = document.querySelector<HTMLDivElement>("#md-output")!;
const mdStatusEl = document.querySelector<HTMLDivElement>("#md-status")!;

let mermaidSeq = 0;

async function renderGallery() {
  galleryEl.innerHTML = "";
  galleryStatusEl.textContent = "渲染中...";
  for (const example of examples) {
    galleryEl.appendChild(await renderCard(example));
  }
  galleryStatusEl.textContent = `完成（${examples.length} 例）`;
}

async function renderCard(example: Example): Promise<HTMLElement> {
  const card = document.createElement("div");
  card.className = "card";

  const head = document.createElement("div");
  head.className = "card-head";
  head.innerHTML = `<span class="name">${escapeHtml(example.name)}</span>` +
    `<span class="badge ${example.engine}">${escapeHtml(example.engine)}</span>` +
    `<span class="badge type">${escapeHtml(example.umlType)}</span>`;
  card.appendChild(head);

  if (example.engine === "mermaid") {
    const raw = document.createElement("div");
    raw.className = "canvas";
    raw.innerHTML = `<div class="canvas-label">mermaid 原始（dagre 曲线）</div>`;
    const ortho = document.createElement("div");
    ortho.className = "canvas";
    ortho.innerHTML = `<div class="canvas-label">MDUML 正交（直角 + 跳线）</div>`;
    card.appendChild(raw);
    card.appendChild(ortho);

    try {
      mermaid.initialize({ startOnLoad: false, securityLevel: "loose", flowchart: { defaultRenderer: "dagre" } });
      const { svg } = await mermaid.render(`raw-${++mermaidSeq}`, example.source);
      raw.innerHTML = `<div class="canvas-label">mermaid 原始（dagre 曲线）</div>` + svg;
    } catch (error) {
      raw.innerHTML = `<div class="err">${escapeHtml(String(error))}</div>`;
    }

    const result = await renderMermaidCodeToSvg({ code: example.source });
    ortho.innerHTML = result.ok
      ? `<div class="canvas-label">MDUML 正交（直角 + 跳线）</div>` + result.svg
      : `<div class="err">${escapeHtml(result.message)}</div>`;
  } else {
    const canvas = document.createElement("div");
    canvas.className = "canvas";
    canvas.innerHTML = `<div class="canvas-label">PlantUML 规范布局</div>`;
    card.appendChild(canvas);
    try {
      const svg = await renderPlantUml(example);
      canvas.innerHTML = `<div class="canvas-label">PlantUML 规范布局</div>` + svg;
    } catch (error) {
      canvas.innerHTML = `<div class="err">${escapeHtml(String(error))}</div>`;
    }
  }

  return card;
}

async function renderPlantUml(example: Example): Promise<string> {
  try {
    const pre = await fetch(`./generated/${example.id}.svg`);
    if (pre.ok) return await pre.text();
  } catch {}

  const response = await fetch("https://kroki.io/plantuml/svg", {
    method: "POST",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body: example.source
  });
  if (!response.ok) throw new Error(`Kroki HTTP ${response.status}`);
  return await response.text();
}

function setupPlayground() {
  const md = new MarkdownIt({ html: true });
  md.use(umlFlowMarkdownItPlugin, {
    mode: { mermaid: "runtime", plantuml: "runtime" },
    mermaid: { useElk: true, elkEdgeRouting: "ORTHOGONAL" },
    plantuml: { remoteRender: true }
  });

  mdRenderBtn.addEventListener("click", async () => {
    const source = mdSourceEl.value;
    mdStatusEl.textContent = "渲染中...";
    mdOutputEl.innerHTML = md.render(source);
    await renderAllMermaidBlocks({ root: mdOutputEl });
    mdStatusEl.textContent = "完成";
  });
}

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

setupPlayground();
void renderGallery();
