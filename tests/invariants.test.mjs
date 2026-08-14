/**
 * One test per invariant in ADR-0007, each proving the guardrail fires on a repository
 * that violates it and stays quiet on one that does not.
 *
 * This is what makes the policy adaptable. An adopting company will change the rules —
 * the adoption guide tells them to — and without these tests a change to validate.mjs is a
 * change nobody can verify until an artifact slips through.
 *
 *   npm test
 *
 * Run it through npm rather than by hand. The script lets the shell expand the glob and
 * hands node a list of files, which is the only form that behaves the same across the Node
 * versions this repository supports: `node --test tests/` works on 20 and fails on 25,
 * `node --test "tests/*.test.mjs"` does the reverse, since node only learned to expand the
 * pattern itself in 22. CI runs the minimum supported version, so the difference is not
 * theoretical.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { validate } from "../scripts/validate.mjs";
import { DESC, artifact, ids, makeRepo, needsGit } from "./helpers.mjs";

const run = (repo, opts) => validate({ root: repo.dir, now: new Date("2026-08-13"), ...opts });

// ── baseline ────────────────────────────────────────────────────────────────────

test("a well-formed artifact produces no errors", async (t) => {
  const repo = await makeRepo(t);
  const { errors } = await run(repo);
  assert.deepEqual(errors, []);
});

// ── schema ──────────────────────────────────────────────────────────────────────

test("schema: a missing required field fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ owner_team: undefined })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /missing required field `owner_team`/);
});

test("schema: a category outside the policy list fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ category: "vibes" })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /category "vibes" is not one of/);
});

test("schema: a plugin must declare artifact_types", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ artifact_types: [] })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /missing required field `artifact_types`/);
});

test("schema: last_reviewed must be an ISO date", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ last_reviewed: "last tuesday" })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /must be an ISO date/);
});

// ── I1: names unique, immutable, and retired only through `renames` ─────────────

test("I1: two entries with the same name fail", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [artifact(), artifact({ _path: "catalog/data/thing.yaml", owner_team: "data" })],
  });
  const { errors } = await run(repo);
  assert.ok(ids(errors).includes("I1"), errors.join("\n"));
});

test("I1: dropping a published name without a rename fails", needsGit, async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ name: "kept" })] });
  const base = await repo.commitMarketplace([{ name: "kept" }, { name: "gone" }]);
  const { errors } = await run(repo, { baseRef: base });
  assert.match(errors.join(), /"gone" was removed/);
});

test("I1: a rename entry migrates a retired name", needsGit, async (t) => {
  const repo = await makeRepo(t, {
    config: { marketplace: { renames: { gone: "kept" } } },
    artifacts: [artifact({ name: "kept" })],
  });
  const base = await repo.commitMarketplace([{ name: "kept" }, { name: "gone" }]);
  const { errors } = await run(repo, { baseRef: base });
  assert.deepEqual(errors, []);
});

test("I1: a rename pointing at nothing fails", async (t) => {
  const repo = await makeRepo(t, {
    config: { marketplace: { renames: { gone: "nowhere" } } },
    artifacts: [artifact({ name: "kept" })],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /points "gone" at "nowhere", which is not in the catalog/);
});

test("I1: a name cannot be live and renamed at once", async (t) => {
  const repo = await makeRepo(t, {
    config: { marketplace: { renames: { thing: "thing" } } },
    artifacts: [artifact()],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /an artifact by that name still exists/);
});

test("I1: plugin.json disagreeing with the catalog version fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "9.9.9" }),
          "skills/thing/SKILL.md": `---\nname: thing\ndescription: ${DESC}\n---\n\nBody.\n`,
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /version mismatch/);
});

// ── I2: external sources are pinned ─────────────────────────────────────────────

const external = (source) =>
  artifact({ name: "vendored", source, _files: {}, artifact_types: ["skill"] });

test("I2: an external source pinned to a sha on an allowlisted repo passes", async (t) => {
  const repo = await makeRepo(t, {
    config: { policy: { allowedPluginRepos: ["anthropics/*"] } },
    artifacts: [external({ source: "github", repo: "anthropics/claude-plugins-official", sha: "a".repeat(40) })],
  });
  const { errors } = await run(repo);
  assert.deepEqual(errors, []);
});

test("I2: an external source without a sha fails", async (t) => {
  const repo = await makeRepo(t, {
    config: { policy: { allowedPluginRepos: ["anthropics/*"] } },
    artifacts: [external({ source: "github", repo: "anthropics/claude-plugins-official" })],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /must pin a full 40-character commit `sha`/);
});

test("I2: an external source on a moving ref fails", async (t) => {
  const repo = await makeRepo(t, {
    config: { policy: { allowedPluginRepos: ["anthropics/*"] } },
    artifacts: [
      external({ source: "github", repo: "anthropics/claude-plugins-official", sha: "a".repeat(40), ref: "main" }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /sets `ref`, which moves/);
});

test("I2: an external source outside the allowlist fails", async (t) => {
  const repo = await makeRepo(t, {
    config: { policy: { allowedPluginRepos: ["anthropics/*"] } },
    artifacts: [external({ source: "github", repo: "someone-else/plugins", sha: "a".repeat(40) })],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /is not in policy.allowedPluginRepos/);
});

// ── I3: skill and agent frontmatter ─────────────────────────────────────────────

test("I3: a SKILL.md with no frontmatter fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "skills/thing/SKILL.md": "# thing\n\nNo frontmatter.\n",
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /missing YAML frontmatter/);
});

test("I3: frontmatter name must match the skill directory", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "skills/thing/SKILL.md": `---\nname: other\ndescription: ${DESC}\n---\n\nBody.\n`,
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /!= directory "thing"/);
});

test("I3: an agent without a description fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        artifact_types: ["agent"],
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "agents/helper.md": "---\nname: helper\n---\n\nBody.\n",
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /agent frontmatter needs `name` and `description`/);
});

// ── I4 and I5: descriptions and size ────────────────────────────────────────────

test("I4: a description under the minimum fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ description: "Too short." })] });
  const { errors } = await run(repo);
  assert.ok(ids(errors).includes("I4"), errors.join("\n"));
});

test("I4: experimental downgrades the description check to a warning", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [artifact({ description: "Too short.", maturity: "experimental" })],
  });
  const { errors, warnings } = await run(repo);
  assert.ok(!ids(errors).includes("I4"), errors.join("\n"));
  assert.ok(ids(warnings).includes("I4"), warnings.join("\n"));
});

test("I5: an oversized SKILL.md fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "skills/thing/SKILL.md": `---\nname: thing\ndescription: ${DESC}\n---\n\n${"line\n".repeat(600)}`,
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.ok(ids(errors).includes("I5"), errors.join("\n"));
});

// ── I6: declared tools match what actually projects ─────────────────────────────

test("I6: declaring codex while shipping hooks fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        tools: ["claude", "codex"],
        artifact_types: ["skill", "hook"],
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "skills/thing/SKILL.md": `---\nname: thing\ndescription: ${DESC}\n---\n\nBody.\n`,
          "hooks/hooks.json": JSON.stringify({
            hooks: { PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/h.sh" }] }] },
          }),
          "hooks/h.sh": "#!/usr/bin/env bash\nexit 0\n",
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /ships hooks\/, which does not project/);
});

test("I6: declaring cursor while shipping no skill fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        tools: ["claude", "cursor"],
        artifact_types: ["command"],
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "commands/do.md": "---\ndescription: Do the thing.\n---\n\nDo it.\n",
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /ships no skills/);
});

// ── I7: dependency graph ────────────────────────────────────────────────────────

test("I7: a dependency that is not in the catalog fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [artifact({ name: "pack-x", kind: "pack", artifact_types: undefined, dependencies: ["missing"], _files: { ".claude-plugin/plugin.json": JSON.stringify({ name: "pack-x", version: "1.0.0" }) } })],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /depends on "missing", which is not in the catalog/);
});

test("I7: depending on a deprecated artifact fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({ name: "old", maturity: "deprecated", superseded_by: "thing" }),
      artifact(),
      artifact({
        name: "pack-x",
        kind: "pack",
        artifact_types: undefined,
        dependencies: ["old"],
        _files: { ".claude-plugin/plugin.json": JSON.stringify({ name: "pack-x", version: "1.0.0" }) },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /depends on "old", which is deprecated/);
});

test("I7: a dependency cycle fails", async (t) => {
  const pack = (name, dep) =>
    artifact({
      name,
      kind: "pack",
      artifact_types: undefined,
      dependencies: [dep],
      _files: { ".claude-plugin/plugin.json": JSON.stringify({ name, version: "1.0.0" }) },
    });
  const repo = await makeRepo(t, { artifacts: [pack("pack-a", "pack-b"), pack("pack-b", "pack-a")] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /dependency cycle/);
});

test("I7: a cross-marketplace dependency outside the allowlist fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        name: "pack-x",
        kind: "pack",
        artifact_types: undefined,
        dependencies: [{ name: "thing", marketplace: "somewhere-else" }],
        _files: { ".claude-plugin/plugin.json": JSON.stringify({ name: "pack-x", version: "1.0.0" }) },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /allowCrossMarketplaceDependenciesOn/);
});

// ── I8: ownership ───────────────────────────────────────────────────────────────

test("I8: an owner_team absent from CODEOWNERS fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ owner_team: "ghosts" })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /has no entry in .github\/CODEOWNERS/);
});

// ── I9: MCP hosts ───────────────────────────────────────────────────────────────

const withMcp = (url) =>
  artifact({
    artifact_types: ["mcp"],
    _files: {
      ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
      ".mcp.json": JSON.stringify({ mcpServers: { s: { type: "http", url } } }),
    },
  });

test("I9: an allowlisted MCP host passes", async (t) => {
  const repo = await makeRepo(t, { artifacts: [withMcp("https://mcp.internal.acme.example/x")] });
  const { errors } = await run(repo);
  assert.deepEqual(errors, []);
});

test("I9: an MCP host outside the allowlist fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [withMcp("https://evil.example.com/x")] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /is not in policy.allowedMcpHosts/);
});

// ── I10: release tags ───────────────────────────────────────────────────────────

test("I10: an untagged version is a warning on its own", needsGit, async (t) => {
  const repo = await makeRepo(t);
  await repo.commitMarketplace([{ name: "thing" }]);
  const { errors, warnings } = await run(repo);
  assert.ok(!ids(errors).includes("I10"), errors.join("\n"));
  assert.ok(ids(warnings).includes("I10"), warnings.join("\n"));
});

test("I10: an untagged version that another artifact constrains is an error", needsGit, async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact(),
      artifact({
        name: "pack-x",
        kind: "pack",
        artifact_types: undefined,
        dependencies: [{ name: "thing", version: "^1.0.0" }],
        _files: { ".claude-plugin/plugin.json": JSON.stringify({ name: "pack-x", version: "1.0.0" }) },
      }),
    ],
  });
  await repo.commitMarketplace([{ name: "thing" }, { name: "pack-x" }]);
  const { errors } = await run(repo);
  assert.match(errors.join(), /constrains this one by semver range/);
});

test("I10: a tagged version resolves cleanly", needsGit, async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact(),
      artifact({
        name: "pack-x",
        kind: "pack",
        artifact_types: undefined,
        dependencies: [{ name: "thing", version: "^1.0.0" }],
        _files: { ".claude-plugin/plugin.json": JSON.stringify({ name: "pack-x", version: "1.0.0" }) },
      }),
    ],
  });
  await repo.commitMarketplace([{ name: "thing" }, { name: "pack-x" }]);
  repo.git("tag", "thing--v1.0.0");
  repo.git("tag", "pack-x--v1.0.0");
  const { errors } = await run(repo);
  assert.deepEqual(errors, []);
});

// ── I11: declared surfaces match shipped surfaces ───────────────────────────────

test("I11: shipping an undeclared hook fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        artifact_types: ["skill"],
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "skills/thing/SKILL.md": `---\nname: thing\ndescription: ${DESC}\n---\n\nBody.\n`,
          "hooks/hooks.json": JSON.stringify({
            hooks: { PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/h.sh" }] }] },
          }),
          "hooks/h.sh": "#!/usr/bin/env bash\nexit 0\n",
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /ships hooks but does not declare artifact_type "hook"/);
});

test("I11: declaring a surface that does not ship fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ artifact_types: ["skill", "mcp"] })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /declares artifact_type "mcp" but ships no .mcp.json/);
});

// ── I12: deprecation points somewhere ───────────────────────────────────────────

test("I12: a deprecated artifact without superseded_by fails", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ maturity: "deprecated" })] });
  const { errors } = await run(repo);
  assert.match(errors.join(), /must set `superseded_by`/);
});

test("I12: superseded_by must name an artifact that exists", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [artifact({ maturity: "deprecated", superseded_by: "ghost" })],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /superseded_by "ghost" is not in the catalog/);
});

test("I12: superseded_by must not chain to another deprecated artifact", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({ name: "a", maturity: "deprecated", superseded_by: "b" }),
      artifact({ name: "b", maturity: "deprecated", superseded_by: "a" }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /is itself deprecated/);
});

// ── I13: reattestation ──────────────────────────────────────────────────────────

test("I13: a stale last_reviewed warns", async (t) => {
  const repo = await makeRepo(t, { artifacts: [artifact({ last_reviewed: "2025-01-01" })] });
  const { errors, warnings } = await run(repo);
  assert.deepEqual(errors, []);
  assert.match(warnings.join(), /over the 180-day limit/);
});

test("I13: a deprecated artifact is not nagged about freshness", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact(),
      artifact({ name: "old", maturity: "deprecated", superseded_by: "thing", last_reviewed: undefined }),
    ],
  });
  const { warnings } = await run(repo);
  assert.ok(!ids(warnings).includes("I13"), warnings.join("\n"));
});

// ── I14: hook mechanics ─────────────────────────────────────────────────────────

const withHook = (hooksJson, extra = {}) =>
  artifact({
    artifact_types: ["hook"],
    _files: {
      ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
      "hooks/hooks.json": JSON.stringify(hooksJson),
      ...extra,
    },
  });

test("I14: a gated hook whose script ships passes", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      withHook(
        { hooks: { PostToolUse: [{ matcher: "Edit|Write", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/h.sh" }] }] } },
        { "hooks/h.sh": "#!/usr/bin/env bash\nexit 0\n" },
      ),
    ],
  });
  const { errors } = await run(repo);
  assert.deepEqual(errors, []);
});

test("I14: a PreToolUse hook with no matcher fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      withHook(
        { hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/h.sh" }] }] } },
        { "hooks/h.sh": "#!/usr/bin/env bash\nexit 0\n" },
      ),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /fires on every tool call/);
});

test("I14: a hook pointing at a script that does not ship fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      withHook({
        hooks: { PostToolUse: [{ matcher: "Edit", hooks: [{ type: "command", command: "${CLAUDE_PLUGIN_ROOT}/hooks/missing.sh" }] }] },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /points at hooks\/missing.sh, which does not ship/);
});

test("I14: hooks/ without hooks.json fails", async (t) => {
  const repo = await makeRepo(t, {
    artifacts: [
      artifact({
        artifact_types: ["hook"],
        _files: {
          ".claude-plugin/plugin.json": JSON.stringify({ name: "thing", version: "1.0.0" }),
          "hooks/h.sh": "#!/usr/bin/env bash\nexit 0\n",
        },
      }),
    ],
  });
  const { errors } = await run(repo);
  assert.match(errors.join(), /must contain hooks.json/);
});
