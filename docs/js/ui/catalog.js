// The catalog page's only view: every pedal on one lit page, no rig, no audio,
// rendered from the same view modules the demo mounts — so this list and the
// picker can't go stale against each other. The rows are rows.js, shared with the
// bench; all this file does is stack every family's band-over-rows.
//
// mountCatalog(host, families) — `families` are the demo's view modules
// ({id, navLabel, pedals, lesson}).

import { claims, famRow, headRow, mk, pedalRow } from "./rows.js";
import { drawThumb, thumbCanvas } from "./thumb.js";

export function mountCatalog(host, families) {
  host.innerHTML = "";
  // The SHAPE column: every row's own curve (see thumb.js). "transform shape",
  // not "shape", because the PEDAL cell already holds a shape (the toy pedal) —
  // this names the column as the picture of the TRANSFORM beside it.
  host.appendChild(headRow("transform shape", 2));
  // Two passes, of necessity: a canvas can't be drawn into until its grid box has
  // been laid out. Pass one puts the rows in the document; pass two draws.
  const pending = [];
  for (const f of families) host.appendChild(section(f, pending));
  const paint = () => {
    for (const { cv, view, pedal } of pending) drawThumb(cv, view, pedal);
  };
  paint();
  // Redrawn on resize: the columns are fractional and a canvas keeps its bitmap
  // when its box changes, so a paint-once page would stretch every curve.
  // Debounced onto the frame — each paint is nine curves.
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
  // the family's own id, what the bench's "modulation family →" link aims at, so
  // the link can be built from the view alone (see mount)
  sec.id = f.id;
  // No href: the band is already on the page it would link to. The empty cell holds
  // the SHAPE column's place without filling it — see famRow.
  sec.appendChild(famRow(f, { extra: mk("span"), at: 2 }));
  const tbl = mk("div", "cat");
  for (const p of f.pedals) {
    // the view knows how to draw the pedal, the pedal knows which one it is
    const cv = thumbCanvas();
    pending.push({ cv, view: f, pedal: p });
    const href = `./?pedal=${encodeURIComponent(p.id)}`;
    tbl.appendChild(pedalRow(p, href, cv, claims(f, p)));
  }
  sec.appendChild(tbl);
  return sec;
}
