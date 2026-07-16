// The three-column reading of the catalog — column names, a family, a pedal —
// built here rather than on either page, because both pages want it and they
// want it identical. The catalog page stacks every family's band over its rows;
// the bench renders exactly two, the family that's up and the pedal you picked.
// Same three columns, same order, same geometry (see .cathead/.famhead/.catrow
// in the stylesheet, which is one rule for all three).
//
// What the columns are for: a family has a value for each of them — navLabel is
// a name like a pedal's, `formula` is the general form its pedals' `tech` are
// instances of, and `oneLiner` is its `whatChanges`. So the band isn't a heading
// that happens to sit above a table, it's the generic row, and every row under
// it is that row with the blanks filled in. Aligned into the columns, that reads
// straight down: y[n] = f(x[n]), then tanh(drive·x + bias). Which is the whole
// thesis of the site, and it costs no prose at all.

// Named once, above the rows, rather than over every family: the three names are
// the same three names each time, and the bands below are themselves worked
// examples of the columns.
//
// `extra` is the bench's fourth column, which this page doesn't have — the way
// out to the mounted pedal's family. It's a parameter rather than a fourth name
// in the list because the two pages genuinely differ here: over there the family
// is the band every row hangs off, so a column pointing at it would be pointing
// at itself. Naming that column "family" is what lets the cell under it be a
// bare "clipping →" — the label carries the noun, so the link doesn't have to
// say it twice. Which is the whole reason the column exists: MODULATION under a
// header reading PEDAL is what made a reader ask what modulation was.
export function headRow(extra) {
  const r = mk("div", "cathead");
  const names = ["pedal", "operation", "what changes"];
  for (const t of extra ? [...names, extra] : names) {
    const c = mk("span");
    c.textContent = t;
    r.appendChild(c);
  }
  return r;
}

// A family, in the SAME three columns as its pedals.
//
// Worth knowing when you read the delay family: its formula and all three of its
// pedals' tech are one identical string, because delay's pedals differ only in
// where their knobs start. The column repeating itself there isn't a bug to
// style around — it's the honest answer to "what's the difference between echo
// and slapback", and it's visible precisely because the column lines up.
export function famRow(f) {
  const head = mk("h2", "famhead");

  const who = mk("span", "famcell");
  const name = mk("span", "famname");
  name.textContent = f.navLabel;
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

  const what = mk("span", "famwhat");
  what.textContent = f.lesson?.oneLiner ?? "";

  head.append(who, op, what);
  return head;
}

// A pedal. `href` is what decides the element: given one the whole row is the
// link, not just the name in it — the row is one thing to read and one thing to
// click, and a two-word target inside a wide row is a target you have to aim at.
// Withheld, it's a plain div, which is the bench's case: the row there describes
// the pedal already on the bench, and a link to where you are is a link that
// lies about being a way out.
export function pedalRow(p, href) {
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

  const op = mk("code", "catop");
  op.textContent = p.tech;
  const what = mk("span", "catwhat");
  what.textContent = p.whatChanges;

  a.append(ped, op, what);
  return a;
}

export function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
