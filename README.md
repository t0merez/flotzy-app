# Flotzy

**The Journal of Applied Flatology.** A static, five-page research journal about farts,
played completely straight — abstracts, numbered sections, figure captions, a dichotomous
field key, and a references list. *Flotz* (<span lang="he">פלוץ</span>) is Hebrew for fart.

Everything runs client-side. No build step, no dependencies, no network requests.
Drop it on GitHub Pages and it works.

## Pages

| Page | What it is |
| --- | --- |
| [`index.html`](index.html) | Part I — introduction: gas composition, physiology, the 1% that smells, acoustic principles |
| [`types.html`](types.html) | Part II — typology: 15 classes with binomial names, measured parameters, waveforms and audio |
| [`foods.html`](foods.html) | Part III — substrates: 42 foods ranked on the Flatulence Index, sortable and filterable |
| [`science.html`](science.html) | Part IV — an interactive particle simulation across 9 media in 5 rendering modes |
| [`amplification.html`](amplification.html) | Part IV(a) — 11 stackable amplification techniques and a Helmholtz cavity calculator |

## The interesting bits

**All audio is synthesised in the browser.** [`assets/js/synth.js`](assets/js/synth.js)
models the anal sphincter as a lip-reed valve — the same oscillator class as a trumpeter's
embouchure — using a sawtooth driven by a damped random-walk pitch curve, a band-passed
turbulent-noise layer, an asymmetric waveshaper, and a resonant lowpass. The parameters
printed beside each specimen in the typology *are* the synth parameters. No audio files
ship with the site; see [`audio/README.md`](audio/README.md) to drop in real recordings
instead.

**The simulator is a real particle model.** [`assets/js/sim.js`](assets/js/sim.js) advects
gas parcels under Stokes drag, temperature-dependent buoyancy and stochastic diffusion,
with coefficients per medium (air, water, honey, vacuum, upholstery, microgravity, liquid
nitrogen, sulfur hexafluoride, helium). Reynolds number and flow regime are computed live.
Each medium also shifts the audio by its speed of sound, so the same emission returns an
octave and a half higher in helium and an octave and a half lower in SF₆.

**Five rendering modes** over the same simulation state: visible plume, thermal/IR
(iron palette), acoustic wavefronts (slow-motion, real arrival times in the readouts),
schlieren, and a concentration field.

## Design

A print-journal system in [`assets/css/paper.css`](assets/css/paper.css): aged-paper
background with an SVG grain overlay, brown ink, CSS-counter section numbering and figure
captions, Tufte-style margin notes on wide screens, and a full dark mode via
`prefers-color-scheme`. It also prints properly, which felt necessary.

## Running it

It's static HTML — open `index.html`, or serve the folder:

```sh
python -m http.server 8000
```

## GitHub Pages

Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)`. Done — all paths
are relative and `.nojekyll` is present so nothing gets preprocessed.

## Accuracy

The gastroenterology is broadly real and the cited papers exist — Tomlin et al. (*Gut*,
1991) on volumes, Suarez et al. (*Gut*, 1998) on which compounds actually smell. The
acoustics are real physics applied with a straight face to an unsuitable subject. The
taxonomy, the Flatulence Index and the decibel figures are invented. Nothing here is
medical advice.
