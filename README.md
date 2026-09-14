# Spares

Spares is a private industrial spare-parts platform.

Internal staff upload a machine pack. Customers log in, inspect and rotate a machine in the browser, pick a named part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T3.0)

One shared quote workspace for customer and staff. Private preview only. Not live.

Status pipeline: `requested` → `in_review` → `pricing` → `quoted` → `po_received` → `confirmed` → `ordered` → `shipped` → `delivered` → `closed` (+ `cancelled`).

- Staff prices each line (supplier cost, sell price, lead time).
- Customer sees sell prices after `quoted`, then can add a PO number and PDF.
- Staff enters tracking at `shipped`. Customer sees it on the quote page.
- Chatter-like activity feed with in-app unread (email later).

Machine-page **Request quote** still creates `status=requested` with tray quantities. Extends T2.0 explode / isolate / tray.

## What this pass is not

No email gateway, payments, Total ETO live pull, AR, Yonder, public marketing, or go-live.

## SolidWorks add-in (staff publish)

Staff can publish an assembly from SolidWorks instead of building a GLB + CSV by hand.

Source: [`solidworks-addin/`](solidworks-addin/). Click **Upload** in the Task Pane → oee360 creates the machine pack → staff assigns customer and site on the machine page.

Windows + SOLIDWORKS + Visual Studio 2022. See [`solidworks-addin/README.md`](solidworks-addin/README.md). Soft Launch web upload stays available.

## PartPicker (Drew)

See the rest of this file on `main` if a merge tool flags this section — the following docs are unchanged from main and continue below.
