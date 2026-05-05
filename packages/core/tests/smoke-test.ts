import assert from "node:assert/strict";
import { createUmlFlowCore, createErrorBlockHtml, defaultCacheStore } from "../src/index";

const main = async () => {
  const cache = defaultCacheStore();

  const core = createUmlFlowCore({
    debug: true,
    cache,
    renderers: [
      {
        id: "test-renderer",
        languages: ["mermaid"],
        version: "0.0.0-test",
        async render() {
          return { contentType: "image/svg+xml", content: "<svg></svg>" };
        }
      }
    ],
    fenceOverrides: { mermaid: { a: 1 } }
  });

  const first = await core.renderFenceBlock({ language: "mermaid", code: "graph TD\nA-->B" });
  assert.equal(first.ok, true);
  assert.equal(first.cacheHit, false);

  const second = await core.renderFenceBlock({ language: "mermaid", code: "graph TD\nA-->B" });
  assert.equal(second.ok, true);
  assert.equal(second.cacheHit, true);

  const errorBlock = createErrorBlockHtml({ rendererId: "x", message: "<bad>" });
  assert.equal(errorBlock.contentType, "text/html");
  assert.ok(errorBlock.content.includes("&lt;bad&gt;"));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
