# Spares

Spares is a private industrial spare-parts platform.

Internal staff will upload 3D models derived from SolidWorks. Customers will log in, inspect and rotate a machine in the browser, pick a part, and request a quote.

This repository is **private by default**. The product is **not live**. Do not deploy this app to a public production URL, attach a public custom domain, or turn on public signup.

## What this pass is (T1.0)

This pull request is only the application scaffold:

- Next.js App Router (TypeScript)
- A home page that states the app is private and not live
- ESLint from the official Next.js starter
- Folders so later work can land without a rewrite

It does **not** include authentication, model upload, a 3D viewer, a cart, quotes, payments, a public marketing site, or a SolidWorks converter. Those belong in later tickets.

## Follow-up issues (T1.1–T1.4)

Continue in GitHub issues **T1.1–T1.4**:

- https://github.com/xworldcom/spares/issues

The first product slice after this scaffold is expected to be: upload a GLB file → view it in 3D → pick a part → request a quote.

## Local development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You should see a page stating the app is private and not live.

```bash
npm run lint
npm run build
```

## Repository layout

| Path | Later work |
| --- | --- |
| `src/app` | App Router pages and layouts |
| `src/app/api` | Backend Route Handlers |
| `src/components/viewer` | Browser 3D viewer |
| `src/lib/auth` | Authentication helpers |
| `src/types` | Shared TypeScript types |

## Do not go live

Keep this GitHub repository private. Do not publish a public site from this scaffold. Preview or local development is fine; production and a custom domain are not part of T1.0.
