# audio/

**This folder is empty on purpose.** Every sound on the site is *synthesised in the
browser* by [`assets/js/synth.js`](../assets/js/synth.js) from the physical parameters
printed next to each specimen — a lip-reed valve model built out of Web Audio nodes.
No recordings ship with the site, nothing is fetched from a CDN, and nothing is uploaded.

## Why synthesis rather than files

- **Every specimen already sounds different**, because the parameters that describe it
  in the typology (`f0`, jitter, flutter, brightness, burst count, envelope shape) are
  literally the parameters that drive the synth. Change the table, change the sound.
- **Zero payload.** Fifteen specimens cost nothing to download.
- **Licensing.** Freely licensed recordings of this particular subject are scarce and
  usually of unclear provenance. Synthesis sidesteps it entirely.
- **The simulator needs it.** `science.html` shifts the resonances of each class by the
  speed of sound in the selected medium — helium up, sulfur hexafluoride down. That is
  only possible with a parametric source.

## Dropping in real recordings

If you find or record something better, you can override any specimen without touching
the synth:

1. Put the file here, e.g. `audio/fl-003-trumpet.mp3` (`.mp3`, `.ogg` and `.wav` all work).
2. Map it in [`manifest.js`](manifest.js):

   ```js
   window.FLOTZY_AUDIO = {
     trumpet: 'audio/fl-003-trumpet.mp3',
   };
   ```

3. Load the manifest **before** the synth on any page that plays audio
   (`index.html`, `types.html`, `science.html`, `amplification.html`):

   ```html
   <script src="audio/manifest.js"></script>
   <script src="assets/js/synth.js"></script>
   ```

Listed ids play the file; unlisted ids fall through to synthesis. If a file 404s or fails
to decode, playback **falls back to the synth automatically** — a broken entry will not
break the page.

### Valid specimen ids

`sputterer` · `silent` · `trumpet` · `squeaker` · `ripper` · `machinegun` · `bubbler` ·
`ghost` · `wet` · `crescendo` · `sneezefart` · `chaircreak` · `marathon` · `pop` ·
`afterburner`

> **Note.** The amplification stack and the medium simulator apply their filters, cavity
> resonance and reverb to whatever the source is — so real recordings still route through
> the full effects chain and still respond to the bucket.
