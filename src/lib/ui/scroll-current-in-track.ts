export function scrollCurrentInTrack(track: HTMLElement | null) {
  const current = track?.querySelector<HTMLElement>('[data-state="current"]');
  if (!track || !current) {
    return;
  }
  const steps = track.querySelectorAll<HTMLElement>(".quote-progress-step");
  const isFirst = steps.length > 0 && steps[0] === current;
  const left = isFirst
    ? 0
    : current.offsetLeft + current.offsetWidth / 2 - track.clientWidth / 2;
  const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  track.scrollTo({
    left: Math.min(maxLeft, Math.max(0, left)),
    behavior: reduce ? "auto" : "smooth",
  });
}
