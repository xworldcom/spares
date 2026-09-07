# SolidWorks → Spares pack export

Use this macro on an open assembly to build the files **Upload pack** expects: a GLB model and a parts list that links each mesh in the model to a part number.

## Install the macro

1. In SolidWorks, go to **Tools → Macro → New**.
2. Delete the empty module text, then open `spares-pack.bas` from this repo (download from `/export/spares-pack.bas` in Spares, or copy from `public/export/spares-pack.bas`).
3. Paste the full file into the macro editor and save the macro somewhere your team can reach (for example `C:\Spares\spares-pack.swp`).

You only need to set this up once per machine.

## Before you run it

- Open the **assembly** you want to publish (not a single part, not a drawing).
- **Save the assembly** so the macro knows where to write files (same folder as the `.sldasm`).
- Part numbers should live in custom properties when you have them: **PartNumber** or **Number**. **Description** and **Vendor** are picked up when present.
- McMaster-style filenames (for example `91280A340.sldprt`) are used as the part number when no property is set.

## Run it

1. Open the assembly.
2. **Tools → Macro → Run**, choose your saved macro, and run **`main`**.
3. Read the success message — it lists exactly what was written and whether GLB export worked on your SolidWorks version.

The macro:

- Walks the assembly tree and skips suppressed components.
- Renames each component instance so GLB mesh names match the parts list (`meshName`).
- Writes **`{assembly-name}-spares-parts.json`** and **`{assembly-name}-spares-parts.csv`** next to the assembly.
- Tries to export **`{assembly-name}.glb`** in the same folder. On many recent SolidWorks builds this works in one shot; if not, the macro tells you to use **File → Save As → glTF Binary (*.glb)** once and save to that same folder.

## What you upload in Spares

On **Upload pack** (staff):

| File | Role |
|------|------|
| `{assembly-name}.glb` | 3D model — mesh names must match `meshName` in the list |
| `{assembly-name}-spares-parts.json` **or** `.csv` | Parts list with `partNumber`, `name`, `qty`, `meshName` |

You do **not** need both JSON and CSV — either one is fine. CSV is handy if you want to open or edit the list in Excel before upload.

### Parts list columns

**JSON** (array of objects):

```json
{
  "partNumber": "PN-ROLL-2104",
  "name": "Drive roller",
  "meshName": "PN-ROLL-2104",
  "qty": 1
}
```

**CSV** header:

`partNumber,name,meshName,qty,vendor`

`meshName` is the component instance name in the GLB. Spares uses it to join clicks on the model to the right part number. When the same part number appears more than once, the macro gives each instance a unique name (for example `PN-100-2`).

## Total ETO later

This macro is the **mesh ↔ part number** bridge from CAD. Your catalog/BOM truth can still come from Total ETO CSV exports later; for now, upload the macro’s JSON or CSV with the GLB.

## Troubleshooting

| Issue | What to do |
|-------|------------|
| “Save the assembly first” | Save the `.sldasm` to disk, then run again. |
| “Open an assembly first” | Active document must be an assembly. |
| No GLB after the run | Use **File → Save As → glTF Binary (*.glb)** manually to the folder shown in the message. |
| Meshes don’t join in Spares | Re-run the macro after property edits, re-export the GLB, and upload both files again. Check that `meshName` in the list matches node names in the GLB. |
