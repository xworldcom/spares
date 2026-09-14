/** Append-only chat merge: keep stable object refs, only extend when possible. */
export function mergeActivitiesById<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
): { activities: T[]; changed: boolean } {
  if (current.length === incoming.length) {
    const sameOrder = current.every((row, index) => row.id === incoming[index]?.id);
    if (sameOrder) {
      return { activities: current as T[], changed: false };
    }
  }

  if (
    incoming.length >= current.length &&
    current.every((row, index) => row.id === incoming[index]?.id)
  ) {
    if (incoming.length === current.length) {
      return { activities: current as T[], changed: false };
    }
    return {
      activities: [...current, ...incoming.slice(current.length)] as T[],
      changed: true,
    };
  }

  const merged = incoming.map((row, index) => {
    const previous = current[index];
    return previous && previous.id === row.id ? previous : row;
  });
  const changed =
    merged.length !== current.length || merged.some((row, index) => row !== current[index]);
  return { activities: merged, changed };
}
