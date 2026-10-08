export function hiddenPartsStorageKey(tenantId: string, machineId: string) {
  return `spares-hidden-parts:${tenantId}:${machineId}`;
}

export function readPersistedHiddenParts(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return [
      ...new Set(
        parsed.filter((id): id is string => typeof id === "string" && id.trim() !== ""),
      ),
    ];
  } catch {
    return [];
  }
}

export function writePersistedHiddenParts(key: string, ids: readonly string[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (ids.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore quota / private mode
  }
}

/** Drop ids that no longer exist on the machine (pack replaced, part renumbered). */
export function pruneHiddenParts(
  ids: readonly string[],
  machineParts: readonly { id: string }[],
): string[] {
  const known = new Set(machineParts.map((part) => part.id));
  return ids.filter((id) => known.has(id));
}
