// The left spine: the whole catalog as a shelf, pedals grouped under the family
// they're an instance of. Replaces the dropdown picker — the page's thesis is that
// a pedal is one member of a mechanism, so the nav SHOWS that taxonomy rather than
// hiding it behind a search box. Family name + its signal class, then the pedals,
// each a tiny hued toy so the shelf reads as pedals, not a menu.
//
// mountNav(host, {families, onPick}) -> {select(pedalId)}
// `families` are the view modules ({id, navLabel, pedals, lesson}); onPick(pedalId)
// fires only on a real user choice. select() reflects state the page reached some
// other way (a cold ?pedal= load, back/forward) and deliberately does NOT call back.
import { pedalArt } from "./art.js";

export function mountNav(host, { families, onPick }) {
  host.innerHTML = "";
  const entries = []; // {p, f, el} in shelf order, for select()

  const head = document.createElement("p");
  head.className = "navhead";
  head.textContent = "pedal";
  host.appendChild(head);

  for (const f of families) {
    const fam = document.createElement("div");
    fam.className = "fam";
    // family name over its signal class — the general case; no formulas or aliases
    // here (that's the catalog's job), just the taxonomy the shelf is teaching.
    const label = document.createElement("div");
    label.className = "famlabel";
    const name = document.createElement("span");
    name.className = "famname";
    name.textContent = f.navLabel;
    const klass = document.createElement("span");
    klass.className = "famklass";
    klass.textContent = f.lesson?.klass ?? "";
    label.append(name, klass);
    fam.appendChild(label);

    const list = document.createElement("ul");
    list.className = "plist";
    for (const p of f.pedals) {
      const li = document.createElement("li");
      li.className = "pitem";
      li.setAttribute("role", "button");
      li.tabIndex = 0;
      li.dataset.id = p.id;
      // the toy pedal, same art.js the catalog and old band used, shrunk to a glyph.
      // aria-hidden inside it (art.js) — the name beside it already says the pedal.
      const glyph = document.createElement("span");
      glyph.className = "glyph";
      glyph.innerHTML = pedalArt(p.art);
      const pname = document.createElement("span");
      pname.className = "pname";
      pname.textContent = p.label;
      li.append(glyph, pname);
      list.appendChild(li);
      entries.push({ p, f, el: li });
    }
    fam.appendChild(list);
    host.appendChild(fam);
  }

  let currentId = null;
  function mark(id) {
    currentId = id;
    for (const { p, el } of entries)
      el.setAttribute("aria-current", String(p.id === id));
  }

  // Re-picking what's already open isn't a move: fire onPick only on a real change,
  // so the page never pushes a duplicate history entry (the picker guarded this too).
  function choose(id) {
    if (id === currentId) return;
    onPick?.(id);
  }
  host.addEventListener("click", (e) => {
    const it = e.target.closest(".pitem");
    if (it) choose(it.dataset.id);
  });
  host.addEventListener("keydown", (e) => {
    const it = e.target.closest(".pitem");
    if (it && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      choose(it.dataset.id);
    }
  });

  return {
    // Silent, like the picker's was: the URL is already right on a cold/history
    // load, and an onPick here would push a duplicate history entry.
    select(pedalId) {
      const hit = entries.find((e) => e.p.id === pedalId) ?? entries[0];
      mark(hit.p.id);
      hit.el.scrollIntoView?.({ block: "nearest" });
      return hit;
    },
  };
}
