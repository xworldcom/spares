# How to forward a host Care address

Each host has a display address and a unique inbound address. The display address is the mailbox your customers already use, such as `cases@shape.com`. The inbound address looks like `shape@tickets.oee360.com`. This build records both. It does not receive mail, and it does not send from the display address.

## Forward the company address

1. Open the host in Platform and find Care ticket email.
2. Save the display ticket email.
3. Copy the forward-to address.
4. At the company mail host, forward the display address to that forward-to address.

That is the same pattern Zendesk uses. The customer writes to the company address. The company forwards a copy to the provider address.

The host page status is framed and not live. Leave the forward in place if you want it ready. OEE360 drops inbound mail until the live flag is on, and even then this build does not create tickets.

## Limit senders when inbound is live

When inbound is live, accept mail only from catalog users on that host who can access the machine. Guests are out of scope. Do not file a ticket from an unknown sender.

## Publish DNS only when From goes live

SPF and DKIM for sending as the display address are not active. The Platform card includes a copy-paste draft. Do not publish it yet.

When From goes live, merge the OEE360 include into the display domain's existing SPF record. Do not publish a second SPF record. OEE360 will send the DKIM selector and TXT value before From goes live. Do not publish a guessed key.

## Still a frame

Complete live inbound + From-domain (SPF/DKIM) once we go live with paying customers.

No paid mail vendor is configured. `CARE_TICKET_EMAIL_LIVE` stays `0` and `CARE_INBOUND_DOMAIN` defaults to `tickets.oee360.com`.
