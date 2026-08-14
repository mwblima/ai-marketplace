/**
 * Fixture builder for the guardrail tests.
 *
 * Each test builds a throwaway repository in a temp directory and runs the real validator
 * against it. Nothing here asserts on this repository's own catalog: a test that only
 * passes because the current catalog happens to be valid proves nothing about the
 * invariant, and breaks the moment someone adds an artifact.
 *
 * The baseline config is read from the real marketplace.config.json, so a policy change
 * that would break the invariants shows up in the test run rather than in a PR.
 */

import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify as stringifyYaml } from "yaml";
import { ROOT, loadConfig } from "../scripts/lib/catalog.mjs";

/**
 * Whether git is on PATH. Three invariants (I1 immutability, I10 release tags) read git,
 * and validate.mjs deliberately degrades to skipping them when it is absent. The tests for
 * those have to degrade the same way: on a minimal image without git, five red tests that
 * mean nothing are worse than five honest skips.
 */
export const HAS_GIT = (() => {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

/** Marks a test as skipped, with a reason, when git is unavailable. */
export const needsGit = { skip: HAS_GIT ? false : "git is not available on PATH" };

/** Long enough to clear policy.descriptionMinLength, and shaped like a real one. */
export const DESC =
  "Review a change against the team's engineering standards and report the defects found, " +
  "with file and line references. Use before requesting human review.";

const CODEOWNERS = `/catalog/company/  @acme/platform
/catalog/data/     @acme/data
`;

/**
 * @param {object} t node:test context, used to clean the temp directory up afterwards.
 * @param {object} spec
 * @param {object} [spec.config]     deep-ish overrides for marketplace.config.json
 * @param {Array}  [spec.artifacts]  catalog entries; `_files` adds plugin content
 */
export async function makeRepo(t, spec = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ai-marketplace-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const base = await loadConfig(ROOT);
  const config = {
    ...base,
    ...spec.config,
    marketplace: { ...base.marketplace, ...spec.config?.marketplace },
    policy: { ...base.policy, ...spec.config?.policy },
  };

  const write = async (rel, content) => {
    const abs = join(dir, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  };

  await write("marketplace.config.json", JSON.stringify(config, null, 2));
  await write(".github/CODEOWNERS", CODEOWNERS);

  for (const spec_ of spec.artifacts ?? [artifact()]) {
    const { _path, _files, ...entry } = spec_;
    await write(_path ?? `catalog/company/${entry.name}.yaml`, stringifyYaml(entry));

    const external = entry.source && typeof entry.source === "object";
    if (external) continue;

    const files = _files ?? defaultFiles(entry);
    for (const [rel, content] of Object.entries(files)) {
      await write(`plugins/${entry.name}/${rel}`, content);
    }
  }

  return {
    dir,
    write,
    /** Turn the fixture into a git repository so the git-dependent invariants can run. */
    git(...args) {
      return execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    },
    /** Commit a marketplace.json describing `plugins`, and return the commit sha. */
    async commitMarketplace(plugins) {
      this.git("init", "-q");
      this.git("config", "user.email", "test@example.com");
      this.git("config", "user.name", "test");
      await write(".claude-plugin/marketplace.json", JSON.stringify({ name: "acme", plugins }, null, 2));
      this.git("add", "-A");
      this.git("commit", "-qm", "fixture");
      return this.git("rev-parse", "HEAD").trim();
    },
  };
}

/** A catalog entry that passes every invariant. Tests override exactly one field. */
export function artifact(overrides = {}) {
  return {
    name: "thing",
    displayName: "Thing",
    version: "1.0.0",
    description: DESC,
    category: "development",
    scope: "company",
    owner_team: "platform",
    maturity: "supported",
    last_reviewed: "2026-08-01",
    data_classification: "internal",
    tools: ["claude"],
    artifact_types: ["skill"],
    ...overrides,
  };
}

/** Plugin content matching the entry's declared artifact_types. */
function defaultFiles(entry) {
  const files = {
    ".claude-plugin/plugin.json": JSON.stringify(
      { name: entry.name, version: entry.version, description: entry.description },
      null,
      2,
    ),
  };
  if ((entry.artifact_types ?? []).includes("skill")) {
    files[`skills/${entry.name}/SKILL.md`] = `---\nname: ${entry.name}\ndescription: ${entry.description}\n---\n\n# ${entry.name}\n\nBody.\n`;
  }
  return files;
}

/** Invariant ids present in a validate() result, e.g. ["I9"]. */
export function ids(messages) {
  return messages.map((m) => m.match(/^\[([^\]]+)\]/)?.[1]);
}
