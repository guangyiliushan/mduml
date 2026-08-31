import { renderAllMermaidBlocks } from "@mduml/runtime-mermaid";

const scheduleRender = () => {
  let scheduled = false;
  const run = async () => {
    scheduled = false;
    await renderAllMermaidBlocks({ root: document.body });
  };
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => void run(), 0);
  });
  observer.observe(document.body, { subtree: true, childList: true });
  void run();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", scheduleRender);
} else {
  scheduleRender();
}
