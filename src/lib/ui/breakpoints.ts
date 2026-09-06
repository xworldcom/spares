/** Wide layout: side quote rail. Height is not part of this — laptops still qualify. */
export const DESKTOP_MQ = "(min-width: 1024px)";

export function isDesktopStage() {
  return typeof window !== "undefined" && window.matchMedia(DESKTOP_MQ).matches;
}
