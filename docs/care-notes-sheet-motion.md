# Care Notes sheet motion

Authoritative product check: narrow desktop (phone-like width). Project research: `docs/bottom-sheet-research.md` in the Care Notes Project store.

## Three positions

| `useSnapSheet` snap | Position | Detent (`translateY`) |
| --- | --- | --- |
| `peek` | **Closed** | `H_open − H_closed` — composer under tab bar; chrome + latest context visible |
| `reply` | **Intermediate** | `H_open − H_peek` — Kevin target shot; composer above tab bar |
| `full` | **Open** | `0` — full surface above tab bar; history via message list scroll |

`H_open` = `--full-h`. `H_peek` = `--reply-h` (intermediate). `H_closed` visible band = `--peek-h`.

## Approach A (implemented)

One animated **SheetSurface** = the overlay `aside.conversation-sheet` (handle + toolbar + body). Fixed height `H_open`; detents use **`clip-path: inset(--sheet-clip-top 0 0 0)`** so the bottom stays on the tab-bar floor (composer stays above tabs at intermediate). Tab bar z-index stays above the sheet.

- Composer: `flex-shrink: 0` footer inside `.imsg-card--sheet` — never `position: fixed` to the viewport.
- Message list: `flex: 1; min-height: 0; overflow-y: auto` at open; pinned to latest at intermediate.
- Live drag: `useSnapSheet` paints `--sheet-y`; phases A/B derived for debug/probes only.

## Dead paths

#258 dock, #259 absolute-bottom `motion-seat`, #244–#257 multi-transform stacks.
