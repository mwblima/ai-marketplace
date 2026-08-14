/**
 * Catalog loading and normalization.
 *
 * The catalog is the single source of truth (ADR-0003). Every other artifact in the
 * repository — .claude-plugin/marketplace.json, generated pack manifests, and the site
 * index — is derived from it by scripts/build.mjs.
 *
 * Every entry point takes an optional `root`, defaulting to this repository. That is what
 * lets tests/invariants.test.mjs run the real validator against synthetic repositories
 * instead of asserting on this one (ADR-0007).
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Catalog-only fields. Stripped before writing marketplace.json (ADR-0003). */
export const GOVERNANCE_FIELDS = [
  "owner_team",
  "scope",
  "maturity",
  "tools",
  "data_classification",
  "artifact_types",
  "superseded_by",
  "last_reviewed",
  "kind",
];

/** Artifact surfaces a plugin can ship, and where each one lives (ADR-0012). */
export const ARTIFACT_SURFACES = {
  skill: { dir: "skills", kind: "dir" },
  agent: { dir: "agents", kind: "dir" },
  command: { dir: "commands", kind: "dir" },
  hook: { dir: "hooks", kind: "dir" },
  mcp: { dir: ".mcp.json", kind: "file" },
};

export async function loadConfig(root = ROOT) {
  return JSON.parse(await readFile(join(root, "marketplace.config.json"), "utf8"));
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) out.push(full);
  }
  return out;
}

/**
 * Derive area and team from the catalog path, so the directory layout is the
 * organizational hierarchy rather than a field someone can forget to update.
 *
 *   catalog/company/x.yaml             -> { area: "company", team: null }
 *   catalog/engineering/backend/x.yaml -> { area: "engineering", team: "backend" }
 *   catalog/packs/x.yaml               -> { area: "packs", team: null }
 */
function locationFromPath(root, catalogRoot, file) {
  const parts = relative(join(root, catalogRoot), file).split(sep);
  parts.pop();
  return { area: parts[0] ?? null, team: parts[1] ?? null };
}

export async function loadCatalog(config, root = ROOT) {
  const catalogDir = join(root, config.catalogRoot);
  if (!existsSync(catalogDir)) return [];

  const entries = [];
  for (const file of (await walk(catalogDir)).sort()) {
    let raw;
    try {
      raw = parseYaml(await readFile(file, "utf8"));
    } catch (err) {
      throw new Error(`${relative(root, file)}: invalid YAML — ${err.message}`);
    }
    if (!raw || typeof raw !== "object") {
      throw new Error(`${relative(root, file)}: expected a YAML mapping`);
    }
    const { area, team } = locationFromPath(root, config.catalogRoot, file);
    entries.push({
      ...raw,
      kind: raw.kind ?? (Array.isArray(raw.dependencies) ? "pack" : "plugin"),
      _file: relative(root, file),
      _area: area,
      _team: team,
    });
  }
  return entries;
}

/**
 * An entry is external when it declares its own `source` object instead of shipping content
 * under plugins/. External content is not reviewed by this repository's CI, so I2 requires it
 * to be pinned to a commit sha (ADR-0007).
 */
export function isExternal(entry) {
  return entry.source != null && typeof entry.source === "object";
}

/** The directory holding an entry's plugin content, relative to the repo root. */
export function pluginDir(config, entry) {
  return join(config.pluginsRoot, entry.name);
}

/** Marketplace entry shape expected by the Claude Code client (ADR-0002). */
export function toMarketplaceEntry(config, entry) {
  const out = {
    name: entry.name,
    description: entry.description,
    source: isExternal(entry) ? entry.source : `./${config.pluginsRoot}/${entry.name}`,
    category: entry.category,
  };
  // `claude plugin tag` refuses to tag a release unless plugin.json and the marketplace
  // entry agree on the version, so the entry has to carry it (ADR-0010).
  if (entry.version) out.version = entry.version;
  if (entry.displayName) out.displayName = entry.displayName;
  if (entry.homepage) out.homepage = entry.homepage;
  if (entry.keywords?.length) out.keywords = entry.keywords;
  if (entry.author) out.author = entry.author;
  if (entry.dependencies?.length) out.dependencies = entry.dependencies;
  return out;
}

/** Dependency entries are either "name" or { name, version, marketplace }. */
export function dependencyName(dep) {
  return typeof dep === "string" ? dep : dep?.name;
}
