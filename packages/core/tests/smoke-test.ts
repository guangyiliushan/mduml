import assert from "node:assert/strict";

const main = async () => {
  const { createErrorBlockHtml } = await import(new URL("../index.js", import.meta.url).href);

  const errorBlock = createErrorBlockHtml({ rendererId: "x", message: "<bad> & \"evil\"" });
  assert.equal(errorBlock.contentType, "text/html");
  assert.ok(errorBlock.content.includes("&lt;bad&gt;"));
  assert.ok(errorBlock.content.includes("&amp;"));
  assert.ok(errorBlock.content.includes("&quot;evil&quot;"));
  assert.ok(!errorBlock.content.includes("<bad>"));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
