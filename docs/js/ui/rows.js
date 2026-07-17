// The three-column reading of the catalog (column names, a family, a pedal),
// built here because both pages want it identical: same columns, same order, same
// geometry (see .cathead/.famhead/.catrow, one rule for all three). A family has
// a value for each column — navLabel, `formula` (the general form of its pedals'
// `tech`), `oneLiner` (its `whatChanges`) — so the band IS the generic row and
// every row under it is that row with the blanks filled in.

// `extra`/`at` are a fourth column only the catalog has: the pedal's own curve
// (see thumb.js), at index 3, against the formula it draws so the row reads
// operation → its picture → what it does to you. On the end instead, WHAT CHANGES
// would wedge between the formula and its drawing — worst in the delay family,
// where all three operations are the same string and the shapes are the only
// thing telling echo from slapback.
export function headRow(extra, at = 3) {
  const r = mk("div", "cathead");
  const names = ["pedal", "operation", "what changes"];
  if (extra) names.splice(at, 0, extra);
  for (const t of names) {
    const c = mk("span");
    c.textContent = t;
    r.appendChild(c);
  }
  return r;
}

// A family, in the same three columns as its pedals.
//
// `href` is the way out to the catalog — the bench's case, where this band is the
// only thing naming the family, so the name IS the link. Withheld on the catalog,
// which is the page the band would link to.
//
// `extra`/`at` are the fourth column, as in headRow. The band holds its place in
// that track without filling it (cells are auto-placed, so skipping it would print
// the one-liner under SHAPE); empty on purpose, because there's no general case of
// a curve — clipping's three pedals ARE three shapes, and what they share is the
// formula two cells left.
export function famRow(f, { href, extra, at = 3 } = {}) {
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
// thing to read, one thing to click); withheld it's a plain div, the bench's case,
// describing the pedal already mounted. `thumb` is the catalog's fourth cell —
// the pedal's curve (thumb.js builds it; this only makes a hole for it) — withheld
// on the bench, which has a live copy of the same drawing below.
export function pedalRow(p, href, thumb) {
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

  const what = mk("span", "catwhat");
  what.textContent = p.whatChanges;

  // the thumbnail goes against the formula it draws (see headRow); DOM order is
  // column order, so this append IS the layout
  a.append(ped, op, ...(thumb ? [thumb] : []), what);
  return a;
}

// The bench's top band. Unlike famRow (catalog), where the family sits IN the
// PEDAL column as a "fourth pedal", here the pedal is real: it leads its own PEDAL
// column and the family gets the second. OPERATION and WHAT CHANGES are the
// family's — the general form (abstract f; the pedal's concrete formula lives in
// the rig's deck) and the shared effect. The pedal name is a standing #benchped,
// filled by setPedal, because a pick changes it without a remount.
export function benchRow(f, { href } = {}) {
  const r = mk("div", "benchrow");

  // PEDAL: the picked instance — its name, then its own effect under it (both
  // filled by setPedal). Everything pedal-specific lives in this one column, so the
  // three that follow are all the family's, at one altitude.
  const pedCell = mk("span", "famcell");
  const pedName = mk("span", "benchped");
  pedName.id = "benchped";
  pedCell.appendChild(pedName);
  const pedWhat = mk("span", "benchwhat");
  pedWhat.id = "benchwhat";
  pedCell.appendChild(pedWhat);

  // FAMILY: the name (the way out to the catalog) over its signal class
  const famCell = mk("span", "famcell");
  const name = mk(href ? "a" : "span", "famname");
  if (href) name.href = href;
  name.textContent = f.navLabel;
  // no "family" — the FAMILY column head already says it. Just the arrow, the
  // way out to compare (kept in the text, not CSS: a margin would leave the name
  // reading "clipping→" to a screen reader or a copied selection).
  const noun = mk("span", "famnoun");
  noun.textContent = " →";
  name.appendChild(noun);
  famCell.appendChild(name);
  if (f.lesson?.klass) {
    const klass = mk("span", "famklass");
    klass.textContent = f.lesson.klass;
    famCell.appendChild(klass);
  }

  // OPERATION: the family's general form over its plain-English note
  const opCell = mk("span", "famcell");
  if (f.lesson?.formula) {
    const b = mk("b", "famop");
    b.textContent = f.lesson.formula;
    opCell.appendChild(b);
    if (f.lesson.formulaNote) {
      const note = mk("span", "famnote");
      note.textContent = f.lesson.formulaNote;
      opCell.appendChild(note);
    }
  }

  // WHAT CHANGES: the family's shared effect — the general case of the pedal's own
  // effect shown under its name. No full stop (an answer to a heading).
  const whatCell = mk("span", "famwhat");
  whatCell.textContent = f.lesson?.oneLiner ?? "";

  r.append(pedCell, famCell, opCell, whatCell);
  return r;
}

export function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
