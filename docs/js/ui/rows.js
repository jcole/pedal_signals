// The three-column reading of the catalog — column names, a family, a pedal —
// built here rather than on either page, because both pages want it and they
// want it identical. The catalog page stacks every family's band over its rows;
// the bench takes headRow alone and fills a row of standing markup with the
// pedal it has mounted (see index.html), the band having become a link out to
// this page rather than a fourth thing to read above the rig. Same columns, same
// order, same geometry (see .cathead/.famhead/.catrow in the stylesheet, which
// is one rule for all three).
//
// What the columns are for: a family has a value for each of them — navLabel is
// a name like a pedal's, `formula` is the general form its pedals' `tech` are
// instances of (down to the gloss under it: `formulaNote` is `techNote`), and
// `oneLiner` is its `whatChanges`. So the band isn't a heading
// that happens to sit above a table, it's the generic row, and every row under
// it is that row with the blanks filled in. Aligned into the columns, that reads
// straight down: y[n] = f(x[n]), then tanh(drive·x + bias). Which is the whole
// thesis of the site, and it costs no prose at all.

// Named once, above the rows, rather than over every family: the three names are
// the same three names each time, and the bands below are themselves worked
// examples of the columns.
//
// `extra` is a fourth column, and only the catalog has one now: the pedal's own
// curve (see thumb.js). A parameter rather than a fourth name in the list because
// it's one page's, not the pair's.
//
// The bench used to spend a fourth column on the way out to the family, back when
// it had no band. It has the band now — the same generic row this page hangs its
// families off — so the way out is the band's name, and the two pages are down to
// the same three columns they always claimed to share. The column was the fix for
// a missing band; the band is a better one, and it's two lines instead of a whole
// track.
//
// `at` is where the extra goes. The catalog's OPERATION SHAPE is the picture of
// the OPERATION — its header names the column beside it because the row holds a
// second shape (the pedal drawing) that a bare SHAPE would grab first. It's the
// same pairing the bench makes, where the centre panel's title is the pedal's
// formula and the curve under it is what that formula draws (see setPedal). So it
// sits against the formula, and the row reads operation → its picture → what it
// does to you: the cause, the shape of the cause, the consequence. Put it on the
// end instead and WHAT CHANGES wedges between the formula and the drawing OF that
// formula — which reads worst in the delay family, where all three operations are
// the same string and the shapes beside them are the only thing telling echo from
// slapback.
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

