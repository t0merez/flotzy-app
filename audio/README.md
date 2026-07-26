# audio/

**Real recordings.** Thirteen `.mp3` files, one per taxonomic class, ~285 KB total.
Nothing here is synthesised.

## Where they came from

All sources are freely licensed audio from [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:Flatulence).
The largest contributor is a 4 min 50 s archive compilation released by the Finnish
public broadcaster YLE ([`425594 ylearkisto farts-pieruja.wav`](https://commons.wikimedia.org/wiki/File:425594_ylearkisto_farts-pieruja.wav),
CC BY 3.0, uploader *Zache*), described simply as *"different kind of real farts"*.

Seven files that turned up in the same searches were **excluded** — they are dictionary
pronunciations of the *word* rather than recordings of the act. `Sv-fart.ogg`, for instance,
is a Swedish speaker saying *fart*, which in Swedish means **speed**.

## How each class got its recording

1. Every source was decoded to mono 48 kHz. Files over 5.5 s were split into discrete
   events by energy gating (−30 dB threshold, 0.22 s minimum gap), yielding **83 candidate
   specimens** from 13 source files.
2. Each candidate was measured: duration, fundamental frequency (autocorrelation with
   interior peak-picking after a 1.2 kHz low-pass), spectral centroid, spectral flatness,
   burst count and regularity, attack time, crest factor, voiced fraction and pitch contour.
3. Candidates were scored against the criteria in the site's own
   [dichotomous key](../types.html#key), and a **global one-to-one assignment**
   (Hungarian algorithm) picked the best overall mapping — so the taxonomy did the
   classifying, not anyone's ears.
4. Winners were peak-normalised to −1.5 dBFS, de-clicked with 8 ms fades, and encoded to
   112 kbps mono MP3.

**Thirteen of fifteen classes found a credible match.** Two did not:

| Class | Why there is no file |
| --- | --- |
| `silent` — FL-002 Silent But Deadly | A silent emission produces no acoustic signal. There is nothing to record. |
| `ghost` — FL-008 The Ghost | Defined by operator kinematics and odour; a microphone detects neither. |

Their play controls are inert and their waveforms render as `NO SIGNAL`. This is deliberate —
faking them would undercut the one thing the site is careful about.

## Files

- `*.mp3` — the specimen library, keyed by class id
- `manifest.js` — maps class id → file path, with per-file attribution in comments
- `waveforms.js` — peak envelopes (150 points, 0–100) measured at export time, drawn on the
  typology page so the on-screen waveform is the shape of the actual recording

Both `.js` files are plain globals, loaded before [`../assets/js/player.js`](../assets/js/player.js).
No fetch of JSON, so the site works from `file://` as well as over HTTP.

## Licensing

Each recording keeps its original licence — chiefly **CC BY 3.0/4.0** and **CC BY-SA 3.0/4.0**,
plus one public-domain item. Trimming, normalising and re-encoding make these derivative works,
so if you reuse them: carry the attribution and honour ShareAlike where it applies.
Full per-class attribution is on the site at [types.html#provenance](../types.html#provenance)
and in the comments of `manifest.js`.

Everything else in this repository is public domain.

## Replacing a recording

Drop a file in this folder and point the class at it in `manifest.js`:

```js
window.FLOTZY_AUDIO = {
  trumpet: 'audio/my-better-trumpet.mp3',
};
```

Any class listed plays its file; any class omitted is silent. If a file 404s or fails to
decode, that class simply goes quiet rather than breaking the page. If you change a file,
regenerate its entry in `waveforms.js` too, or the drawn waveform will describe the old one.
