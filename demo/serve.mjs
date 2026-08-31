import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDemo } from "../scripts/build-demo.mjs";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4173);

buildDemo();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".map": "application/json",
  ".json": "application/json"
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
    const target = normalize(join(root, pathname.endsWith("/") ? pathname + "index.html" : pathname));
    if (!target.startsWith(root)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const data = await readFile(target);
    res.writeHead(200, { "content-type": mime[extname(target)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`demo: http://localhost:${port}/demo/`));
