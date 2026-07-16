// The catalog page's only view: every pedal on one lit page, no rig, no audio.
// It renders from the same view modules the demo mounts, so what's listed here
// and what the picker offers are the same catalog in the same order — a pedal
// added to a family's file shows up in both, and neither list can go stale
// against the other.
//
// The picker answers "I know what I want, where is it"; this page answers "what
// is there, and which one do I want" — the question a picker can't take, since
// its list is one word per pedal and closes the moment you read it. So each row
// carries the two lines that actually distinguish a pedal: the operation it runs
// and what that does to the signal. Every row is a link into the demo, because
// the row is a promise the demo keeps.
//
// mountCatalog(host, families) — `families` are the view modules the demo uses
// ({id, navLabel, pedals, lesson}).

export function mountCatalog(host, families) {
  host.innerHTML = "";
  // Named once, at the top, rather than over every family: the three names are
  // the same three names each time, and the family bands below are themselves
  // worked examples of the columns — a reader who's seen one knows what the
  // second column is by the time they reach the second family.
  host.appendChild(headRow());
  for (const f of families) host.appendChild(section(f));
}

// One family = its own row, then its pedals under it.
function section(f) {
  const sec = mk("section", "fam");
  sec.appendChild(famRow(f));
  const tbl = mk("div", "cat");
  for (const p of f.pedals) tbl.appendChild(row(p));
  sec.appendChild(tbl);
  return sec;
}

// The family in the SAME three columns as its pedals, because it has a value for
// each of them: navLabel is a name like a pedal's, `formula` is the general form
// its pedals' `tech` are instances of, and `oneLiner` is its `whatChanges`. So
// this isn't a heading that happens to sit above a table — it's the generic row,
// and every row below it is that row with the blanks filled in. Aligned into the
// columns, that reads straight down the page: y[n] = f(x[n]), then tanh(drive·x
// + bias), then clip(drive·x + bias). Which is the whole thesis of the site, and
// here it costs no prose at all.
//
// Worth knowing when you read the delay family: its formula and all three of its
// pedals' tech are one identical string, because delay's pedals differ only in
// where their knobs start. The column repeating itself there isn't a bug to
// style around — it's the honest answer to "what's the difference between echo
// and slapback", and it's visible precisely because the column lines up.
function famRow(f) {
  const head = mk("h2", "famhead");

  const who = mk("span", "famcell");
  const name = mk("span", "famname");
  name.textContent = f.navLabel;
  who.appendChild(name);
  // Verbatim, exactly as the demo's header says it ("memoryless nonlinearity
  // (NL)"). It's tempting to pull the abbreviation out and set it as a tag —
  // the cheat sheet this page grew out of had a CLASS column of bare NL/LTI/LTV
  // — but nothing on this site ever says "NL" alone, so a tag would be teaching
  // a shorthand that has nowhere to be used. The phrase is what the reader is
  // meant to leave with; the parenthetical is along for the ride.
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

function headRow() {
  const r = mk("div", "cathead");
  for (const t of ["pedal", "operation", "what changes"]) {
    const c = mk("span");
    c.textContent = t;
    r.appendChild(c);
  }
  return r;
}

// The whole row is the link, not just the name in it: the row is one thing to
// read and one thing to click, and a two-word target inside a wide row is a
// target you have to aim at.
function row(p) {
  const a = mk("a", "catrow");
  a.href = `./?pedal=${encodeURIComponent(p.id)}`;
  a.dataset.pedal = p.id;

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

function mk(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
