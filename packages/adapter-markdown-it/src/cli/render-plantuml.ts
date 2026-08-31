import { readFileSync } from "node:fs";
import { createPlantUmlRenderer } from "@mduml/renderer-plantuml";

type BatchBlock = {
  id: string;
  code: string;
  language: "plantuml" | "uml";
};

type BatchInput = {
  blocks?: BatchBlock[];
  code?: string;
  language?: "plantuml" | "uml";
  config?: { localJarPath?: string; timeoutMs?: number; enableRemoteFallback?: boolean; remoteServerUrl?: string };
  debug?: boolean;
};

type BlockResult = { id: string; ok: true; svg: string } | { id: string; ok: false; message: string };

const readStdin = (): string => readFileSync(0, "utf8");

const main = async () => {
  const payload = JSON.parse(readStdin()) as BatchInput;
  const blocks: BatchBlock[] =
    payload.blocks ??
    (typeof payload.code === "string" ? [{ id: "block-0", code: payload.code, language: payload.language ?? "plantuml" }] : []);
  if (blocks.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, results: [] as BlockResult[] }));
    return;
  }

  const renderer = createPlantUmlRenderer({ config: payload.config ?? {} });
  const results: BlockResult[] = [];
  for (const block of blocks) {
    try {
      const output = await renderer.render({ code: block.code, language: block.language, config: {} }, { debug: Boolean(payload.debug) });
      results.push({ id: block.id, ok: true, svg: output.content });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({ id: block.id, ok: false, message });
    }
  }

  process.stdout.write(JSON.stringify({ ok: true, results }));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({ ok: false, message }));
  process.exitCode = 1;
});
