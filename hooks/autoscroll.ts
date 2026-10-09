// Injected into the Reels tab. Reels loop instead of firing 'ended', so "finished" = playhead near the end.
export const AUTOSCROLL_JS = `(() => {
  if (window.__reelScroll) return;
  const done = new WeakSet();
  window.__reelScroll = setInterval(() => {
    const vids = [...document.querySelectorAll('video')];
    const v = vids.find(v => !v.paused && v.duration && !done.has(v));
    if (!v || v.currentTime < v.duration - 0.35) return;
    done.add(v);
    vids[vids.indexOf(v) + 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 250);
})()`
