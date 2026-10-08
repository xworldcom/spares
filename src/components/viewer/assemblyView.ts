export type Vec3 = { x: number; y: number; z: number };

export function assemblyCentroid(centers: readonly Vec3[]): Vec3 {
  if (centers.length === 0) {
    return { x: 0, y: 0, z: 0 };
  }
  let x = 0;
  let y = 0;
  let z = 0;
  for (const point of centers) {
    x += point.x;
    y += point.y;
    z += point.z;
  }
  const n = centers.length;
  return { x: x / n, y: y / n, z: z / n };
}

export function explodeTravel(centers: readonly Vec3[]): number {
  if (centers.length === 0) {
    return 0.4;
  }
  const centroid = assemblyCentroid(centers);
  let maxR = 0;
  for (const point of centers) {
    maxR = Math.max(
      maxR,
      Math.hypot(point.x - centroid.x, point.y - centroid.y, point.z - centroid.z),
    );
  }
  return Math.max(maxR * 1.2, 0.35);
}

/** World-space offset from the assembly centroid. amount 0 = assembled. */
export function explodeTranslation(
  meshCenter: Vec3,
  centroid: Vec3,
  amount: number,
  travel: number,
): Vec3 {
  if (amount <= 0 || travel <= 0) {
    return { x: 0, y: 0, z: 0 };
  }
  const dx = meshCenter.x - centroid.x;
  const dy = meshCenter.y - centroid.y;
  const dz = meshCenter.z - centroid.z;
  const length = Math.hypot(dx, dy, dz);
  if (length < 1e-8) {
    return { x: 0, y: amount * travel * 0.2, z: 0 };
  }
  const scale = (amount * travel) / length;
  return { x: dx * scale, y: dy * scale, z: dz * scale };
}

export const ISOLATE_OPACITY = 0.12;

export function isGhosted(
  partId: string | null,
  isolatedId: string | null,
): boolean {
  return isolatedId != null && partId !== isolatedId;
}

export function meshIsolateState(
  partId: string | null,
  isolatedId: string | null,
  hiddenIds: ReadonlySet<string>,
): { hidden: boolean; ghosted: boolean; pickable: boolean } {
  const hidden = partId != null && hiddenIds.has(partId);
  const ghosted = !hidden && isGhosted(partId, isolatedId);
  return { hidden, ghosted, pickable: !hidden && !ghosted };
}

/** Part visibility is filtered when anything is hidden or one part is isolated. */
export function viewerPartsFiltered(
  hiddenIds: readonly string[],
  isolatedId: string | null,
): boolean {
  return hiddenIds.length > 0 || isolatedId != null;
}

/** Chrome "Show all" and in-sheet exit use the same filter signal. */
export function viewerNeedsShowAll(
  hiddenIds: readonly string[],
  isolatedId: string | null = null,
): boolean {
  return viewerPartsFiltered(hiddenIds, isolatedId);
}
