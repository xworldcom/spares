# Spares SolidWorks add-in

Staff Task Pane: open an assembly → **Upload** → oee360 creates the machine pack. Assign customer and site on the machine page. No Excel, no hand-linking files.

This is **not** a quoting add-in. It publishes the same staff pack the website upload already uses.

## What Upload sends

1. Staff sign-in (`POST /api/auth/login`, cookie `spares_session`)
2. Assembly BOM from custom properties (`PartNumber` / `Description`) plus file names
3. GLB via SolidWorks Save As Extended Reality (SOLIDWORKS 2024+)
4. `POST /api/machines` multipart: `name`, `partsList` (JSON), and either a presigned R2 `storedFileName` or the GLB itself
5. Opens `/machines/{id}` in the browser

Customer and site stay a web step on purpose.

## Build (Windows + Visual Studio 2022)

SolidWorks must be installed on the build/run machine. The project targets **.NET Framework 4.8 / x64** and talks to SolidWorks through COM (`ISwAddin` + late-bound API). It does not bundle Dassault interop DLLs.

```text
Open solidworks-addin/Spares.SwAddin.sln
Platform = x64
Build Release
```

Close SolidWorks, then from an **elevated** PowerShell:

```powershell
cd solidworks-addin
.\register.ps1
```

Start SolidWorks → **Tools → Add-Ins** → enable **Spares**. The tab is on the right Task Pane.

Unregister:

```powershell
.\unregister.ps1
```

## Use

1. Run `npm run dev` in the repo root (or point the URL at a staff-reachable Soft Launch origin).
2. In the pane: oee360 URL (default `http://localhost:3000`), staff email, password, **Sign in**.
3. Open the top-level assembly.
4. Machine name defaults to the file name.
5. **Upload**.

Preview URLs behind Vercel team SSO will show a login wall. Use localhost or an origin that accepts the **app** staff login.

## Part numbers

Set SolidWorks custom property `PartNumber` (or `Part Number`) and `Description` on each part. The add-in groups instances and writes `meshName` = part number so the existing viewer join can match without a CSV.

Toolbox components are skipped. Suppressed components are skipped. Lightweight components are resolved first.

## Limits

- GLB export needs SOLIDWORKS 2024+. Older seats should keep using the website pack upload until server-side STEP→GLB (#101) exists.
- Desktop HTTP does not send a browser `Origin`, so R2 CORS allowlisting is not required for the add-in itself.
- Not an MSI yet. `regasm /codebase` on the staff seat is enough for internal use.
