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
// The rows themselves are rows.js, shared with the bench, which renders the same
// band-over-row pair for whatever's mounted. All this file does is stack every
// family's — which is the only thing that makes it a catalog rather than an
// entry.
//
// mountCatalog(host, families) — `families` are the view modules the demo uses
// ({id, navLabel, pedals, lesson}).

import { famRow, headRow, mk, pedalRow } from "./rows.js";
import { drawThumb, thumbCanvas } from "./thumb.js";

export function mountCatalog(host, families) {
  host.innerHTML = "";
  // The fourth column: every row's own curve. See thumb.js for why the page
  // draws one at all, and rows.js for why the fourth column is a parameter.
  host.appendChild(headRow("shape", 2));
  // Built and drawn in two passes, and it isn't a style choice: a canvas takes
  // its size from its CSS box and has to ASK for it, so nothing can be drawn
  // into one until the grid it sits in exists and has been laid out. Pass one
  // puts the rows in the document; pass two, below, draws into the holes.
  const pending = [];
  for (const f of families) host.appendChild(section(f, pending));
  const paint = () => {
    for (const { cv, view, pedal } of pending) drawThumb(cv, view, pedal);
  };
  paint();
  // Redrawn on resize because the columns are fractional: a canvas keeps its
  // bitmap when its box changes, so a page that only ever painted once would
  // show every curve stretched to whatever width it was born at. Debounced onto
  // the frame — a drag fires this continuously, and each paint is nine curves.
  let queued = false;
  addEventListener("resize", () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      paint();
    });
  });
}

// One family = its own row, then its pedals under it.
function section(f, pending) {
  const sec = mk("section", "fam");
  // The id is what the bench's "modulation family →" link aims at. The family's
  // own id, so the link can be built from the view alone (see setPedal) without
  // this page publishing a separate list of anchor names to keep in sync.
  sec.id = f.id;
  sec.appendChild(famRow(f));
  const tbl = mk("div", "cat");
  for (const p of f.pedals) {
    // The view draws the pedal, so the row needs both — it's the family that
    // knows a clipping pedal is a curve and a delay is a tap train, and the
    // pedal that knows which one it is.
    const cv = thumbCanvas();
    pending.push({ cv, view: f, pedal: p });
    tbl.appendChild(pedalRow(p, `./?pedal=${encodeURIComponent(p.id)}`, cv));
  }
  sec.appendChild(tbl);
  return sec;
}
