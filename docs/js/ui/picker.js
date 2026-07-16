// One picker for the whole catalog. It replaces the two switchers that used to
// split this job — a family nav in the header, a pedal segment in the PEDAL
// label — because they answered the wrong question. A visitor arrives wanting a
// pedal ("show me chorus"), not a math class, and the two-step forced them to
// already know which family their pedal lived in before they could look for it.
//
// The families don't disappear, they become the list's headings. That's the
// point rather than the decoration: someone who searches "reverb" and lands on
// ambient under DELAY has been taught the page's actual thesis — that the pedal
// you know is an instance of a mechanism — without reading a word of prose. The
// taxonomy teaches on the way to the answer.
//
// Order is never ranked, only filtered: the catalog's own order is the teaching
// order (see each family's file), so a search narrows the list without ever
// reshuffling it out of the sequence the lesson intends.
//
// mountPicker(host, {families, onPick}) -> {select(pedalId)}
// `families` are the view modules ({id, navLabel, pedals}); onPick(pedalId)
// fires only on a real user choice. select() reflects state the page set some
// other way (a cold load, a back/forward) and deliberately does NOT call back.

export function mountPicker(host, { families, onPick }) {
  // Every pedal on the page, each still knowing its family. This is the list
  // the picker searches; `families` order == catalog order == lesson order.
  const entries = families.flatMap((f) => f.pedals.map((p) => ({ p, f })));

  host.innerHTML = "";
  host.className = "pick";
  const btn = mk("button", "pickbtn");
  btn.type = "button";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const btnPed = mk("span", "pickped");
  const btnFam = mk("span", "pickfam");
  const caret = mk("span", "pickcar");
  caret.textContent = "▾";
  caret.setAttribute("aria-hidden", "true");
  btn.append(btnPed, btnFam, caret);

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

  // The haystack: the label, the id, the family's name, and the aliases the
  // pedal answers to. Family included on purpose — "delay" should surface the
  // whole delay family, not just the pedals with "delay" in their alias list.
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
      // A real group wrapping its options, not a heading with loose options
      // after it. The two look identical, but only one is legible to a screen
      // reader, and the family is the payload here — search "vibrato", learn the
      // pedal you wanted is a modulation. Left flat, that lesson was drawn on the
      // screen and nowhere else: the options announced as "warble, 1 of 1" and
      // the heading never came up at all.
      //
      // The group's aria-label carries the family name, so the visible heading is
      // decoration and is marked as such — otherwise the name lands in the
      // accessibility tree twice, once as the group and once as stray text.
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
    // The empty state names the query. This page's catalog is a work in
    // progress, so "we haven't built that one" is a real answer — and a truer
    // one than an empty box, which reads as a broken search.
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
    btnFam.textContent = current.f.navLabel;
  }

  // `refocus` is for closes the user drove from the keyboard — Escape, or landing
  // a pick — where focus has to come back to the button or it falls on the floor.
  // A close caused by clicking elsewhere must NOT refocus: focus has already gone
  // where the user pointed it, and pulling it back would yank them off the knob
  // they just reached for.
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

  // Keep focus where it is, the same trick the options use above, and for the
  // same reason: this button's click has to survive the blur that precedes it.
  // Safari doesn't focus a button when you click it, so with the popup open the
  // mousedown blurs the search field, focusout closes the popup, and the click
  // then lands on an `open` that already reads false and reopens what the blur
  // just shut — a button that visibly does nothing. Chrome and Firefox focus the
  // button, so relatedTarget stays inside the host and none of it happens, which
  // is why this needs webkit in the run to stay fixed.
  //
  // Nothing is lost by refusing the focus: setOpen() already places focus
  // deliberately in both directions — the search field on open, the button on
  // close — so it never depends on where the click would have put it.
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
  // Clicking away is a dismissal, not a choice.
  //
  // Test the event's relatedTarget — where focus is GOING — and not
  // document.activeElement. During focusout the new element hasn't taken focus
  // yet, so activeElement reads as <body>, which is outside the host: opening the
  // popup moves focus from the button to the search field, that move fires
  // focusout, and the handler would close the popup it just opened. The bug looks
  // like a dead button. relatedTarget is the only thing here that knows the
  // difference between moving within the picker and leaving it.
  host.addEventListener("focusout", (ev) => {
    if (!host.contains(ev.relatedTarget)) setOpen(false);
  });

  label();
  return {
    // Reflect state the page arrived at some other way — a cold ?pedal= load, or
    // a back/forward. Silent by design: the URL is already right, and calling
    // onPick here would push a duplicate entry onto the history it came from.
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
