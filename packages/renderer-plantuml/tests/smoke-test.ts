import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

const main = async () => {
  const { __test__, createPlantUmlRenderer } = await import(new URL("../index.js", import.meta.url).href);
  const input = "@startuml\nAlice -> Bob: Hello\n@enduml";
  const output = __test__.injectPlantUmlOrthoStyle(input, 0);
  assert.ok(output.includes("skinparam linetype ortho"));
  assert.ok(output.includes("skinparam roundcorner 0"));
  assert.ok(output.indexOf("@startuml") < output.indexOf("skinparam linetype ortho"));

  const encoded = __test__.krokiEncode(input);
  assert.ok(!/[+/=]/.test(encoded), "kroki encoding must be unpadded base64url");
  assert.equal(inflateSync(Buffer.from(encoded, "base64url")).toString("utf8"), input, "kroki encoding must round-trip");

  const krokiUrl = __test__.buildRemoteServerUrl(input, "https://kroki.io", "kroki");
  assert.equal(krokiUrl, `https://kroki.io/plantuml/svg/${encoded}`, "kroki URL must use /plantuml/svg/<encoded>");
  const krokiDefault = __test__.buildRemoteServerUrl(input, "", "kroki");
  assert.equal(krokiDefault, `https://kroki.io/plantuml/svg/${encoded}`, "kroki URL defaults to https://kroki.io");
  const plantumlUrl = __test__.buildRemoteServerUrl(input, "https://example.com/plantuml", "plantuml");
  assert.equal(plantumlUrl.startsWith("https://example.com/plantuml/svg/"), true, "plantuml URL must use /svg/");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url: any) => {
    if (String(url).startsWith("https://kroki.io/plantuml/svg/")) {
      return new Response("<svg></svg>", { status: 200 });
    }
    throw new Error(`unexpected url: ${url}`);
  };
  try {
    const renderer = createPlantUmlRenderer({ config: { enableRemoteFallback: true, remoteBackend: "kroki" } });
    const out = await renderer.render({ code: input, language: "plantuml", config: {} }, { debug: false });
    assert.equal(out.content, "<svg></svg>", "kroki backend should work without remoteServerUrl");
  } finally {
    globalThis.fetch = originalFetch;
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
