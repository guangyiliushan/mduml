import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

type BatchBlock = {
  id: string;
  code: string;
  config?: Record<string, unknown>;
};

type BatchInput = {
  blocks?: BatchBlock[];
  code?: string;
  config?: Record<string, unknown>;
  debug?: boolean;
  backend?: { type: "playwright"; executablePath?: string; timeoutMs?: number };
};

type BlockResult = { id: string; ok: true; svg: string } | { id: string; ok: false; message: string };

const readStdin = (): string => readFileSync(0, "utf8");

const resolveRuntimeGlobalScriptPath = (): string => {
  const anchors: string[] = [];
  const metaUrl = (import.meta as any)?.url;
  if (typeof metaUrl === "string") anchors.push(metaUrl);
  if (typeof process.argv?.[1] === "string") anchors.push(process.argv[1]);
  for (const anchor of anchors) {
    try {
      return createRequire(anchor).resolve("@mduml/runtime-mermaid/global");
    } catch {}
  }
  throw new Error("@mduml/runtime-mermaid 全局包（./global → dist/runtime.global.js）解析失败；请确认依赖已安装且已构建");
};

const importPlaywright = async () => {
  try {
    return await import("playwright");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Playwright 未安装或不可用：${message}`);
  }
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const main = async () => {
  const payload = JSON.parse(readStdin()) as BatchInput;
  const blocks: BatchBlock[] =
    payload.blocks ??
    (typeof payload.code === "string" ? [{ id: "block-0", code: payload.code, config: payload.config }] : []);
  if (blocks.length === 0) {
    process.stdout.write(JSON.stringify({ ok: true, results: [] as BlockResult[] }));
    return;
  }

  const scriptPath = resolveRuntimeGlobalScriptPath();
  const playwright = await importPlaywright();
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: payload.backend?.executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });

  try {
    const createPreparedPage = async () => {
      const p = await browser.newPage();
      await p.setContent("<!doctype html><html><head></head><body></body></html>", { waitUntil: "domcontentloaded" });
      await p.addScriptTag({ path: scriptPath });
      return p;
    };
    let page = await createPreparedPage();

    const timeoutMs = payload.backend?.timeoutMs ?? 20_000;
    const results: BlockResult[] = [];
    for (const block of blocks) {
      try {
        const result = await withTimeout(
          page.evaluate(
            async (args: { code: string; config: Record<string, unknown>; debug: boolean }) => {
              const runtime = (globalThis as any).UmlFlowRuntime;
              if (!runtime || typeof runtime.renderMermaidCodeToSvg !== "function") {
                return { ok: false as const, message: "UmlFlowRuntime 全局运行时未加载" };
              }
              return await runtime.renderMermaidCodeToSvg({
                code: args.code,
                config: { ...args.config, debug: args.debug }
              });
            },
            { code: block.code, config: block.config ?? {}, debug: Boolean(payload.debug) }
          ),
          timeoutMs,
          `渲染超时（${timeoutMs}ms）`
        );
        results.push(result.ok ? { id: block.id, ok: true, svg: result.svg } : { id: block.id, ok: false, message: result.message });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ id: block.id, ok: false, message });
        try {
          await page.close();
          page = await createPreparedPage();
        } catch (recreateError) {
          const recreateMessage = recreateError instanceof Error ? recreateError.message : String(recreateError);
          for (const remaining of blocks.slice(blocks.indexOf(block) + 1)) {
            results.push({ id: remaining.id, ok: false, message: `页面重建失败：${recreateMessage}` });
          }
          break;
        }
      }
    }

    process.stdout.write(JSON.stringify({ ok: true, results }));
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(JSON.stringify({ ok: false, message }));
  process.exitCode = 1;
});
