// One picker for the whole catalog. Families become the list's headings, so a
// search surfaces the family a pedal belongs to. Order is never ranked, only
// filtered: the catalog's own order is the teaching order.
//
// mountPicker(host, {families, onPick}) -> {select(pedalId)}
// `families` are the view modules ({id, navLabel, pedals}); onPick(pedalId)
// fires only on a real user choice. select() reflects state the page set some
// other way (a cold load, a back/forward) and deliberately does NOT call back.

export function mountPicker(host, { families, onPick }) {
  // Every pedal on the page, each still knowing its family; `families` order ==
  // catalog order == lesson order.
  const entries = families.flatMap((f) => f.pedals.map((p) => ({ p, f })));

  host.innerHTML = "";
  host.className = "pick";
  const btn = mk("button", "pickbtn");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  // The pedal's name and nothing else — the row's FAMILY column names the family.
  const btnPed = mk("span", "pickped");
  const caret = mk("span", "pickcar");
  caret.textContent = "▾";
  caret.setAttribute("aria-hidden", "true");
  btn.append(btnPed, caret);

  const pop = mk("div", "pickpop");
  pop.hidden = true;
  const search = mk("input", "picksearch");
  Object.assign(search, { type: "text", placeholder: "search pedals…" });
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-autocomplete", "list");
  search.setAttribute("aria-controls", "picklist");
  search.setAttribute("aria-expanded", "true");
  const list = mk("ul", "picklist");
  list.id = "picklist";
  list.setAttribute("role", "listbox");
  const empty = mk("p", "pickempty");
  empty.hidden = true;
  pop.append(search, list, empty);
  host.append(btn, pop);

  let open = false;
  let current = entries[0];
  let active = null; // keyboard cursor; an entry, or null when nothing matches

  // The haystack: label, id, family name, aliases. Family included so "delay"
  // surfaces the whole delay family, not just pedals with it in their aliases.
  const hay = ({ p, f }) =>
    [p.label, p.id, f.navLabel, ...(p.search ?? [])].join(" ").toLowerCase();
  const matches = (q) =>
    q ? entries.filter((e) => hay(e).includes(q)) : entries.slice();

  const optId = ({ p, f }) => `pickopt-${f.id}-${p.id}`;

  function render() {
    const q = search.value.trim().toLowerCase();
    const hits = matches(q);
    if (!hits.includes(active)) active = hits[0] ?? null;
    list.innerHTML = "";
    for (const f of families) {
      const mine = hits.filter((e) => e.f === f);
      if (!mine.length) continue; // a family with no hits sits this search out
      // A real group (role=group + aria-label) wrapping its options, so a screen
      // reader announces the family. The visible heading is aria-hidden
      // decoration, or the name lands in the accessibility tree twice.
      const grp = mk("li", "pickgroup");
      grp.setAttribute("role", "group");
      grp.setAttribute("aria-label", f.navLabel);
      const head = mk("div", "pickgrp");
      head.textContent = f.navLabel;
      head.setAttribute("aria-hidden", "true");
      grp.appendChild(head);
      for (const e of mine) {
        const opt = mk("div", "pickopt");
        opt.id = optId(e);
        opt.setAttribute("role", "option");
        opt.setAttribute("aria-selected", String(e === current));
        opt.classList.toggle("on", e === current);
        opt.classList.toggle("cursor", e === active);
        opt.textContent = e.p.label;
        // mousedown, not click: the popup closes on the search field's blur, and
        // a click would land after that teardown.
        opt.onmousedown = (ev) => {
          ev.preventDefault();
          choose(e);
        };
        opt.onmouseenter = () => setActive(e, false);
        grp.appendChild(opt);
      }
      list.appendChild(grp);
    }
    // The empty state names the query: this catalog is a work in progress, so
    // "not built yet" is a real answer, truer than an empty box.
    empty.hidden = hits.length > 0;
    empty.textContent = `no pedal matches “${search.value.trim()}” — not built yet?`;
    search.setAttribute(
      "aria-activedescendant",
      active ? optId(active) : "",
    );
    if (active) {
      const el = list.querySelector(`#${CSS.escape(optId(active))}`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }

  function setActive(e, scroll = true) {
    active = e;
    for (const li of list.querySelectorAll(".pickopt"))
      li.classList.toggle("cursor", li.id === (e ? optId(e) : ""));
    search.setAttribute("aria-activedescendant", e ? optId(e) : "");
    if (scroll && e)
      list
        .querySelector(`#${CSS.escape(optId(e))}`)
        ?.scrollIntoView({ block: "nearest" });
  }

  function label() {
    btnPed.textContent = current.p.label;
  }

  // `refocus` is for keyboard-driven closes (Escape, landing a pick), where focus
  // must return to the button. A close from clicking elsewhere must NOT refocus:
  // focus already went where the user pointed it.
  function setOpen(v, refocus = false) {
    if (open === v) return;
    open = v;
    pop.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    host.classList.toggle("openpick", open);
    if (open) {
      search.value = ""; // opening always shows the whole catalog to browse
      active = current;
      render();
      search.focus();
    } else if (refocus) {
      btn.focus();
    }
  }

  function choose(e) {
    setOpen(false, true);
    if (e === current) return; // re-picking what's already up isn't a move
    current = e;
    label();
    onPick?.(e.p.id);
  }

  // Arrow keys walk the filtered list, not the catalog: what you see is what you
  // move through.
  function step(d) {
    const hits = matches(search.value.trim().toLowerCase());
    if (!hits.length) return;
    const i = hits.indexOf(active);
    setActive(hits[(i + d + hits.length) % hits.length]);
  }

  // Keep focus where it is (same as the options above): Safari doesn't focus a
  // button on click, so with the popup open the mousedown blurs the search,
  // focusout closes the popup, and the click reopens what the blur just shut — a
  // button that does nothing. setOpen() places focus deliberately in both
  // directions, so refusing the focus here loses nothing.
  btn.onmousedown = (ev) => ev.preventDefault();
  btn.onclick = () => setOpen(!open, true);
  btn.onkeydown = (ev) => {
    if (ev.key === "ArrowDown" || ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      setOpen(true);
    }
  };
  search.oninput = render;
  search.onkeydown = (ev) => {
    const key = ev.key;
    if (key === "ArrowDown") {
      ev.preventDefault();
      step(1);
    } else if (key === "ArrowUp") {
      ev.preventDefault();
      step(-1);
    } else if (key === "Enter") {
      ev.preventDefault();
      if (active) choose(active);
    } else if (key === "Escape") {
      ev.preventDefault();
      setOpen(false, true);
    }
  };
  // Clicking away is a dismissal, not a choice. Test relatedTarget (where focus is
  // GOING), not document.activeElement: during focusout activeElement reads as
  // <body> (outside the host), so opening the popup would fire focusout and close
  // the popup it just opened.
  host.addEventListener("focusout", (ev) => {
    if (!host.contains(ev.relatedTarget)) setOpen(false);
  });

  label();
  return {
    // Reflect state the page arrived at some other way (a cold ?pedal= load, or
    // back/forward). Silent by design: the URL is already right, and onPick here
    // would push a duplicate history entry.
    select(pedalId) {
      const hit = entries.find((e) => e.p.id === pedalId) ?? entries[0];
      current = hit;
      label();
      if (open) render();
      return hit;
    },
  };
}

function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
