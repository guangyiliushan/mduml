const { umlFlowMarkdownItPlugin } = require("./dist/index.cjs");
const MarkdownIt = require("markdown-it");

const md = new MarkdownIt({ html: true });
md.use(umlFlowMarkdownItPlugin, { debug: false, mode: { mermaid: "build", plantuml: "auto" } });
const html = md.render(["```mermaid", "graph TD", "A-->B", "```"].join("\n"), {});
console.log("CJS plugin build-mode svg:", html.includes("<svg"));
console.log("no placeholder:", !html.includes('class="mermaid"'));

const mdP = new MarkdownIt({ html: true });
mdP.use(umlFlowMarkdownItPlugin, { debug: false, mode: "runtime", plantuml: { remoteRender: true, remoteServerUrl: "https://cjs.example.com/plantuml" } });
const htmlP = mdP.render(["```plantuml", "@startuml", "A -> B", "@enduml", "```"].join("\n"), {});
console.log("CJS remote via remoteServerUrl:", htmlP.includes("https://cjs.example.com/plantuml/svg/"));

const mdAuto = new MarkdownIt({ html: true });
mdAuto.use(umlFlowMarkdownItPlugin, { debug: false, mode: { mermaid: "runtime", plantuml: "auto" } });
const htmlAuto = mdAuto.render(["```plantuml", "@startuml", "A -> B", "@enduml", "```"].join("\n"), {});
console.log("CJS plantuml auto (no config) skip-spawn message:", htmlAuto.includes("未配置 localJarPath"));

const mdFail = new MarkdownIt({ html: true });
mdFail.use(umlFlowMarkdownItPlugin, { debug: false, mode: { mermaid: "build", plantuml: "runtime" }, buildBackend: { type: "playwright", executablePath: "Z:/nonexistent/chrome.exe" } });
const htmlFail = mdFail.render(["```mermaid", "graph TD", "A-->B", "```"].join("\n"), {});
console.log("CJS build-mode error message propagated:", htmlFail.includes("Executable doesn't exist") || htmlFail.includes("Failed to launch"));
