/* ============================================================
   FLOTZY — audio/manifest.js
   Optional overrides for the synthesised specimen audio.

   Every sound on the site is generated in-browser by
   assets/js/synth.js. If you would rather use a real recording
   for a given class, drop the file in this folder and map its
   specimen id here. Anything listed is played back instead of
   being synthesised; anything absent falls through to the synth.
   A failed fetch or decode also falls back to the synth, so a
   broken entry degrades quietly rather than breaking the page.

   Ids are the keys of Flotzy.PROFILES:
     sputterer, silent, trumpet, squeaker, ripper, machinegun,
     bubbler, ghost, wet, crescendo, sneezefart, chaircreak,
     marathon, pop, afterburner

   To activate, add this line to any page that plays audio,
   BEFORE assets/js/synth.js:
     <script src="audio/manifest.js"></script>
   ============================================================ */

window.FLOTZY_AUDIO = {
  // trumpet:  'audio/fl-003-trumpet.mp3',
  // squeaker: 'audio/fl-004-squeaker.mp3',
};
