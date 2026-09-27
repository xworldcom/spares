# Chat watch and live read receipts

Care tickets and quote workspaces stay in sync with **`GET /api/chat/watch`** (long poll, up to ~25s server hold) instead of polling the full thread every few seconds.

## Doorbell (revision counter)

Each thread has a monotonic **`rev`** stored in memory and in Blob (`chat-watch-{ticket|quote}-{id}.json`). Writers call **`bumpChatWatch`** when something peers should reload:

| Event | Bumps watch? |
| --- | --- |
| New message, status change, assistant pause | Yes (`conversationWatchChanged` in `mutateTicket` / `mutateQuote`) |
| Staff opens thread (GET marks staff read) | No |
| Customer read watermark moves | Yes (`bumpConversationWatchForCustomerRead`) |

Customer read bumps are intentional: they only fire when a **customer** user's `lastReadAt` changes (PATCH `/read` or quote GET for customers). Staff read marks do not ring the doorbell, so two open browsers do not ping-pong.

## Client loop

1. **`useConversationWatch`** long-polls `/api/chat/watch?kind=&id=&since=` from revision `0`, then the last `rev`.
2. When `changed`, it invalidates warm-read caches and runs **`pollTicket`** / **`pollQuote`** (GET thread JSON).
3. **`useConversationReadWatermark`** (Care customers + quote customers) debounces **`PATCH …/read`** when the thread changes while the sheet is open, so the other party's watch fires even before the next message.

Quote watch starts only after the detail **GET succeeds** (`loadedRef === quoteRef`), avoiding 404s from list-seed ids before the server confirms access.

## Staff UI

Staff see muted **Read by …** under their last outbound bubble when `customerReadReceipts` updates from the poll step (`customerReadReceiptsForThread` in `care.ts`). No avatar bubbles.
