import { readFileSync } from "node:fs";
import { createMermaidPlaywrightRenderer } from "@mduml/renderer-mermaid-playwright";

const readStdin = (): string => readFileSync(0, "utf8");

const main = async () => {
  const raw = readStdin();
  const payload = JSON.parse(raw) as {
    code: string;
    config: {
      useElk?: boolean;
      elkEdgeRouting?: "ORTHOGONAL" | "SPLINES" | "POLYLINE";
      flowchartCurve?: string;
      flowchartNodeSpacing?: number;
      flowchartRankSpacing?: number;
      layoutPolicy?: {
        strictOrthogonalFlowchartOnly?: boolean;
        gridSize?: number;
        margin?: number;
        gapX?: number;
        gapY?: number;
        stubMin?: number;
        stubMax?: number;
        allow45Fallback?: boolean;
        fixedLayerY?: number[];
        busLayerRatio?: number;
      };
      jumpLinks?: {
        enabled?: boolean;
        radius?: number;
        safeDistance?: number;
        prefer?: "verticalThenHorizontal" | "vertical" | "horizontal";
        side?: { vertical?: "right" | "left"; horizontal?: "up" | "down" };
        sweep?: { vertical?: 0 | 1; horizontal?: 0 | 1 };
        debug?: boolean;
      };
    };
    debug: boolean;
    backend: { type: "playwright"; executablePath?: string; timeoutMs?: number };
  };

  const renderer = createMermaidPlaywrightRenderer({
    config: {
      executablePath: payload.backend.executablePath,
      timeoutMs: payload.backend.timeoutMs,
      useElk: payload.config.useElk,
      elkEdgeRouting: payload.config.elkEdgeRouting,
      flowchartCurve: payload.config.flowchartCurve,
      flowchartNodeSpacing: payload.config.flowchartNodeSpacing,
      flowchartRankSpacing: payload.config.flowchartRankSpacing,
      layoutPolicy: payload.config.layoutPolicy,
      jumpLinks: payload.config.jumpLinks
    }
  });

  const result = await renderer.render({ code: payload.code, language: "mermaid", config: {} }, { debug: payload.debug });
  await renderer.dispose();

  process.stdout.write(JSON.stringify({ ok: true, svg: result.content }));
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({ ok: false, message }));
  process.exitCode = 1;
});
