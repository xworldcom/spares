let dingContext: AudioContext | null = null;

export type QuoteBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type QuoteTargetKind = "badge" | "count" | "handle";

export const QUOTE_BADGE_BOUNCE_MS = 420;
export const QUOTE_BADGE_BOUNCE_REDUCED_MS = 280;

/** Scale on the filled Quote chip badge. */
export const QUOTE_BADGE_BOUNCE_KEYFRAMES = [
  { transform: "scale(1)" },
  { transform: "scale(1.28)", offset: 0.35 },
  { transform: "scale(0.94)", offset: 0.65 },
  { transform: "scale(1)" },
] as const;

/** Peek/dock "N items" copy: scale plus a brief accent highlight. */
export const QUOTE_COUNT_BOUNCE_KEYFRAMES = [
  { transform: "scale(1)", color: "#4b4f57" },
  { transform: "scale(1.12)", color: "#0a84ff", offset: 0.35 },
  { transform: "scale(0.98)", color: "#0a84ff", offset: 0.65 },
  { transform: "scale(1)", color: "#4b4f57" },
] as const;

/** No motion: a brief brightness tick so the count still confirms. */
export const QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES = [
  { filter: "brightness(1)" },
  { filter: "brightness(1.16)", offset: 0.4 },
  { filter: "brightness(1)" },
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

export type PaintStyle = {
  display: string;
  visibility: string;
  opacity: number;
};

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

/** Hidden if any ancestor (or self) is display:none, visibility:hidden, or opacity 0. */
export function isPaintedStyleChain(chain: readonly PaintStyle[]): boolean {
  for (const style of chain) {
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    if (!(style.opacity > 0)) {
      return false;
    }
  }
  return true;
}

export function collectPaintChain(el: HTMLElement): PaintStyle[] {
  const chain: PaintStyle[] = [];
  let node: HTMLElement | null = el;
  while (node) {
    const style = getComputedStyle(node);
    chain.push({
      display: style.display,
      visibility: style.visibility,
      opacity: Number.parseFloat(style.opacity),
    });
    if (node === node.ownerDocument?.documentElement) {
      break;
    }
    node = node.parentElement;
  }
  return chain;
}

/**
 * Peek/dock "N items" first — that is what Kevin sees when the tray is open.
 * Chrome Quote chip badge next. Handle last.
 */
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

export function pickQuoteAddTarget<
  T extends { kind: string; box: QuoteBox; visible?: boolean },
>(
  targets: readonly T[],
  viewport: { width: number; height: number },
): T | null {
  let best: T | null = null;
  let bestRank = 99;
  for (const target of targets) {
    if (target.visible === false) {
      continue;
    }
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
      visible: isPaintedStyleChain(collectPaintChain(el)),
    })),
    viewport,
  );
  return picked?.el ?? null;
}

export function bounceVisibleQuoteCount() {
  const target = queryQuoteAddTarget();
  if (target) {
    bounceQuoteCount(target);
  }
}

/** Bounce the real quote-count node. WAAPI first; CSS class if animate() is missing. */
export function bounceQuoteCount(
  el: HTMLElement,
  motion?: { matches: boolean } | null,
): void {
  if (typeof el.animate === "function") {
    const reduced = prefersReducedMotion(motion ?? defaultReducedMotionMedia());
    const motionFrames = reduced
      ? QUOTE_BADGE_BOUNCE_REDUCED_KEYFRAMES
      : el.dataset.quoteTarget === "count"
        ? QUOTE_COUNT_BOUNCE_KEYFRAMES
        : QUOTE_BADGE_BOUNCE_KEYFRAMES;
    el.animate([...motionFrames], {
      duration: reduced ? QUOTE_BADGE_BOUNCE_REDUCED_MS : QUOTE_BADGE_BOUNCE_MS,
      easing: "ease-out",
    });
    return;
  }
  el.classList.remove("quote-badge-bounce");
  const stop = (event: AnimationEvent) => {
    if (event.target !== el) {
      return;
    }
    el.classList.remove("quote-badge-bounce");
    el.removeEventListener("animationend", stop);
  };
  el.addEventListener("animationend", stop);
  el.classList.add("quote-badge-bounce");
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

/** Haptic now. Bounce is scheduled by the workspace after the new count commits. */
export function playQuoteAddMotion() {
  quoteAddFeedback();
  bounceVisibleQuoteCount();
}
