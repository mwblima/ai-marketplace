/**
 * Static catalog browser (ADR-0008). Plain JS, no dependencies, no build step.
 * Search runs entirely client-side over data/index.json (ADR-0006).
 */

const state = { all: [], marketplace: {}, query: "", facets: {}, page: 1, expanded: {} };

const FACETS = [
  { key: "kind", label: "Type" },
  { key: "artifact_types", label: "Surface", multi: true },
  { key: "category", label: "Category" },
  { key: "owner_team", label: "Team" },
  { key: "tools", label: "Tool", multi: true },
  { key: "maturity", label: "Maturity" },
];

/** Cards per page — two full rows of the grid. A catalog that outgrows one screen should
    not scroll forever. */
const PAGE_SIZE = 6;

/** Values shown in a facet group before it collapses behind a "+N more" toggle. */
const FACET_LIMIT = 6;

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

function matchesFacets(a, exceptKey = null) {
  return FACETS.every(({ key, multi }) => {
    if (key === exceptKey) return true;
    const selected = state.facets[key];
    if (!selected) return true;
    return multi ? (a[key] ?? []).includes(selected) : a[key] === selected;
  });
}

/**
 * Rows matching the query and every facet except `exceptKey`. Passing a key gives the counts
 * for that facet's own chips: a category still shows how many results choosing it would
 * yield, rather than always reading 0 once a different value is selected.
 */
function visible(exceptKey = null) {
  const terms = norm(state.query).split(/\s+/).filter(Boolean);
  let rows = state.all.filter((a) => matchesFacets(a, exceptKey));

  if (terms.length) {
    rows = rows
      .map((a) => ({ a, s: score(a, terms) }))
      .filter((r) => r.s > 0)
      .sort((x, y) => y.s - x.s || x.a.name.localeCompare(y.a.name))
      .map((r) => r.a);
  }
  return rows;
}

/** Any change to the result set starts over at page 1, so the view is never out of range. */
function update() {
  state.page = 1;
  render();
}

function activeFilterCount() {
  return FACETS.filter(({ key }) => state.facets[key]).length;
}

function renderFacets() {
  const box = el("facets");
  box.innerHTML = "";

  for (const { key, label, multi } of FACETS) {
    // Count against everything else, so a chip reads as "picking this gives N results".
    const pool = visible(key);
    const counts = new Map();
    for (const a of pool) {
      const values = multi ? (a[key] ?? []) : a[key] ? [a[key]] : [];
      for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
    }

    const selected = state.facets[key];
    // A value that no longer matches anything still has to be shown while it is selected —
    // otherwise the chip that produced an empty result set disappears and cannot be undone.
    if (selected && !counts.has(selected)) counts.set(selected, 0);
    // A facet with a single option is not a choice, so it is hidden — unless it is the one
    // holding the current selection, which would otherwise leave an empty result set with
    // no chip to click back off.
    if (counts.size < 2 && !selected) continue;

    const values = [...counts.keys()].sort(
      (x, y) => counts.get(y) - counts.get(x) || x.localeCompare(y),
    );
    const expanded = state.expanded[key] || values.length <= FACET_LIMIT + 1;
    const shown = expanded ? values : values.slice(0, FACET_LIMIT);
    if (selected && !shown.includes(selected)) shown.unshift(selected);

    const group = document.createElement("div");
    group.className = "facet-group";
    const name = document.createElement("span");
    name.className = "facet-label";
    name.textContent = label;
    group.append(name);

    for (const value of shown) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.setAttribute("aria-pressed", String(selected === value));
      chip.append(document.createTextNode(value));
      const n = document.createElement("span");
      n.className = "chip-count";
      n.textContent = counts.get(value);
      chip.append(n);
      chip.addEventListener("click", () => {
        state.facets[key] = selected === value ? null : value;
        update();
      });
      group.append(chip);
    }

    if (!expanded) {
      const more = document.createElement("button");
      more.className = "chip chip-more";
      more.type = "button";
      more.textContent = `+${values.length - shown.length} more`;
      more.addEventListener("click", () => {
        state.expanded[key] = true;
        renderFacets();
      });
      group.append(more);
    }
    box.append(group);
  }

  if (activeFilterCount() || state.query) {
    const clear = document.createElement("button");
    clear.className = "clear-filters";
    clear.type = "button";
    clear.textContent = "Clear filters";
    clear.addEventListener("click", () => {
      state.facets = {};
      state.query = "";
      el("q").value = "";
      update();
    });
    box.append(clear);
  }
}

/**
 * The narrow-screen disclosure for the facet block. The button is hidden by CSS on wide
 * screens, where the filters are always open; the count is what makes a collapsed block
 * honest about hiding an active filter.
 */
