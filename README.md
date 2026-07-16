# pedal_signals

Interactive, browser-based demos of how guitar effects pedals reshape a signal —
built up incrementally, one idea at a time.

One page, one catalog: pick a pedal by name and the page shows what that pedal
does to a signal — the transfer curve or LFO or tap train in the middle, the
waveform and spectrum on the right — while you hear the dry and wet paths blend.
The source is a clean sine or a real recorded guitar note.

The pedals are grouped into **families**, and the family is the lesson: a pedal
is an instance of a mechanism. The picker's headings are how you learn that —
you search "reverb", you land on `ambient` under DELAY.

| Family | Pedals | The idea |
| --- | --- | --- |
| clipping | overdrive, distortion, fuzz | memoryless waveshaping: `out = f(x)` |
| delay | echo, slapback, ambient | memory (LTI): `y[n] = x[n] + fb·y[n−D]` |
| modulation | tremolo, chop, warble | time-varying gain (LTV): `y[n] = x[n]·m(t)` |

## Viewing locally

The page uses `fetch()` to load `guitar_clean.wav`, which browsers block on
`file://` URLs — so serve it over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000>. `Ctrl+C` stops the server. The e2e suite
expects this same port, and will reuse a server that's already up.

A pedal is addressable: <http://localhost:8000/?pedal=warble> opens that pedal
directly. Ids are unique across the whole catalog, so a pedal names its own
family, and `?pedal=` is the entire address.

## Layout

```
docs/                   ← the published site (GitHub Pages source)
  index.html            ← page markup; wires the picker to the views
  css/styles.css        ← all styling, and the source of truth for chart colors
  js/
    dsp.js              ← pure, generic core: WAV parse, FFT/spectrum, envelope,
                          waveshaping engine, shared constants
    pedals/             ← the MODEL: what each pedal IS, and the math it runs
      base.js           ← the Pedal base class
      clipping.js       ← ClippingPedal + the CLIPPING catalog
      delay.js          ← DelayPedal + DELAYS + the delay family's own DSP
      modulation.js     ← ModulationPedal + MODULATIONS + LFO shapes
      index.js          ← aggregates the catalog (PEDALS, keyed by id)
    ui/                 ← the VIEW: DOM / canvas / Web Audio glue
      harness.js        ← effect-neutral harness; renders a view over pedals
      picker.js         ← the one pedal picker for the whole catalog
      clipping.js       ← per-family views: panels, controls, audio graph
      delay.js
      modulation.js
  guitar_clean.wav
test/                   ← unit tests for the pure core (node --test)
  dsp.test.js
  pedals.test.js
e2e/                    ← browser tests (Playwright)
  picker.spec.js
  routing.spec.js
```

Nothing under `js/dsp.js` or `js/pedals/` touches the DOM, canvas, or Web
Audio — it's all plain data-in / data-out, so it runs identically in a browser
and under `node --test`. The browser-only glue is confined to `js/ui/`.

## Tests

Unit tests use Node's built-in runner; the e2e suite uses Playwright and needs
browsers installed once (`npx playwright install`).

```bash
npm test           # node --test over test/
npm run test:e2e   # playwright test over e2e/
npm run check      # lint + test + test:e2e
```

The e2e suite runs all three engines. That isn't belt-and-braces: clicking a
`<button>` focuses it in Chrome and Firefox but not in Safari, and the picker
closes on focus leaving it — so it can work in two engines and be dead in the
third.

## Linting

JavaScript is linted with [Biome](https://biomejs.dev/). Install dev
dependencies once with `npm install`, then:

```bash
npm run lint      # biome lint over docs/js/, docs/css/, test/, e2e/
```

Biome lints JS without restyling it (the formatter is off there, so hand-set
layout survives); CSS is both linted and formatted.

## Publishing to GitHub Pages

The published site lives in [`docs/`](docs/); the repo root is free for source,
tooling, and notes that shouldn't be served.

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.**
3. Select the `main` branch and the **`/docs`** folder, then **Save**.

The site goes live at `https://<user>.github.io/<repo>/`. The `.nojekyll` file in
`docs/` tells Pages to serve the files as-is (no Jekyll processing).

## Credits

Guitar input is a clean Stratocaster A3 (bridge pickup) from
[EGFxSet](https://egfxset.github.io/) — Pedroza, Meza & Roman, ISMIR 2022.
CC BY 4.0.
</content>
