export function scrollCurrentInTrack(track: HTMLElement | null) {
  const current = track?.querySelector<HTMLElement>('[data-state="current"]');
  if (!track || !current) {
    return;
  }
  const left = current.offsetLeft + current.offsetWidth / 2 - track.clientWidth / 2;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  track.scrollTo({
    left: Math.max(0, left),
    behavior: reduce ? "auto" : "smooth",
  });
}