// A family, in the SAME three columns as its pedals.
//
// `href` is the way out to the catalog, and it's the bench's case: over there
// this band is the only thing naming the family, so the name IS the link and the
// row below it has no fourth cell to spend on one. Withheld on the catalog, where
// the band would be linking to the page it's already on.
//
// `extra` and `at` are the fourth column, named the same as headRow's and for the
// same reason: only one page has one. It's the catalog's curve thumbnails at index
// 2, and the band has to hold its place in that track without filling it — the
// cells are auto-placed, so a band that skipped it would slide its one-liner in
// and print the family's prose under a column headed SHAPE. Empty on purpose, and
// not for want of something to draw: every other cell in this row is the general
// case its pedals are instances of, and there is no general case of a curve.
// Clipping's three pedals ARE three shapes; what they have in common is the
// formula two cells left, which is why that cell has y[n] = f(x[n]) in it and this
// one has nothing.
//
// The bench passes neither, and the reason is worth keeping: it tried putting the
// family's why-these-charts sentence here, and a sentence is not a cell. Every
// other thing in this row is a general case with instances under it or an instance
// with a general case over it; prose is neither, and dressing it as a column meant
// naming that column with a question so the prose would read as an answer. It sits
// beside the table now (see index.html).
//
// Worth knowing when you read the delay family: its formula and all three of its
// pedals' tech are one identical string, because delay's pedals differ only in
// where their knobs start. The column repeating itself there isn't a bug to
// style around — it's the honest answer to "what's the difference between echo
// and slapback", and it's visible precisely because the column lines up.
export function famRow(f, { href, extra, at = 3 } = {}) {
  const head = mk("h2", "famhead");

  const who = mk("span", "famcell");
  const name = mk(href ? "a" : "span", "famname");
  if (href) name.href = href;
  name.textContent = f.navLabel;
  // The word the column header can't say for it. This name sits in the PEDAL
  // column, in the same mono caps as the pedals under it, one row above three
  // things that ARE pedals — so CLIPPING reads as a fourth one, and the band's
  // whole job is to be the general case those three are instances of. The header
  // over it has to say PEDAL for the rows' sake, so the band says the noun itself.
  //
  // The bench used to answer this with a column instead — a bare "clipping →"
  // under a header reading FAMILY — back when the band was a link and that link
  // was the family's only trace on the page. It's this row now, on both pages, so
  // both borrow this fix and the column is gone: the arrow rides on the noun, and
  // a way out that names what it's a way out OF needs no header to say it.
  // Inside the name rather than under it: the cell's line below is already spoken
  // for by the signal class, and "family" is not a second fact about clipping —
  // it's what the word CLIPPING is.
  // The space is in the text, not in the CSS. A margin would draw the gap and
  // still leave the name reading "clippingfamily" to everything that takes the
  // words rather than the pixels — a screen reader, a copied selection, a test.
  // The two words are two words; only the styling is different.
  const noun = mk("span", "famnoun");
  noun.textContent = href ? " family →" : " family";
  name.appendChild(noun);
  who.appendChild(name);
  // Verbatim, exactly as the demo's header used to say it ("memoryless
  // nonlinearity (NL)"). It's tempting to pull the abbreviation out and set it
  // as a tag — the cheat sheet this grew out of had a CLASS column of bare
  // NL/LTI/LTV — but nothing on this site ever says "NL" alone, so a tag would
  // be teaching a shorthand that has nowhere to be used. The phrase is what the
  // reader is meant to leave with; the parenthetical is along for the ride.
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

  // The family's answer to the column, and the general case of the line in every
  // row under it. No full stop, and that's the column's rule rather than this
  // cell's taste: nothing else in this track ends in one — "harmonics roll off
  // gently", "one short repeat; reads as thickening, not echo" — because they're
  // answers to a heading, not sentences. A period here made the general case a
  // sentence and left every instance of it a fragment, which is the one relation
  // these two rows exist to deny.
  const what = mk("span", "famwhat");
  what.textContent = f.lesson?.oneLiner ?? "";

  // DOM order is column order — the cells are auto-placed — so this append IS the
  // layout, exactly as it is in pedalRow. See the note above on `extra`/`at`.
  const cells = [who, op, what];
  if (extra) cells.splice(at, 0, extra);
  head.append(...cells);
  return head;
}

// A pedal. `href` is what decides the element: given one the whole row is the
// link, not just the name in it — the row is one thing to read and one thing to
// click, and a two-word target inside a wide row is a target you have to aim at.
// Withheld, it's a plain div, which is the bench's case: the row there describes
// the pedal already on the bench, and a link to where you are is a link that
// lies about being a way out.
// `thumb` is the catalog's fourth cell: the pedal's curve, drawn from its own
// `fn` (thumb.js builds it; this file only makes a hole for it). Withheld on the
// bench, which has no fourth column to put it in and a 420px live one of the same
// drawing twelve inches below.
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
  // The aliases the picker searches, shown rather than only searched. The labels
  // here are deliberately generic where a player's word for the thing is a
  // brand's ("big muff") or a mechanism they'd never guess shares this one
  // ("reverb" living under delay), so these are what most readers are scanning
  // for — and on a page whose thesis is that the pedal you know is an instance
  // of a mechanism, the alias IS the lesson.
  if (p.search?.length) {
    const alias = mk("span", "catalias");
    alias.textContent = p.search.join(" · ");
    ped.appendChild(alias);
  }

  // The formula over its gloss — the same two elements, in the same order, that
  // the band above builds from `formula` and `formulaNote`. So the column reads
  // down as general-then-instance twice over: y[n] = f(x[n]) / one sample in, one
  // sample out, then tanh(drive·x + bias) / soft knee. Stacked rather than run on
  // after the code, because these are a column: the formulas are ragged (a `tech`
  // runs from "tanh(drive·x + bias)" to one with "· asym" on the end) and an
  // inline gloss would start at a different place on every row.
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

  // The thumbnail goes between them, against the formula it draws — see headRow
  // for why. DOM order is column order here (the cells are auto-placed into the
  // grid), so this append IS the layout.
  a.append(ped, op, ...(thumb ? [thumb] : []), what);
  return a;
}

export function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
