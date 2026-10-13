/** Stable key for hide/isolate assembly changes that should refit the camera. */
export function buildViewerAssemblyKey(
  hiddenIds: readonly string[],
  isolatedId: string | null,
): string {
  return [hiddenIds.join("\0"), isolatedId ?? ""].join("|");
}

/**
 * MachineWorkspace bumps `fitKey` on explode slider pointer-up (`fitExploded`) to refit
 * bounds, but explode should preserve orbit (see viewer README). Drop those bumps when
 * they land soon after an explode amount change (slider drag / iOS pointer-up).
 */
export function shouldForwardViewerFitKey(
  msSinceExplodeChange: number,
  windowMs = 400,
): boolean {
  return msSinceExplodeChange >= windowMs;
}
