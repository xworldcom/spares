import { describe, expect, it, beforeEach } from "vitest";
import {
  quoteTrayNoteStorageKey,
  readPersistedTrayNote,
  writePersistedTrayNote,
} from "./quote-tray-persist.ts";

describe("quote tray note persistence", () => {
  const key = quoteTrayNoteStorageKey("tenant-a", "machine-b");

  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips note text", () => {
    writePersistedTrayNote(key, "Need by Friday");
    expect(readPersistedTrayNote(key)).toBe("Need by Friday");
  });

  it("clears storage when note is empty", () => {
    writePersistedTrayNote(key, "x");
    writePersistedTrayNote(key, "   ");
    expect(readPersistedTrayNote(key)).toBe("");
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});
