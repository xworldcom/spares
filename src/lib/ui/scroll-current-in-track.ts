export function scrollCurrentInTrack(track: HTMLElement | null) {
  const current = track?.querySelector<HTMLElement>('[data-state="current"]');
  if (!track || !current) {
    return;
  }
  const stepEl =
    current.classList.contains("quote-progress-step")
      ? current
      : current.closest<HTMLElement>(".quote-progress-step");
  if (!stepEl) {
    return;
  }
  const steps = track.querySelectorAll<HTMLElement>(".quote-progress-step");
  const index = [...steps].indexOf(stepEl);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (index <= 0) {
    track.scrollTo({ left: 0, behavior: reduce ? "auto" : "auto" });
    return;
  }

  const left =
    stepEl.offsetLeft + stepEl.offsetWidth / 2 - track.clientWidth / 2;
  const maxLeft = Math.max(0, track.scrollWidth - track.clientWidth);
  const nextLeft = Math.min(maxLeft, Math.max(0, left));
  const first = steps[0];
  const firstLeft = first?.offsetLeft ?? 0;
  const clamped =
    first && nextLeft > firstLeft ? Math.max(firstLeft, nextLeft) : nextLeft;

  track.scrollTo({
    left: clamped,
    behavior: reduce ? "auto" : "smooth",
  });
}
