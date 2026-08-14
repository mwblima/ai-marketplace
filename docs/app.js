/**
 * Static catalog browser (ADR-0008). Plain JS, no dependencies, no build step.
 * Search runs entirely client-side over data/index.json (ADR-0006).
 */

const state = { all: [], marketplace: {}, query: "", facets: {} };

const FACETS = [
  { key: "kind", label: "Type" },
  { key: "category", label: "Category" },
  { key: "owner_team", label: "Team" },
  { key: "tools", label: "Tool", multi: true },
  { key: "maturity", label: "Maturity" },
];

const el = (id) => document.getElementById(id);

/** Accent- and case-insensitive, so "codigo" matches "código". */
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

/**
 * AND across query terms, OR across fields, with an explainable ranking.
 * No fuzzy matching: a wrong result that looks right is worse than no result (ADR-0006).
 */
function score(artifact, terms) {
  const name = norm(artifact.name);
  const display = norm(artifact.displayName);
  const desc = norm(artifact.description);
  const keywords = artifact.keywords.map(norm);
  const team = norm(artifact.owner_team);

  let total = 0;
  for (const term of terms) {
    let best = 0;
    if (name === term || display === term) best = 100;
    else if (name.startsWith(term)) best = 60;
    else if (name.includes(term) || display.includes(term)) best = 40;
    else if (keywords.some((k) => k.includes(term))) best = 25;
    else if (desc.includes(term)) best = 12;
    else if (team.includes(term)) best = 8;
    if (best === 0) return 0; // every term must match something
    total += best;
  }
  return total;
}

function visible() {
  const terms = norm(state.query).split(/\s+/).filter(Boolean);

  let rows = state.all.filter((a) =>
    FACETS.every(({ key, multi }) => {
      const selected = state.facets[key];
      if (!selected) return true;
      return multi ? (a[key] ?? []).includes(selected) : a[key] === selected;
    }),
  );

  if (terms.length) {
    rows = rows
      .map((a) => ({ a, s: score(a, terms) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
      .map((r) => r.a);
  }
  return rows;
}

function renderFacets() {
  const box = el("facets");
  box.innerHTML = "";

  for (const { key, label, multi } of FACETS) {
    const values = new Set();
    for (const a of state.all) {
      if (multi) (a[key] ?? []).forEach((v) => values.add(v));
      else if (a[key]) values.add(a[key]);
    }
    if (values.size < 2) continue;

    const group = document.createElement("div");
    group.className = "facet-group";
    group.innerHTML = `<span class="facet-label">${label}</span>`;

    for (const value of [...values].sort()) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.textContent = value;
      chip.setAttribute("aria-pressed", String(state.facets[key] === value));
      chip.addEventListener("click", () => {
        state.facets[key] = state.facets[key] === value ? null : value;
        render();
      });
      group.append(chip);
    }
    box.append(group);
  }
}

function tag(text, cls = "") {
  const s = document.createElement("span");
  s.className = `tag ${cls}`.trim();
  s.textContent = text;
  return s;
}

/**
 * Days since the owning team last confirmed the artifact is current, or null (ADR-0012).
 * Shown on the card because the person deciding whether to adopt something is exactly the
 * person who should know it has not been looked at in a year.
 */
function reviewAgeDays(a) {
  if (!a.last_reviewed) return null;
  return Math.floor((Date.now() - Date.parse(`${a.last_reviewed}T00:00:00Z`)) / 86400000);
}

function isStale(a) {
  const limit = state.marketplace.reviewMaxAgeDays;
  if (!limit || a.maturity === "deprecated") return false;
  const age = reviewAgeDays(a);
  return age === null || age > limit;
}

function render() {
  const rows = visible();
  const list = el("results");
  list.innerHTML = "";

  for (const a of rows) {
    const li = document.createElement("li");
    li.className = `card${a.kind === "pack" ? " is-pack" : ""}`;
    li.tabIndex = 0;

    const head = document.createElement("div");
    head.className = "card-head";
    const name = document.createElement("span");
    name.className = "card-name";
    name.textContent = a.displayName;
    const slug = document.createElement("span");
    slug.className = "card-slug";
    slug.textContent = a.name;
    head.append(name, slug);

    const desc = document.createElement("p");
    desc.className = "card-desc";
    desc.textContent = a.description;

    const meta = document.createElement("div");
    meta.className = "meta";
    if (a.kind === "pack") meta.append(tag(`pack · ${a.dependencies.length} artifacts`, "pack"));
    if (a.maturity) meta.append(tag(a.maturity, a.maturity));
    if (a.owner_team) meta.append(tag(`@${a.owner_team}`));
    if (a.category) meta.append(tag(a.category));
    for (const t of a.tools) meta.append(tag(t));
    if (isStale(a)) meta.append(tag("unreviewed", "stale"));

    li.append(head, desc, meta);
    li.addEventListener("click", () => openDetail(a));
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDetail(a);
      }
    });
    list.append(li);
  }

  el("empty").hidden = rows.length > 0;
  el("count").textContent =
    rows.length === state.all.length
      ? `${rows.length} artifacts`
      : `${rows.length} of ${state.all.length}`;
  renderFacets();
}

