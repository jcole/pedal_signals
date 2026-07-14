# pedal_signals

Interactive, browser-based demos of how guitar effects pedals reshape a signal —
built up incrementally, one idea at a time.

The first page is a **waveshaping pedal demo**: pick a source (a clean sine or a
real recorded guitar note), pick a pedal (overdrive / distortion / fuzz), and
watch the transfer curve, waveform, and spectrum update live while you hear the
dry and wet paths blend.

## Viewing locally

The page uses `fetch()` to load `guitar_clean.wav`, which browsers block on
`file://` URLs — so serve it over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000 --directory docs
```

Then open <http://localhost:8000>. `Ctrl+C` stops the server.

## Layout

```
docs/                 ← the published site (GitHub Pages source)
  index.html          ← page markup + CSS; loads the demo as an ES module
  src/
    dsp.js            ← pure DSP core: WAV parse, pedals, FFT, shape/peak-match
    demo.js           ← DOM / canvas / Web Audio glue (imports dsp.js)
  guitar_clean.wav
test/
  dsp.test.js         ← unit tests for the pure core
package.json          ← "type": module, `npm test`
```

The split keeps everything testable in `dsp.js` — plain data-in / data-out,
no DOM or Web Audio — separate from the browser-only glue in `demo.js`.

## Tests

The DSP core is covered by unit tests using Node's built-in test runner (no
dependencies to install):

```bash
npm test          # runs node --test over test/
```

## Linting

JavaScript is linted with [Biome](https://biomejs.dev/). Install dev
dependencies once with `npm install`, then:

```bash
npm run lint      # runs biome lint over docs/src/ and test/
```

Biome is configured as a linter only (formatting disabled), so it flags
correctness/style issues without restyling the code.

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
