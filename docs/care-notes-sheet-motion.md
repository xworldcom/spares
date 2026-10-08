# Care Notes sheet motion (Chunk 2)

One **SheetSurface** (`[data-conversation-sheet].conversation-sheet`): handle + Notes header + thread scroller + composer footer. Floor = top of tab bar.

**Three rests (one drag, two motion phases):**

1. **Closed (`peek`)** — header + peek of latest chat; composer translated below the tab bar (`--phase-a: 0`).
2. **Intermediate (`reply`)** — composer seated above tabs + latest row pinned (`--phase-a: 1`, `--phase-b: 0`).
3. **Open (`full`)** — height roll-up reveals history (`--phase-b: 1`); roll-up logic unchanged from Chunk 1.

Phase A = composer seat (peek→reply height band). Phase B = history roll-up (reply→full). One `--sheet-h` drag value drives both via `conversationSheetMotionFromHeight`.

Revert baseline: branch `baseline/2026-10-08-pre-notes-chunk2` @ `4a24fc1`.

Dead paths: dock (#258), absolute-bottom rig (#259), clip-path detents (#260 frozen at `7e80a65`).
