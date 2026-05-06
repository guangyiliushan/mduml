import assert from "node:assert/strict";

const main = async () => {
  const { __test__ } = await import(new URL("../index.js", import.meta.url).href);
  const input = "@startuml\nAlice -> Bob: Hello\n@enduml";
  const output = __test__.injectPlantUmlOrthoStyle(input, 0);
  assert.ok(output.includes("skinparam linetype ortho"));
  assert.ok(output.includes("skinparam roundcorner 0"));
  assert.ok(output.indexOf("@startuml") < output.indexOf("skinparam linetype ortho"));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
