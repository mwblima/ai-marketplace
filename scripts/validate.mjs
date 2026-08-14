#!/usr/bin/env node
/**
 * Deterministic guardrails (ADR-0007, layers 1 and 2).
 *
 * Everything here runs in seconds and blocks the PR. What cannot be checked
 * mechanically — whether a hook observes more than its purpose justifies, whether the
 * description matches actual behavior — lives in .github/policy/ and is reviewed by a
 * human against a structured checklist.
 *
 * Invariant IDs match the table in ADR-0007.
 *
 * The whole check is exported as `validate({ root })` so tests/invariants.test.mjs can run
 * it against synthetic repositories. A guardrail nobody tests is a guardrail nobody can
 * safely adapt, and adapting it is the first thing an adopting company does.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  ARTIFACT_SURFACES,
  ROOT,
  dependencyName,
  isExternal,
  loadCatalog,
  loadConfig,
} from "./lib/catalog.mjs";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SHA_RE = /^[0-9a-f]{40}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function validate({ root = ROOT, baseRef = process.env.BASE_REF, now = new Date() } = {}) {
  const errors = [];
  const warnings = [];
  const fail = (id, where, msg) => errors.push(`[${id}] ${where}: ${msg}`);
  const warn = (id, where, msg) => warnings.push(`[${id}] ${where}: ${msg}`);

  const config = await loadConfig(root);
  const { policy } = config;
  const catalog = await loadCatalog(config, root);
  const byName = new Map(catalog.map((e) => [e.name, e]));

  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

  // ── Schema: required fields and enums ─────────────────────────────────────────
  for (const e of catalog) {
    const at = e._file;
    const required = ["name", "description", "category", "scope", "owner_team", "maturity", "tools"];
    if (e.kind === "plugin") required.push("artifact_types");
    for (const field of required) {
      const value = e[field];
      if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) {
        fail("schema", at, `missing required field \`${field}\``);
      }
    }
    if (e.name && !NAME_RE.test(e.name)) {
      fail("schema", at, `name "${e.name}" must be lowercase kebab-case`);
    }
    const enums = {
      category: policy.categories,
      scope: policy.scopes,
      maturity: policy.maturities,
      data_classification: policy.dataClassifications,
    };
    for (const [field, allowed] of Object.entries(enums)) {
      if (e[field] && !allowed.includes(e[field])) {
        fail("schema", at, `${field} "${e[field]}" is not one of: ${allowed.join(", ")}`);
      }
    }
    for (const tool of e.tools ?? []) {
      if (!policy.tools.includes(tool)) {
        fail("schema", at, `tool "${tool}" is not one of: ${policy.tools.join(", ")}`);
      }
    }
    for (const type of e.artifact_types ?? []) {
      if (!Object.keys(ARTIFACT_SURFACES).includes(type)) {
        fail(
          "schema",
          at,
          `artifact_type "${type}" is not one of: ${Object.keys(ARTIFACT_SURFACES).join(", ")}`,
        );
      }
    }
    if (e.last_reviewed && !DATE_RE.test(String(e.last_reviewed))) {
      fail("schema", at, `last_reviewed "${e.last_reviewed}" must be an ISO date (YYYY-MM-DD)`);
    }
  }

  // ── I1: names unique and immutable ────────────────────────────────────────────
  const seen = new Map();
  for (const e of catalog) {
    if (seen.has(e.name)) fail("I1", e._file, `duplicate name "${e.name}", also in ${seen.get(e.name)}`);
    else seen.set(e.name, e._file);
  }

  // `renames` is declared in marketplace.config.json and emitted into marketplace.json by
  // the build (ADR-0002). Retiring a name means adding `old: new` there, in the same PR
  // that removes the entry — the map is what migrates existing installs.
  const renames = config.marketplace.renames ?? {};
  for (const [from, to] of Object.entries(renames)) {
    if (byName.has(from)) {
      fail(
        "I1",
        "marketplace.config.json",
        `renames maps "${from}", but an artifact by that name still exists. A name is either live or retired.`,
      );
    }
    if (!byName.has(to)) {
      fail("I1", "marketplace.config.json", `renames points "${from}" at "${to}", which is not in the catalog`);
    }
  }

  // Immutability is checked against the committed marketplace.json on the base ref: a
  // name that disappears is either a rename (breaks installs) or a deletion (breaks
  // installs). Both require a `renames` entry or a deprecation, never a silent drop.
  try {
    const previous = git(["show", `${baseRef || "origin/main"}:.claude-plugin/marketplace.json`]);
    for (const entry of JSON.parse(previous).plugins ?? []) {
      if (!byName.has(entry.name) && !renames[entry.name]) {
        fail(
          "I1",
          ".claude-plugin/marketplace.json",
          `"${entry.name}" was removed. Names are immutable: deprecate it, or add it to ` +
            `\`marketplace.renames\` in marketplace.config.json (ADR-0002).`,
        );
      }
    }
  } catch {
    // No base ref available (first commit, shallow clone, fresh repo). Skip silently:
    // the check is advisory on a repo with no history to compare against.
  }

  // ── I2: external sources are pinned to a sha, on an allowlisted repository ─────
  // Content outside this repository is never reviewed by this CI. A moving ref means the
  // artifact a user installs today is not the one that was approved.
  for (const e of catalog) {
    if (!isExternal(e)) continue;
    const src = e.source;
    const at = e._file;

    if (!SHA_RE.test(String(src.sha ?? ""))) {
      fail("I2", at, `external source must pin a full 40-character commit \`sha\` (ADR-0007)`);
    }
    for (const moving of ["ref", "branch", "tag"]) {
      if (src[moving]) {
        fail("I2", at, `external source sets \`${moving}\`, which moves. Pin \`sha\` instead.`);
      }
    }
    const allowed = policy.allowedPluginRepos ?? [];
    const repo = src.repo ?? src.url ?? "";
    const ok = allowed.some((pattern) =>
      pattern.endsWith("/*") ? repo.startsWith(pattern.slice(0, -1)) : repo === pattern,
    );
    if (!ok) {
      fail(
        "I2",
        at,
        `external source "${repo}" is not in policy.allowedPluginRepos (${allowed.join(", ") || "empty"})`,
      );
    }
  }

  // ── I10: a declared version must have a release tag ───────────────────────────
  // Version resolution reads git tags shaped `{plugin-name}--v{version}` (ADR-0010). A
  // version declared in the catalog with no matching tag cannot be the target of a semver
  // constraint, so a pack pinning it silently falls back to "whatever is in the marketplace
  // right now" — the exact thing constraints exist to prevent.
  //
  // This is a warning, not an error: the tag is pushed after merge, so the PR that raises a
  // version legitimately has no tag yet. It fails only when another artifact constrains it.
  // "git failed" and "no tags yet" are different states and must not be conflated: the
  // second one still needs checking, because a repository with zero tags is exactly where a
  // semver constraint silently fails to resolve.
  let tags = null;
  try {
    tags = new Set(git(["tag", "--list"]).split("\n").filter(Boolean));
  } catch {
    // Not a git repository, or git unavailable. Skip the check rather than fail the build.
  }

  const constrained = new Set();
  for (const e of catalog) {
    for (const dep of e.dependencies ?? []) {
      if (typeof dep === "object" && dep.version) constrained.add(dep.name);
    }
  }

  for (const e of catalog) {
    if (!e.version || tags === null || isExternal(e)) continue;
    if (tags.has(`${e.name}--v${e.version}`)) continue;

    if (constrained.has(e.name)) {
      fail(
        "I10",
        e._file,
        `version ${e.version} has no tag \`${e.name}--v${e.version}\`, but another artifact ` +
          `constrains this one by semver range. The constraint cannot resolve. ` +
          `Run \`claude plugin tag --push\` from ${config.pluginsRoot}/${e.name}/.`,
      );
    } else {
      warn(
        "I10",
        e._file,
        `version ${e.version} has no release tag yet. After merge, run \`claude plugin tag --push\` ` +
          `from ${config.pluginsRoot}/${e.name}/ (ADR-0010).`,
      );
    }
  }

  // ── I8: owner_team is a real team in CODEOWNERS ───────────────────────────────
  const codeownersPath = join(root, ".github/CODEOWNERS");
  const codeowners = existsSync(codeownersPath) ? readFileSync(codeownersPath, "utf8") : "";
  const knownTeams = new Set(
    [...codeowners.matchAll(/@[\w.-]+\/([\w.-]+)/g)].map((m) => m[1].toLowerCase()),
  );
  for (const e of catalog) {
    if (e.owner_team && knownTeams.size && !knownTeams.has(String(e.owner_team).toLowerCase())) {
      fail("I8", e._file, `owner_team "${e.owner_team}" has no entry in .github/CODEOWNERS`);
    }
  }

  // ── I4: description is a usable search and activation string ──────────────────
  for (const e of catalog) {
    const d = e.description ?? "";
    const soft = e.maturity === "experimental"; // experimental publishes as draft (ADR-0007)
    const report = soft ? warn : fail;
    if (d.length && d.length < policy.descriptionMinLength) {
      report("I4", e._file, `description is ${d.length} chars, minimum ${policy.descriptionMinLength}`);
    }
    if (d.length > policy.descriptionMaxLength) {
      report("I4", e._file, `description is ${d.length} chars, maximum ${policy.descriptionMaxLength}`);
    }
  }

  // ── I12: the lifecycle closes ─────────────────────────────────────────────────
  // A deprecation is only useful if it points somewhere. `superseded_by` must name a live
  // artifact, otherwise the site tells a user to migrate to something that does not exist.
  for (const e of catalog) {
    if (e.maturity !== "deprecated") continue;
    if (!e.superseded_by) {
      fail("I12", e._file, "deprecated artifacts must set `superseded_by` (ADR-0010)");
      continue;
    }
    const target = byName.get(e.superseded_by);
    if (!target) {
      fail("I12", e._file, `superseded_by "${e.superseded_by}" is not in the catalog`);
    } else if (target.maturity === "deprecated") {
      fail("I12", e._file, `superseded_by "${e.superseded_by}" is itself deprecated`);
    }
  }

  // ── I13: ownership is reattested, not assumed (ADR-0012) ──────────────────────
  // Internal catalogs do not die of malicious artifacts; they die of artifacts nobody owns
  // any more. A date the owner has to touch is the cheapest pressure that exists.
  const maxAgeDays = policy.reviewMaxAgeDays;
  if (maxAgeDays) {
    for (const e of catalog) {
      if (e.maturity === "deprecated") continue; // already on its way out
      if (!e.last_reviewed) {
        warn("I13", e._file, `no \`last_reviewed\` date. Set it to the day the owner last confirmed this artifact is current (ADR-0012).`);
        continue;
      }
      const ageDays = Math.floor((now - new Date(`${e.last_reviewed}T00:00:00Z`)) / 86400000);
      if (ageDays > maxAgeDays) {
        warn(
          "I13",
          e._file,
          `last reviewed ${ageDays} days ago, over the ${maxAgeDays}-day limit. ` +
            `@${e.owner_team} should reconfirm it or deprecate it (ADR-0012).`,
        );
      }
    }
  }

  // ── Per-plugin content checks ─────────────────────────────────────────────────
  async function listDirs(dir) {
    if (!existsSync(dir)) return [];
    return (await readdir(dir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  }

  /**
   * Parse SKILL.md frontmatter with a real YAML parser. A line-based parser looks like it
   * works until someone writes a folded block scalar (`description: >-`), which is exactly
   * how a description long enough to be useful gets written.
   */
  function parseFrontmatter(text) {
    const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(\n|$)/);
    if (!m) return null;
    try {
      const parsed = parseYaml(m[1]);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  for (const e of catalog) {
    if (isExternal(e)) continue; // content lives at the pinned sha, checked by I2 only

    const dir = join(root, config.pluginsRoot, e.name);
    const at = `${config.pluginsRoot}/${e.name}`;

    if (!existsSync(dir)) {
      fail("schema", e._file, `plugin directory ${at}/ does not exist`);
      continue;
    }

    // plugin.json must exist and agree with the catalog on the name.
    const manifestPath = join(dir, ".claude-plugin/plugin.json");
    if (!existsSync(manifestPath)) {
      fail("schema", at, "missing .claude-plugin/plugin.json");
    } else {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.name !== e.name) {
        fail("I1", at, `plugin.json name "${manifest.name}" does not match catalog name "${e.name}"`);
      }
      if (e.version && manifest.version && manifest.version !== e.version) {
        fail(
          "I1",
          at,
          `version mismatch: catalog says ${e.version}, plugin.json says ${manifest.version} (ADR-0010)`,
        );
      }
    }

    if (e.kind === "pack") continue; // packs have no content of their own

    const hasHooks = existsSync(join(dir, "hooks"));
    const hasMcp = existsSync(join(dir, ".mcp.json"));

    // ── I11: declared artifact_types match the surfaces actually shipped ────────
    // Both directions matter. Declaring a surface you do not ship is a broken promise in
    // the catalog; shipping one you did not declare — a hook, above all — is how an
    // artifact acquires reach nobody reviewed.
    const declared = new Set(e.artifact_types ?? []);
    for (const [type, surface] of Object.entries(ARTIFACT_SURFACES)) {
      const present = existsSync(join(dir, surface.dir));
      if (declared.has(type) && !present) {
        fail("I11", at, `declares artifact_type "${type}" but ships no ${surface.dir}`);
      }
      if (!declared.has(type) && present) {
        fail(
          "I11",
          at,
          `ships ${surface.dir} but does not declare artifact_type "${type}". Every surface an ` +
            `artifact installs must be visible in the catalog (ADR-0012).`,
        );
      }
    }

    // I3 + I5: skill frontmatter and size.
    const skills = await listDirs(join(dir, "skills"));
    for (const skill of skills) {
      const skillPath = join(dir, "skills", skill, "SKILL.md");
      if (!existsSync(skillPath)) {
        fail("I3", `${at}/skills/${skill}`, "directory has no SKILL.md");
        continue;
      }
      const text = await readFile(skillPath, "utf8");
      const fm = parseFrontmatter(text);
      if (!fm) {
        fail("I3", `${at}/skills/${skill}/SKILL.md`, "missing YAML frontmatter");
      } else {
        if (!fm.name) fail("I3", `${at}/skills/${skill}/SKILL.md`, "frontmatter missing `name`");
        if (fm.name && fm.name !== skill) {
          fail("I3", `${at}/skills/${skill}/SKILL.md`, `frontmatter name "${fm.name}" != directory "${skill}"`);
        }
        if (!fm.description) {
          fail("I3", `${at}/skills/${skill}/SKILL.md`, "frontmatter missing `description`");
        } else if (fm.description.length < policy.descriptionMinLength) {
          // The frontmatter is generated from the catalog description (ADR-0011), so the
          // experimental draft allowance has to apply here too. Hard-failing one and
          // warning on the other means an experimental artifact can never be published.
          (e.maturity === "experimental" ? warn : fail)(
            "I4",
            `${at}/skills/${skill}/SKILL.md`,
            `description is ${fm.description.length} chars, minimum ${policy.descriptionMinLength}`,
          );
        }
      }
      const lines = text.split("\n").length;
      if (lines > policy.skillMaxLines) {
        fail(
          "I5",
          `${at}/skills/${skill}/SKILL.md`,
          `${lines} lines exceeds ${policy.skillMaxLines}. Move detail into references/ and load it on demand.`,
        );
      }
    }
    if (skills.length > policy.maxSkillsPerPlugin) {
      warn(
        "I5",
        at,
        `${skills.length} skills exceeds ${policy.maxSkillsPerPlugin}. Consider splitting into a pack of smaller plugins (ADR-0005).`,
      );
    }

    // ── I3 (agents): an agent is a markdown file with name + description ────────
    for (const agent of await listFiles(join(dir, "agents"), ".md")) {
      const text = await readFile(join(dir, "agents", agent), "utf8");
      const fm = parseFrontmatter(text);
      if (!fm?.name || !fm?.description) {
        fail("I3", `${at}/agents/${agent}`, "agent frontmatter needs `name` and `description`");
      } else if (fm.name !== agent.replace(/\.md$/, "")) {
        fail("I3", `${at}/agents/${agent}`, `frontmatter name "${fm.name}" != file name`);
      }
    }

    // ── I14: every hook is declared, gated, and points at a file that ships ─────
    // A hook is the one surface that runs without the user asking. The policy review reads
    // intent (prompt.md, Part 2); this checks the mechanics it depends on.
    if (hasHooks) {
      const hooksFile = join(dir, "hooks", "hooks.json");
      if (!existsSync(hooksFile)) {
        fail("I14", `${at}/hooks`, "hooks/ must contain hooks.json (ADR-0012)");
      } else {
        let parsed = null;
        try {
          parsed = JSON.parse(await readFile(hooksFile, "utf8"));
        } catch (err) {
          fail("I14", `${at}/hooks/hooks.json`, `invalid JSON — ${err.message}`);
        }
        for (const [event, matchers] of Object.entries(parsed?.hooks ?? {})) {
          for (const matcher of matchers) {
            if (["PreToolUse", "PostToolUse"].includes(event) && !matcher.matcher) {
              fail(
                "I14",
                `${at}/hooks/hooks.json`,
                `${event} hook has no \`matcher\`, so it fires on every tool call. Scope it (ADR-0012).`,
              );
            }
            for (const hook of matcher.hooks ?? []) {
              const command = hook.command ?? "";
              const local = command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/);
              if (!local) {
                warn(
                  "I14",
                  `${at}/hooks/hooks.json`,
                  `${event} hook does not run a file from \${CLAUDE_PLUGIN_ROOT}; the policy review must read it by hand.`,
                );
              } else if (!existsSync(join(dir, local[1]))) {
                fail("I14", `${at}/hooks/hooks.json`, `${event} hook points at ${local[1]}, which does not ship`);
              }
            }
          }
        }
      }
    }

    // I6: declared tools must match what actually projects.
    //
    // Only skills project (ADR-0004). So an artifact that declares codex or cursor while
    // relying on anything else is declaring portability it does not have — the projection
    // would succeed and quietly ship a fraction of the artifact.
    const tools = e.tools ?? [];
    if (tools.length === 0) fail("I6", e._file, "tools must list at least one target");

    const portable = tools.filter((t) => t !== "claude");
    if (portable.length) {
      if (skills.length === 0) {
        fail(
          "I6",
          at,
          `declares ${portable.join(", ")} but ships no skills. Only skills project; nothing would be installed (ADR-0004).`,
        );
      }
      if (hasHooks) {
        fail(
          "I6",
          at,
          `declares ${portable.join(", ")} but ships hooks/, which does not project. Drop the tool, or express the logic as a skill (ADR-0004).`,
        );
      }
      if (hasMcp) {
        warn(
          "I6",
          at,
          `ships .mcp.json, which does not project to ${portable.join(", ")}. Document the per-tool setup in the README.`,
        );
      }
      if (existsSync(join(dir, "commands"))) {
        warn("I6", at, "ships commands/, which do not project. Only skills do (ADR-0004).");
      }
    }

    // I9: MCP servers must point at allowlisted hosts.
    if (hasMcp) {
      const mcp = JSON.parse(await readFile(join(dir, ".mcp.json"), "utf8"));
      for (const [server, cfg] of Object.entries(mcp.mcpServers ?? {})) {
        if (!cfg.url) continue;
        let host;
        try {
          host = new URL(cfg.url).hostname;
        } catch {
          fail("I9", `${at}/.mcp.json`, `server "${server}" has an unparseable url`);
          continue;
        }
        if (!policy.allowedMcpHosts.includes(host)) {
          fail(
            "I9",
            `${at}/.mcp.json`,
            `server "${server}" points at "${host}", which is not in policy.allowedMcpHosts`,
          );
        }
      }
    }
  }

  // ── I7: dependency graph is sound ─────────────────────────────────────────────
  for (const e of catalog) {
    for (const dep of e.dependencies ?? []) {
      const name = dependencyName(dep);
      if (typeof dep === "object" && dep.marketplace) {
        const allowed = config.marketplace.allowCrossMarketplaceDependenciesOn ?? [];
        if (!allowed.includes(dep.marketplace)) {
          fail(
            "I7",
            e._file,
            `depends on "${name}" from marketplace "${dep.marketplace}", which is not in allowCrossMarketplaceDependenciesOn (ADR-0005)`,
          );
        }
        continue;
      }
      const target = byName.get(name);
      if (!target) {
        fail("I7", e._file, `depends on "${name}", which is not in the catalog`);
      } else if (target.maturity === "deprecated") {
        fail("I7", e._file, `depends on "${name}", which is deprecated (ADR-0010)`);
      }
    }
  }

  // Cycle detection over the local dependency graph.
  const WHITE = 0, GREY = 1, BLACK = 2;
  const colors = new Map(catalog.map((e) => [e.name, WHITE]));
  function visit(name, path) {
    if (colors.get(name) === BLACK) return;
    if (colors.get(name) === GREY) {
      fail("I7", "catalog", `dependency cycle: ${[...path, name].join(" -> ")}`);
      return;
    }
    colors.set(name, GREY);
    for (const dep of byName.get(name)?.dependencies ?? []) {
      const next = dependencyName(dep);
      if (byName.has(next)) visit(next, [...path, name]);
    }
    colors.set(name, BLACK);
  }
  for (const e of catalog) visit(e.name, []);

  return { errors, warnings, count: catalog.length };
}

/** Files directly under `dir` with the given extension. */
async function listFiles(dir, ext) {
  if (!existsSync(dir)) return [];
  return (await readdir(dir, { withFileTypes: true }))
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => d.name);
}

// ── CLI ─────────────────────────────────────────────────────────────────────────
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const { errors, warnings, count } = await validate();
  for (const w of warnings) console.warn(`warning ${w}`);
  for (const e of errors) console.error(`error   ${e}`);
  console.log(`\n${count} artifacts checked — ${errors.length} error(s), ${warnings.length} warning(s).`);
  process.exit(errors.length ? 1 : 0);
}
