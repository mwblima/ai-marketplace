#!/usr/bin/env node
/**
 * Generates every derived artifact from the catalog (ADR-0003):
 *
 *   .claude-plugin/marketplace.json         consumed by the Claude Code client
 *   plugins/<pack>/.claude-plugin/plugin.json   pack manifests (ADR-0005)
 *   docs/data/index.json                    site search index (ADR-0006)
 *
 * Run with --check to fail instead of writing when the committed output is stale.
 * CI uses that mode so a hand-edited marketplace.json can never diverge from the catalog.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import {
  ROOT,
  dependencyName,
  loadCatalog,
  loadConfig,
  toMarketplaceEntry,
} from "./lib/catalog.mjs";

const CHECK = process.argv.includes("--check");
const stale = [];

async function emit(relPath, content) {
  const abs = join(ROOT, relPath);
  const text = typeof content === "string" ? content : JSON.stringify(content, null, 2) + "\n";
  const current = existsSync(abs) ? await readFile(abs, "utf8") : null;
  if (current === text) return;
  if (CHECK) {
    stale.push(relPath);
    return;
  }
  await mkdir(dirname(abs), { recursive: true });
  await writeFile(abs, text);
  console.log(`  wrote ${relPath}`);
}

const config = await loadConfig();
const catalog = await loadCatalog(config);
const plugins = catalog.filter((e) => e.kind === "plugin");
const packs = catalog.filter((e) => e.kind === "pack");

console.log(
  `Building from ${catalog.length} catalog entries (${plugins.length} plugins, ${packs.length} packs)`,
);

// ── marketplace.json ────────────────────────────────────────────────────────────
// Sorted by name so the diff of a PR shows only what actually changed.
const marketplace = {
  $schema: "https://anthropic.com/claude-code/marketplace.schema.json",
  name: config.marketplace.name,
  description: config.marketplace.description,
  owner: config.marketplace.owner,
  allowCrossMarketplaceDependenciesOn: config.marketplace.allowCrossMarketplaceDependenciesOn ?? [],
  plugins: [...catalog]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => toMarketplaceEntry(config, e)),
};
await emit(".claude-plugin/marketplace.json", marketplace);

// ── plugin manifests and skill frontmatter ──────────────────────────────────────
// The catalog entry is the ONE place a description is written (ADR-0011). Both the
// plugin manifest and every SKILL.md frontmatter block are generated from it, so the
// text that drives search, the install UI, and model activation cannot drift apart.
//
// The generated files are committed rather than produced at install time, because the
// marketplace entry points the client straight at plugins/<name>/ — the directory has to
// be complete and correct in the repository.
for (const plugin of plugins) {
  const dir = join(ROOT, config.pluginsRoot, plugin.name);
  if (!existsSync(dir)) continue; // validate.mjs reports the missing directory

  await emit(`${config.pluginsRoot}/${plugin.name}/.claude-plugin/plugin.json`, {
    name: plugin.name,
    version: plugin.version ?? "0.1.0",
    description: plugin.description,
    ...(config.teams?.[plugin.owner_team] ? { author: config.teams[plugin.owner_team] } : {}),
  });

  const skillsDir = join(dir, "skills");
  if (!existsSync(skillsDir)) continue;

  const skillNames = (await readdir(skillsDir, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const skill of skillNames) {
    const path = `${config.pluginsRoot}/${plugin.name}/skills/${skill}/SKILL.md`;
    const abs = join(ROOT, path);
    if (!existsSync(abs)) continue; // validate.mjs reports the missing SKILL.md

    // A skill's description comes from `skills.<name>.description` when the plugin ships
    // several, and from the entry's own description when it ships one. A multi-skill
    // plugin without per-skill descriptions is a catalog error, not a silent fallback.
    const perSkill = plugin.skills?.[skill]?.description;
    const description =
      perSkill ?? (skillNames.length === 1 ? plugin.description : null);
    if (!description) {
      console.error(
        `  error ${plugin._file}: plugin ships ${skillNames.length} skills, so each needs ` +
          `\`skills.${skill}.description\` in the catalog entry.`,
      );
      process.exitCode = 1;
      continue;
    }

    // Replace the frontmatter block, keep the body exactly as the author wrote it.
    const current = await readFile(abs, "utf8");
    const body = current.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, "");
    const frontmatter = stringifyYaml({ name: skill, description }, { lineWidth: 92 });
    await emit(path, `---\n${frontmatter}---\n\n${body.replace(/^\n+/, "")}`);
  }
}

// ── pack manifests ──────────────────────────────────────────────────────────────
// A pack is a plugin manifest consisting only of name/version/description and a
// dependencies array. Installing it pulls in every dependency (ADR-0005).
for (const pack of packs) {
  await emit(`${config.pluginsRoot}/${pack.name}/.claude-plugin/plugin.json`, {
    name: pack.name,
    version: pack.version ?? "0.1.0",
    description: pack.description,
    dependencies: pack.dependencies,
  });
  await emit(
    `${config.pluginsRoot}/${pack.name}/README.md`,
    [
      `# ${pack.displayName ?? pack.name}`,
      "",
      "<!-- Generated by scripts/build.mjs from the catalog. Do not edit. -->",
      "",
      pack.description,
      "",
      "## What this pack installs",
      "",
      ...pack.dependencies.map((dep) => {
        const name = dependencyName(dep);
        const range = typeof dep === "object" && dep.version ? ` (\`${dep.version}\`)` : "";
        return `- \`${name}\`${range}`;
      }),
      "",
      "## Install",
      "",
      "```bash",
      `claude plugin install ${pack.name}@${config.marketplace.name}`,
      "```",
      "",
      `Adding an artifact to this pack requires publishing a new pack version. Auto-update is`,
      `off by default for non-Anthropic marketplaces, so existing installs pick it up only after`,
      "`claude plugin update` followed by `/reload-plugins`. See ADR-0005.",
      "",
    ].join("\n"),
  );
}

// ── AGENTS.md ───────────────────────────────────────────────────────────────────
// Claude Code reads CLAUDE.md; Codex and several other tools read AGENTS.md. Keeping two
// hand-maintained copies of the same guidance is the drift this whole repository argues
// against, so the second one is generated from the first.
if (existsSync(join(ROOT, "CLAUDE.md"))) {
  const guidance = await readFile(join(ROOT, "CLAUDE.md"), "utf8");
  await emit(
    "AGENTS.md",
    guidance.replace(
      /^(# .*\n)/,
      "$1\n<!-- Generated from CLAUDE.md by scripts/build.mjs. Edit CLAUDE.md instead. -->\n",
    ),
  );
}

// ── site index ──────────────────────────────────────────────────────────────────
const index = {
  generatedAt: null, // intentionally omitted: a timestamp would make every build dirty
  marketplace: {
    name: config.marketplace.name,
    title: config.site.title,
    tagline: config.site.tagline,
    repoUrl: config.site.repoUrl,
  },
  artifacts: [...catalog]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((e) => ({
      name: e.name,
      displayName: e.displayName ?? e.name,
      description: e.description,
      category: e.category ?? null,
      kind: e.kind,
      scope: e.scope ?? null,
      area: e._area,
      team: e._team,
      owner_team: e.owner_team ?? null,
      maturity: e.maturity ?? null,
      tools: e.tools ?? [],
      keywords: e.keywords ?? [],
      artifact_types: e.artifact_types ?? [],
      data_classification: e.data_classification ?? null,
      superseded_by: e.superseded_by ?? null,
      dependencies: (e.dependencies ?? []).map((d) => dependencyName(d)),
      version: e.version ?? null,
      homepage: e.homepage ?? null,
      sourcePath: `${config.pluginsRoot}/${e.name}`,
    })),
};
await emit("docs/data/index.json", index);

if (CHECK && stale.length) {
  console.error(
    `\nGenerated files are out of date:\n${stale.map((f) => `  - ${f}`).join("\n")}\n\n` +
      `Run \`npm run build\` and commit the result.`,
  );
  process.exit(1);
}

console.log(CHECK ? "Generated files are up to date." : "Build complete.");
