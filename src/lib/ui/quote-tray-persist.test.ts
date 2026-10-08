import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Part } from "../api/types.ts";
import {
  quoteTrayNoteStorageKey,
  readPersistedTrayNote,
  resolveTrayLines,
  writePersistedTrayNote,
} from "./quote-tray-persist.ts";

const store = new Map<string, string>();
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  },
});

describe("quote tray note persistence", () => {
  const key = quoteTrayNoteStorageKey("tenant-a", "machine-b");

  beforeEach(() => store.clear());

  it("round-trips note text", () => {
    writePersistedTrayNote(key, "Need by Friday");
    assert.equal(readPersistedTrayNote(key), "Need by Friday");
  });

  it("clears storage when note is empty", () => {
    writePersistedTrayNote(key, "x");
    writePersistedTrayNote(key, "   ");
    assert.equal(readPersistedTrayNote(key), "");
    assert.equal(store.get(key), undefined);
  });
});

describe("resolveTrayLines (lifecycle on restored lines)", () => {
  const obsolete = { status: "obsolete" as const, successorPartNumber: "6331K53" };
  const restored = { part: { id: "6331K32", name: "Miniature DC motor", meshName: "", qty: 1 } as Part, qty: 2 };

  it("restored localStorage line has no lifecycle on its own", () => {
    assert.equal(restored.part.lifecycle, undefined);
  });

  it("takes lifecycle from the machine BOM when the line was restored without it", () => {
    const bom = [{ ...restored.part, meshName: "motor", lifecycle: obsolete }] as Part[];
    const [line] = resolveTrayLines([restored], bom, {});
    assert.deepEqual(line.part.lifecycle, obsolete);
    assert.equal(line.part.meshName, "motor");
    assert.equal(line.qty, 2);
  });

  it("takes lifecycle from the lookup when the machine is not loaded yet or the PN is manual", () => {
    const [line] = resolveTrayLines([restored], undefined, { "6331K32": obsolete });
    assert.deepEqual(line.part.lifecycle, obsolete);
  });

  it("lookup wins over a stale BOM value", () => {
    const bom = [{ ...restored.part, lifecycle: { status: "announced" as const } }] as Part[];
    const [line] = resolveTrayLines([restored], bom, { "6331K32": obsolete });
    assert.equal(line.part.lifecycle?.status, "obsolete");
  });

  it("leaves lines without lifecycle alone", () => {
    const [line] = resolveTrayLines([restored], [], {});
    assert.equal(line.part.lifecycle, undefined);
  });
});
