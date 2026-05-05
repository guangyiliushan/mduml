import { readFileSync } from "node:fs";
import { createPlantUmlRenderer } from "@mduml/renderer-plantuml";

const readStdin = (): string => readFileSync(0, "utf8");

const main = async () => {
  const raw = readStdin();
  const payload = JSON.parse(raw) as {
    code: string;
    language: "plantuml" | "uml";
    config: { localJarPath?: string; timeoutMs?: number; enableRemoteFallback?: boolean; remoteServerUrl?: string };
    debug: boolean;
  };

  const renderer = createPlantUmlRenderer({
    config: {
      localJarPath: payload.config.localJarPath,
      timeoutMs: payload.config.timeoutMs,
      enableRemoteFallback: payload.config.enableRemoteFallback,
      remoteServerUrl: payload.config.remoteServerUrl
    }
  });

  const output = await renderer.render({ code: payload.code, language: payload.language, config: {} }, { debug: payload.debug });
  process.stdout.write(JSON.stringify({ ok: true, svg: output.content }));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({ ok: false, message }));
  process.exitCode = 1;
});
