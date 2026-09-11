import { SPARES_TONES } from "./contrast.ts";

let dingContext: AudioContext | null = null;

export type QuoteBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type QuoteTargetKind = "badge" | "count" | "handle";

export const QUOTE_BADGE_BOUNCE_MS = 420;
export const QUOTE_COUNT_BOUNCE_MS = 480;
export const QUOTE_BADGE_BOUNCE_REDUCED_MS = 280;
export const QUOTE_COUNT_HIGHLIGHT = "rgba(10, 132, 255, 0.36)";
export const QUOTE_COUNT_HIGHLIGHT_MID = "rgba(10, 132, 255, 0.18)";
export const QUOTE_COUNT_HIGHLIGHT_OFF = "rgba(10, 132, 255, 0)";

/** Scale on the filled Quote chip badge. */
export const QUOTE_BADGE_BOUNCE_KEYFRAMES = [
  { transform: "scale(1)" },
  { transform: "scale(1.28)", offset: 0.35 },
  { transform: "scale(0.94)", offset: 0.65 },
  { transform: "scale(1)" },
] as const;

/** Peek/dock "N items" copy: strong scale plus an accent pill. */
export const QUOTE_COUNT_BOUNCE_KEYFRAMES = [
  {
    transform: "scale(1)",
    backgroundColor: QUOTE_COUNT_HIGHLIGHT_OFF,
    color: SPARES_TONES.muted,
  },
  {
    transform: "scale(1.28)",
    backgroundColor: QUOTE_COUNT_HIGHLIGHT,
    color: "#ffffff",
    offset: 0.32,
  },
  {
    transform: "scale(0.96)",
    backgroundColor: QUOTE_COUNT_HIGHLIGHT_MID,
    color: "#ffffff",
    offset: 0.62,
  },
  {
    transform: "scale(1)",
    backgroundColor: QUOTE_COUNT_HIGHLIGHT_OFF,
    color: SPARES_TONES.muted,
  },
] as const;

/** No motion: a brief brightness + background tick so the count still confirms. */
export const QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES = [
  { filter: "brightness(1)", backgroundColor: QUOTE_COUNT_HIGHLIGHT_OFF },
  {
    filter: "brightness(1.28)",
    backgroundColor: QUOTE_COUNT_HIGHLIGHT,
    offset: 0.4,
  },
  { filter: "brightness(1)", backgroundColor: QUOTE_COUNT_HIGHLIGHT_OFF },
] as const;

export function prefersReducedMotion(
  media: { matches: boolean } | null | undefined = defaultReducedMotionMedia(),
): boolean {
  return Boolean(media?.matches);
}

function defaultReducedMotionMedia(): { matches: boolean } | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)");
}

export function boxOnscreen(
  box: QuoteBox,
  viewport: { width: number; height: number },
): boolean {
  if (box.width < 2 || box.height < 2) {
    return false;
  }
  return (
    box.left < viewport.width &&
    box.top < viewport.height &&
    box.left + box.width > 0 &&
    box.top + box.height > 0
  );
}

export function rankQuoteTarget(kind: string | undefined): number {
  if (kind === "count") {
    return 0;
  }
  if (kind === "badge") {
    return 1;
  }
  if (kind === "handle") {
    return 2;
  }
  return 3;
}

export function pickQuoteAddTarget<T extends { kind: string; box: QuoteBox }>(
  targets: readonly T[],
  viewport: { width: number; height: number },
): T | null {
  let best: T | null = null;
  let bestRank = 99;
  for (const target of targets) {
    if (!boxOnscreen(target.box, viewport)) {
      continue;
    }
    const rank = rankQuoteTarget(target.kind);
    if (rank < bestRank) {
      best = target;
      bestRank = rank;
    }
  }
  return best;
}

export function queryQuoteAddTarget(
  root: ParentNode | null | undefined = typeof document === "undefined" ? null : document,
  viewport: { width: number; height: number } | null = typeof window === "undefined"
    ? null
    : { width: window.innerWidth, height: window.innerHeight },
): HTMLElement | null {
  if (!root || !viewport) {
    return null;
  }
  const nodes = [...root.querySelectorAll<HTMLElement>("[data-quote-target]")];
  const picked = pickQuoteAddTarget(
    nodes.map((el) => ({
      el,
      kind: el.dataset.quoteTarget ?? "",
      box: el.getBoundingClientRect(),
    })),
    viewport,
  );
  return picked?.el ?? null;
}

export function afterNextPaint(run: () => void): void {
  if (typeof requestAnimationFrame !== "function") {
    run();
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(run);
  });
}

/** Bounce the real quote-count node. WAAPI first; CSS class if animate() is missing. */
export function bounceQuoteCount(
  el: HTMLElement,
  motion?: { matches: boolean } | null,
): void {
  const isCount = el.dataset?.quoteTarget === "count";
  if (typeof el.getAnimations === "function") {
    for (const running of el.getAnimations()) {
      running.cancel();
    }
  }
  if (typeof el.animate === "function") {
    const reduced = prefersReducedMotion(motion ?? defaultReducedMotionMedia());
    const motionFrames = reduced
      ? QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES
      : isCount
        ? QUOTE_COUNT_BOUNCE_KEYFRAMES
        : QUOTE_BADGE_BOUNCE_KEYFRAMES;
    el.animate([...motionFrames], {
      duration: reduced
        ? QUOTE_BADGE_BOUNCE_REDUCED_MS
        : isCount
          ? QUOTE_COUNT_BOUNCE_MS
          : QUOTE_BADGE_BOUNCE_MS,
      easing: "ease-out",
    });
    return;
  }
  const cssClass = isCount ? "quote-count-tick" : "quote-badge-bounce";
  el.classList.remove("quote-badge-bounce", "quote-count-tick");
  const stop = (event: AnimationEvent) => {
    if (event.target !== el) {
      return;
    }
    el.classList.remove("quote-badge-bounce", "quote-count-tick");
    el.removeEventListener("animationend", stop);
  };
  el.addEventListener("animationend", stop);
  el.classList.add(cssClass);
}

function softDing() {
  if (typeof window === "undefined") {
    return;
  }
  if (prefersReducedMotion()) {
    return;
  }
  try {
    dingContext ??= new AudioContext();
    const ctx = dingContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.04, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch {
    // Audio unavailable or blocked — skip quietly.
  }
}

/** Subtle confirmation when a part is added to the quote. */
export function quoteAddFeedback() {
  if (typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate(12);
  }
  softDing();
}

/** Haptic/ding now; bounce the painted count (or badge) after commit. */
export function playQuoteAddMotion() {
  quoteAddFeedback();
  afterNextPaint(() => {
    const target = queryQuoteAddTarget();
    if (target) {
      bounceQuoteCount(target);
    }
  });
}
