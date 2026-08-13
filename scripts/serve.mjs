#!/usr/bin/env node
/**
 * Local preview of the catalog site. Development convenience only — the published site is
 * plain static files with no server involved (ADR-0008).
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { ROOT } from "./lib/catalog.mjs";

const PORT = Number(process.env.PORT ?? 8080);
const DOCS = join(ROOT, "docs");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  const path = req.url.split("?")[0];
  // normalize() collapses any ../ before it can escape docs/.
  const rel = normalize(path === "/" ? "/index.html" : path).replace(/^(\.\.[/\\])+/, "");
  const file = join(DOCS, rel);

  if (!file.startsWith(DOCS)) {
    res.writeHead(403).end("forbidden");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, () => console.log(`Catalog site: http://localhost:${PORT}`));
