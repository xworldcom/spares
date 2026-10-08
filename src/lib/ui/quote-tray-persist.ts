import type { Part } from "@/lib/api/types";

export type PersistedTrayLine = {
  id: string;
  name: string;
  meshName: string;
  qty: number;
};

export function quoteTrayStorageKey(tenantId: string, machineId: string) {
  return `spares-quote-tray:${tenantId}:${machineId}`;
}

export function readPersistedTrayLines(key: string): PersistedTrayLine[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as PersistedTrayLine[];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (line) =>
        line &&
        typeof line.id === "string" &&
        line.id.trim() !== "" &&
        typeof line.name === "string" &&
        Number.isInteger(line.qty) &&
        line.qty >= 1,
    );
  } catch {
    return [];
  }
}

export function writePersistedTrayLines(key: string, lines: PersistedTrayLine[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (lines.length === 0) {
      window.localStorage.removeItem(key);
      return;
    }
    window.localStorage.setItem(key, JSON.stringify(lines));
  } catch {
    // ignore quota / private mode
  }
}

export function trayLineToPersisted(part: Part, qty: number): PersistedTrayLine {
  return {
    id: part.id,
    name: part.name,
    meshName: part.meshName ?? "",
    qty,
  };
}

export function persistedToPart(line: PersistedTrayLine, machinePart?: Part): Part {
  if (machinePart) {
    return machinePart;
  }
  return {
    id: line.id,
    name: line.name,
    meshName: line.meshName,
    qty: 1,
  };
}

/** Saved lines first, then anything already in the tray that was not saved (added before hydrate). */
export function mergeHydratedTrayLines<T extends { part: Part; qty: number }>(
  persisted: PersistedTrayLine[],
  current: T[],
): T[] {
  const saved = persisted.map((row) => ({ part: persistedToPart(row), qty: row.qty }) as T);
  const ids = new Set(persisted.map((row) => row.id));
  return [...saved, ...current.filter((line) => !ids.has(line.part.id))];
}
