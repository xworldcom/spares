# SolidWorks → Spares pack export

Use this macro on an open assembly to build the files **Upload pack** expects: a GLB model and a parts list that **already joins** each selectable part to its meshes. Staff drop those two files in; there is no manual mesh-wiring step.

Bare GLBs without this manifest (for example a random scene like Littlest Tokyo) stay as a 3D model only. Spares does **not** invent parts from unmatched meshes.

## Install the macro

1. In SolidWorks, go to **Tools → Macro → New**.
2. Delete the empty module text, then open `spares-pack.bas` from this repo (download from `/export/spares-pack.bas` in Spares, or copy from `public/export/spares-pack.bas`).
3. Paste the full file into the macro editor and save the macro somewhere your team can reach (for example `C:\Spares\spares-pack.swp`).

You only need to set this up once per machine.

## Before you run it

- Open the **assembly** you want to publish (not a single part, not a drawing).
- **Save the assembly** so the macro knows where to write files (same folder as the `.sldasm`).
- Part numbers should live in custom properties when you have them: **PartNumber** or **Number** (document or active configuration). **Description** and **Vendor** are picked up when present.
- McMaster-style filenames (for example `91280A340.sldprt`) are used as the part number when no property is set.

## Run it

1. Open the assembly.
2. **Tools → Macro → Run**, choose your saved macro, and run **`main`**.
3. Read the success message — it lists exactly what was written and whether GLB export worked on your SolidWorks version.

The macro:

- Walks **every leaf part** in the tree (including parts inside subassemblies). Skips suppressed components, envelopes, and subassembly nodes themselves.
- Resolves `partNumber`, then **renames each instance** so SolidWorks `Name2` / the GLB node is `{partNumber}-1`, `{partNumber}-2`, …
- Writes **one parts-list row per unique part number**. `qty` is the instance count. `meshName` is the first instance’s actual component name after rename (SolidWorks may keep a `^Configuration` suffix).
- Writes **`{assembly-name}-spares-parts.json`** and **`{assembly-name}-spares-parts.csv`** next to the assembly.
- Tries to export **`{assembly-name}.glb`** in the same folder. On many recent SolidWorks builds this works in one shot; if not, the macro tells you to use **File → Save As → glTF Binary (*.glb)** once and save to that same folder.

## Auto-join contract

Upload joins a list row to a GLB node when **any** of these match (case-insensitive):

| List field | Matches GLB node / mesh name |
|------------|------------------------------|
| `meshName` | Exact name, or the same name after CAD cleanup (strip path, `.sldprt`, `^Config`) |
| `partNumber` | Exact, or a SolidWorks instance of that number (`PN-100-1`, `PN-100<1>`, `PN-100^Default-1`) |
| `name` | Fallback only, and never steals a node that another row claims by `meshName` / `partNumber` |

**Naming rules the macro follows** (ingest understands the same shapes):

1. **Allowed characters** in `partNumber` / `meshName`: `A–Z a–z 0–9 - _ .` Spaces, `/`, `\`, and `:` become a hyphen; other punctuation is dropped.
2. **Instance nodes** are `{partNumber}-1`, `{partNumber}-2`, … — never a bare part number as the GLB node, because SolidWorks `Name2` is always `name-instance`.
3. **One catalog row per part number.** Two bolts with the same number become `qty: 2` and share one pickable part. Distinct numbers that look like suffixes (`PN-FRAME-RAIL-01` vs `…-02`) stay separate rows with exact names.
4. **Parent nodes count.** If the GLB puts the component name on a group and `Body1` on the drawable child, Spares still joins on the component name. `Body1` extras may show as staff join notes; they are not quote parts.
5. **No mesh → no part.** A GLB uploaded without a matching list row does not become a selectable part. Unmatched meshes stay unmatched.

### What you upload in Spares

On **Upload pack** (staff):

| File | Role |
|------|------|
| `{assembly-name}.glb` | 3D model — node names must follow the rules above |
| `{assembly-name}-spares-parts.json` **or** `.csv` | Parts list with `partNumber`, `name`, `qty`, `meshName` |

You do **not** need both JSON and CSV — either one is fine. CSV is handy if you want to open or edit the list in Excel before upload.

### Parts list columns

**JSON** (array of objects):

```json
{
  "partNumber": "PN-ROLL-2104",
  "name": "Drive roller",
  "meshName": "PN-ROLL-2104-1",
  "qty": 2
}
```

**CSV** header:

`partNumber,name,meshName,qty,vendor`

After upload, the machine **parts list is already joined**. Click a mesh → that part number → add to quote. Staff may still see leftover scene/body names under join notes; those are not quote items.

## Total ETO later

This macro is the **mesh ↔ part number** bridge from CAD. Your catalog/BOM truth can still come from Total ETO CSV exports later; for now, upload the macro’s JSON or CSV with the GLB. Keep `meshName` (or use part numbers that match the renamed nodes) so join stays automatic.

## Troubleshooting

| Issue | What to do |
|-------|------------|
| “Save the assembly first” | Save the `.sldasm` to disk, then run again. |
| “Open an assembly first” | Active document must be an assembly. |
| No GLB after the run | Use **File → Save As → glTF Binary (*.glb)** manually to the folder shown in the message. |
| Meshes don’t join in Spares | Re-run the macro after property edits, re-export the GLB, and upload **both** files again. `meshName` must match a GLB node (or `{partNumber}-N`). Do not try to hand-wire a random GLB that was never published with this macro. |
