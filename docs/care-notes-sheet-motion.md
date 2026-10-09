# Care Notes sheet motion (Chunk 1)

One **SheetSurface** (`[data-conversation-sheet].conversation-sheet`): fixed open height, **height detents** roll the whole surface (handle + Notes header + thread + composer) above the tab bar.

- **Resting closed (Chunk 1):** Kevin intermediate — `reply` snap (`--reply-h`, ~17.5rem + measured chrome). Composer always visible; no bury-under-tabs (Chunk 2).
- **Open:** roll up to `full` to reveal older messages in the thread scroller.
- **Close:** reverse to `reply`.

Dead paths: dock (#258), absolute-bottom rig (#259), clip-path detents (#260 frozen at `7e80a65`).
