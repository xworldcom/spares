# Care and quote chat email notifications (framework)

Machine-shared Care tickets and quote conversations can trigger email to everyone who can see that machine, except the person who sent the update. The feature is **off by default** until you opt in with environment variables.

## Enable

Set on the deployment (Preview or Production):

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `CHAT_EMAIL_NOTIFY` | Yes to send | unset / `0` | Set to `1`, `true`, or `yes` to run the notify hook after a chat message is saved. |
| `SPARES_PUBLIC_ORIGIN` | Recommended | `https://oee360.com` when unset on Vercel uses `VERCEL_URL` | Base URL for deep links in the email body. |

There is no third-party mail provider wired yet. When enabled, the built-in mailer **logs** structured JSON lines (`chat-email-notify`) instead of delivering mail. Swap in Resend, SendGrid, or similar by implementing `ChatEmailMailer` in `src/lib/notifications/mailer.ts`.

## What triggers a send

- `POST /api/tickets/:id/activity` — human Care chat messages and attachments (not ticket status changes).
- `POST /api/quotes/:id/activity` — human quote chat messages and attachments (not status, pricing, PO, or shipment system activities).

## Recipients

For the ticket or quote’s machine:

1. Staff in the same tenant who can access that machine (all host staff for tenant machines today).
2. Customer people with site or machine grants that include the machine (`canAccessMachine` / existing ACL).
3. Minus the sender (by user id and by email, case-insensitive).
4. Minus addresses that fail basic email validation.
5. Deduplicated by normalized email.

## Product notes

- Care tickets stay shared by machine; this only adds optional email, not new visibility.
- Per-user mute or digest batching are not implemented yet.