function renderFilterToggle() {
  const n = activeFilterCount();
  el("filter-toggle").textContent = n ? `Filters · ${n} active` : "Filters";
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

function card(a) {
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

  // Surfaces first: what an install actually puts on your machine is the thing worth
  // seeing before anything else on the card (ADR-0012).
  const surfaces = document.createElement("div");
  surfaces.className = "meta";
  if (a.kind === "pack") surfaces.append(tag(`pack · ${a.dependencies.length} artifacts`, "pack"));
  for (const s of a.artifact_types ?? []) surfaces.append(tag(s, "surface"));
  if (a.maturity && a.maturity !== "supported") surfaces.append(tag(a.maturity, a.maturity));
  if (isStale(a)) surfaces.append(tag("unreviewed", "stale"));

  const foot = document.createElement("div");
  foot.className = "card-foot";
  foot.textContent = [a.owner_team && `@${a.owner_team}`, a.category, a.tools.join(" · ")]
    .filter(Boolean)
    .join("  ·  ");

  li.append(head, desc, surfaces, foot);
  li.addEventListener("click", () => openDetail(a));
  li.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDetail(a);
    }
  });
  return li;
}

function renderPager(total, pages) {
  const nav = el("pager");
  nav.innerHTML = "";
  nav.hidden = pages <= 1;
  if (pages <= 1) return;

  const go = (page) => {
    state.page = page;
    render();
    el("results").scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const step = (label, page, disabled) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "page-btn";
    b.textContent = label;
    b.disabled = disabled;
    if (!disabled) b.addEventListener("click", () => go(page));
    return b;
  };

  nav.append(step("← Prev", state.page - 1, state.page === 1));

  for (let p = 1; p <= pages; p++) {
    // Always the first, last, and current page's neighbours; the rest collapse to an ellipsis
    // so a hundred artifacts do not produce a row of thirty buttons.
    const near = Math.abs(p - state.page) <= 1 || p === 1 || p === pages;
    if (!near) {
      if (nav.lastElementChild?.className !== "page-gap") {
        const gap = document.createElement("span");
        gap.className = "page-gap";
        gap.textContent = "…";
        nav.append(gap);
      }
      continue;
    }
    const b = step(String(p), p, false);
    if (p === state.page) {
      b.classList.add("is-current");
      b.setAttribute("aria-current", "page");
    }
    nav.append(b);
  }

  nav.append(step("Next →", state.page + 1, state.page === pages));

  const info = document.createElement("span");
  info.className = "page-info";
  const first = (state.page - 1) * PAGE_SIZE + 1;
  info.textContent = `${first}–${Math.min(state.page * PAGE_SIZE, total)} of ${total}`;
  nav.append(info);
}

function render() {
  const rows = visible();
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  state.page = Math.min(Math.max(1, state.page), pages);

  const list = el("results");
  list.innerHTML = "";
  for (const a of rows.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE)) {
    list.append(card(a));
  }

  el("empty").hidden = rows.length > 0;
  el("count").textContent =
    rows.length === state.all.length
      ? `${rows.length} artifacts`
      : `${rows.length} of ${state.all.length}`;
  renderFacets();
  renderFilterToggle();
  renderPager(rows.length, pages);
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
    note.className = "hint";
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
    link.className = "detail-link";
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

/**
 * Header and footer links, all derived from the single repoUrl in marketplace.config.json.
 * When it is unset there is nowhere to send anyone, so the links are removed rather than
 * left pointing at "#".
 */
function renderLinks(repoUrl) {
  const targets = {
    "repo-link": repoUrl,
    "contribute-link": `${repoUrl}/blob/main/CONTRIBUTING.md`,
    "contributing-link": `${repoUrl}/blob/main/CONTRIBUTING.md`,
    "request-link": `${repoUrl}/issues/new?template=artifact-request.yml`,
    "adr-link": `${repoUrl}/tree/main/docs/adr`,
  };
  for (const [id, href] of Object.entries(targets)) {
    const node = el(id);
    if (!node) continue;
    if (repoUrl) node.href = href;
    else node.remove();
  }
}

async function main() {
  const res = await fetch("data/index.json");
  const data = await res.json();

  state.all = data.artifacts;
  state.marketplace = data.marketplace;

  document.title = data.marketplace.title;
  el("site-title").textContent = data.marketplace.title;
  el("site-tagline").textContent = data.marketplace.tagline;
  renderLinks(data.marketplace.repoUrl);

  el("q").addEventListener("input", (e) => {
    state.query = e.target.value;
    update();
  });
  el("filter-toggle").addEventListener("click", (e) => {
    const open = el("facets").classList.toggle("collapsed") === false;
    e.currentTarget.setAttribute("aria-expanded", String(open));
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
