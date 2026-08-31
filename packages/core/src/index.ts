export type DiagramLanguage = "mermaid" | "plantuml" | "uml";

export type RenderedOutput = {
  contentType: "image/svg+xml" | "text/html";
  content: string;
};

export type RenderFailure = {
  rendererId: string;
  message: string;
};

export type RendererContext = {
  debug: boolean;
};

export type Renderer = {
  id: string;
  languages: DiagramLanguage[];
  version: string;
  render: (input: { code: string; language: DiagramLanguage; config: unknown }, context: RendererContext) => Promise<RenderedOutput>;
};

export const createErrorBlockHtml = (failure: RenderFailure): RenderedOutput => {
  const safeMessage = escapeHtml(failure.message);
  const safeRendererId = escapeHtml(failure.rendererId);
  const html = [
    '<div class="uml-flow-error" style="border:1px solid #e09; padding:12px; border-radius:8px;">',
    `<div style="font-weight:600; margin-bottom:8px;">UML Flow 渲染失败</div>`,
    `<div style="opacity:0.9; margin-bottom:6px;">渲染器：${safeRendererId}</div>`,
    `<pre style="white-space:pre-wrap; margin:0; opacity:0.85;">${safeMessage}</pre>`,
    "</div>"
  ].join("");
  return { contentType: "text/html", content: html };
};

export const escapeHtml = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
