// The catalog's row grammar: column names, a family band, a pedal. The bench builds
// its own band by id (index.html + harness), so this file is the catalog's alone.
// A family is the generic row — navLabel, `formula`, its `oneLiner` — and every
// pedal under it is that row with the blanks filled in. Geometry is shared across
// all three rows (.cathead/.famhead/.catrow, one grid rule).

// The bench's two claims for one pedal, resolved the same way here and in the
// harness so the two pages can't disagree: `outnar` is the waveform claim,
// `spectrumTitle` the spectrum's (a family string, or fn(pedal)). `bandSwap` crosses
// which reads as CHANGES and which as YOU HEAR — modulation hears the pulse (top
// chart) and shows the sidebands it makes (bottom), the reverse of clipping.
export function claims(view, pedal) {
  const topNar = pedal.outnar ?? "";
  const st = view.spectrumTitle;
  const botNar = typeof st === "function" ? st(pedal) : (st ?? "");
  return view.bandSwap
    ? { topNar, botNar, changes: botNar, youHear: topNar }
    : { topNar, botNar, changes: topNar, youHear: botNar };
}

// Column names. Base four — pedal, operation, then the two claims — plus the
// catalog's SHAPE track, spliced in at `at` so a row reads operation → its picture
// → what it does. On the end instead, a claim would wedge between the formula and
// the drawing of it.
export function headRow(extra, at = 2) {
  const r = mk("div", "cathead");
  const names = ["pedal", "operation", "changes", "you hear"];
  if (extra) names.splice(at, 0, extra);
  for (const t of names) {
    const c = mk("span");
    c.textContent = t;
    r.appendChild(c);
  }
  return r;
}

// A family, in the same columns as its pedals.
//
// `href` is the way out to the catalog — the bench's case, where the band's name is
// the only thing naming the family. Withheld on the catalog, the page it would link to.
//
// `extra`/`at` are the catalog's SHAPE track; the band reserves its place but leaves
// it empty — there's no general case of a curve. `oneLiner` is the family's single
// summary, spanning both claim columns (see #cat .famwhat): the general case the
// pedals below split into CHANGES and YOU HEAR.
export function famRow(f, { href, extra, at = 2 } = {}) {
  const head = mk("h2", "famhead");

  const who = mk("span", "famcell");
  const name = mk(href ? "a" : "span", "famname");
  if (href) name.href = href;
  name.textContent = f.navLabel;
  // "family", the noun the PEDAL header can't say for it: this name sits in the
  // PEDAL column so CLIPPING reads as a fourth pedal, and the band is the general
  // case those pedals are instances of. The space is in the text, not the CSS — a
  // margin would still leave the name reading "clippingfamily" to a screen reader,
  // a copied selection, or a test.
  const noun = mk("span", "famnoun");
  noun.textContent = href ? " family →" : " family";
  name.appendChild(noun);
  who.appendChild(name);
  if (f.lesson?.klass) {
    const klass = mk("span", "famklass");
    klass.textContent = f.lesson.klass;
    who.appendChild(klass);
  }

  const op = mk("span", "famcell");
  if (f.lesson?.formula) {
    const b = mk("b", "famop");
    b.textContent = f.lesson.formula;
    op.appendChild(b);
    if (f.lesson.formulaNote) {
      const note = mk("span", "famnote");
      note.textContent = f.lesson.formulaNote;
      op.appendChild(note);
    }
  }

  // No full stop, the column's rule: nothing in this track ends in one, because
  // they're answers to a heading, not sentences.
  const what = mk("span", "famwhat");
  what.textContent = f.lesson?.oneLiner ?? "";

  // DOM order is column order (cells auto-placed), so this append IS the layout.
  const cells = [who, op, what];
  if (extra) cells.splice(at, 0, extra);
  head.append(...cells);
  return head;
}

// A pedal. `href` decides the element: given one the whole row is the link (one
// thing to read, one thing to click); withheld it's a plain div. `thumb` is the
// SHAPE cell (thumb.js builds it; this only makes a hole for it). `changes`/`youHear`
// are the two claims (see claims()), one cell each — the same pair the bench shows,
// so a pedal reads the same on both pages.
export function pedalRow(p, href, thumb, { changes, youHear }) {
  const a = mk(href ? "a" : "div", "catrow");
  if (href) {
    a.href = href;
    a.dataset.pedal = p.id;
  }

  const ped = mk("span", "catped");
  const label = mk("span", "catlabel");
  label.textContent = p.label;
  ped.appendChild(label);
  // the aliases the picker searches, shown rather than only searched — on a page
  // whose thesis is that the pedal you know is an instance of a mechanism, the
  // alias ("reverb" under delay) IS the lesson
  if (p.search?.length) {
    const alias = mk("span", "catalias");
    alias.textContent = p.search.join(" · ");
    ped.appendChild(alias);
  }

  // the formula over its gloss — the same two elements the band builds from
  // `formula`/`formulaNote`, so the column reads general-then-instance. Stacked,
  // not inline: the formulas are ragged and an inline gloss would start at a
  // different place on every row.
  const op = mk("span", "catcell");
  const tech = mk("code", "catop");
  tech.textContent = p.tech;
  op.appendChild(tech);
  if (p.techNote) {
    const note = mk("span", "catnote");
    note.textContent = p.techNote;
    op.appendChild(note);
  }

  // data-col names the claim for the stacked phone layout, where the .cathead that
  // labels these two columns is gone and the pair would otherwise read as two loose
  // sentences (CSS renders it as an inline header — see the max-width block)
  const chg = mk("span", "catwhat");
  chg.textContent = changes;
  chg.dataset.col = "changes";
  const you = mk("span", "catwhat");
  you.textContent = youHear;
  you.dataset.col = "you hear";

  // the thumbnail goes against the formula it draws (see headRow); DOM order is
  // column order, so this append IS the layout
  a.append(ped, op, ...(thumb ? [thumb] : []), chg, you);
  return a;
}

export function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