function commandBlock(command) {
  const pre = document.createElement("pre");
  pre.className = "cmd";
  pre.textContent = command;

  const btn = document.createElement("button");
  btn.className = "copy";
  btn.type = "button";
  btn.textContent = "copy";
  btn.addEventListener("click", async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(command);
      btn.textContent = "copied";
    } catch {
      btn.textContent = "copy failed";
    }
    setTimeout(() => (btn.textContent = "copy"), 1500);
  });

  pre.append(btn);
  return pre;
}

function openDetail(a) {
  const body = el("detail-body");
  body.innerHTML = "";

  const h2 = document.createElement("h2");
  h2.id = "detail-title";
  h2.textContent = a.displayName;
  const slug = document.createElement("div");
  slug.className = "card-slug";
  slug.textContent = a.name + (a.version ? ` · v${a.version}` : "");
  const desc = document.createElement("p");
  desc.textContent = a.description;
  body.append(h2, slug, desc);

  if (a.maturity === "deprecated") {
    const n = document.createElement("p");
    n.className = "notice";
    n.textContent = a.superseded_by
      ? `Deprecated. Use ${a.superseded_by} instead.`
      : "Deprecated.";
    body.append(n);
  }

  const install = document.createElement("h3");
  install.textContent = "Install";
  body.append(install, commandBlock(`claude plugin install ${a.name}@${state.marketplace.name}`));

  if (a.tools.includes("codex") || a.tools.includes("cursor")) {
    const note = document.createElement("p");
    note.style.cssText = "font-size:.85rem;color:var(--muted);margin:4px 0 0";
    note.textContent =
      "Codex and Cursor: clone the repository and run dist/<tool>/install.sh to symlink the skill.";
    body.append(note);
  }

  if (a.kind === "pack" && a.dependencies.length) {
    const h3 = document.createElement("h3");
    h3.textContent = `Installs ${a.dependencies.length} artifacts`;
    const ul = document.createElement("ul");
    ul.className = "dep-list";
    for (const dep of a.dependencies) {
      const li = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = dep;
      li.append(code);
      const target = state.all.find((x) => x.name === dep);
      if (target) li.append(` — ${target.description.split(/(?<=\.)\s/)[0]}`);
      ul.append(li);
    }
    body.append(h3, ul);
  }

  const h3meta = document.createElement("h3");
  h3meta.textContent = "Details";
  const dl = document.createElement("dl");
  const age = reviewAgeDays(a);
  const rows = [
    ["Owner", a.owner_team ? `@${a.owner_team}` : "—"],
    ["Scope", a.scope ?? "—"],
    ["Maturity", a.maturity ?? "—"],
    ["Category", a.category ?? "—"],
    ["Tools", a.tools.join(", ") || "—"],
    // Every surface this artifact installs, enforced against what it actually ships by
    // invariant I11. A hook is worth seeing before you install something (ADR-0012).
    ["Surfaces", a.artifact_types?.join(", ") || "—"],
    ["Data classification", a.data_classification ?? "—"],
    [
      "Last reviewed",
      a.last_reviewed
        ? `${a.last_reviewed}${age > 0 ? ` · ${age} day${age === 1 ? "" : "s"} ago` : ""}`
        : "never",
    ],
    ["Source", a.sourcePath],
  ];
  for (const [k, v] of rows) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  body.append(h3meta, dl);

  if (state.marketplace.repoUrl) {
    const link = document.createElement("p");
    link.style.marginTop = "18px";
    const a2 = document.createElement("a");
    a2.href = `${state.marketplace.repoUrl}/tree/main/${a.sourcePath}`;
    a2.textContent = "View source and README →";
    a2.target = "_blank";
    a2.rel = "noopener";
    link.append(a2);
    body.append(link);
  }

  el("detail").hidden = false;
  el("detail-close").focus();
}

function closeDetail() {
  el("detail").hidden = true;
}

async function main() {
  const res = await fetch("data/index.json");
  const data = await res.json();

  state.all = data.artifacts;
  state.marketplace = data.marketplace;

  document.title = data.marketplace.title;
  el("site-title").textContent = data.marketplace.title;
  el("site-tagline").textContent = data.marketplace.tagline;
  el("repo-link").href = data.marketplace.repoUrl;
  el("adr-link").href = `${data.marketplace.repoUrl}/tree/main/docs/adr`;

  el("q").addEventListener("input", (e) => {
    state.query = e.target.value;
    render();
  });
  el("detail-close").addEventListener("click", closeDetail);
  el("detail").addEventListener("click", (e) => {
    if (e.target === el("detail")) closeDetail();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDetail();
    if (e.key === "/" && document.activeElement !== el("q")) {
      e.preventDefault();
      el("q").focus();
    }
  });

  render();
}

main();
