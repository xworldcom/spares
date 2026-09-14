# Spares SolidWorks add-in

Staff Task Pane: open an assembly → sign in → **Upload** → oee360 creates the machine pack as that staff user. Assign customer and site on the machine page. No Excel.

Not a quoting add-in. Same staff pack the website upload already uses.

## Install (staff PC)

1. Download `Spares-SolidWorks-Addin.zip` from the **SolidWorks add-in package** GitHub Action on this repo (Actions → latest run → Artifacts). After merge, it also builds from `main`.
2. Unzip.
3. Close SolidWorks.
4. Double-click `Install.cmd` and accept the admin prompt.
5. Open SolidWorks → **Tools → Add-Ins** → enable **Spares**.

Uninstall with `Uninstall.cmd`.

Requires 64-bit SolidWorks, .NET Framework 4.8, and admin once for COM registration. The add-in installs to `C:\Program Files\Spares\SolidWorks Add-in\`.

## Sign in (required)

Upload uses `POST /api/auth/login` and the `spares_session` cookie. oee360 already knows **which staff user** published the pack because the create route is staff-only and tied to that session.

Do not share one staff password across companies. Future productization (separate tenants / publishedBy on the machine row) is tracked in a follow-up issue — the add-in already collects the identity.

Default URL: `http://localhost:3000`. Soft Launch: `https://oee360.com` (app login, not Vercel team SSO).

## What Upload sends

1. Staff session
2. BOM from `PartNumber` / `Description` (filename fallback)
3. GLB via Save As Extended Reality (SOLIDWORKS 2024+)
4. `POST /api/machines` multipart: `name`, `partsList` JSON, GLB or R2 `storedFileName`
5. Opens `/machines/{id}`

## Build from source

```text
Open solidworks-addin/Spares.SwAddin.sln
Platform = x64, Configuration = Release
```

Then run `installer/Install.cmd` from a folder that also contains the built `Spares.SwAddin.dll`, or use `register.ps1` for a dev-tree register.

## Limits

- GLB export needs SOLIDWORKS 2024+. Older seats keep using website pack upload until server STEP→GLB (#101).
- Not a signed MSI yet. The zip + `Install.cmd` is the staff installer.
