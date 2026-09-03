# Hardware fixture pack — sources and attribution

Private, not-live staff-upload fixture for the Spares 3D viewer. This is **not** Kevin’s machine and **not** customer CAD.

Pack path: `public/placeholders/hardware/`

| File | Role |
| --- | --- |
| [`mcmaster-hardware.glb`](mcmaster-hardware.glb) | Five separate named meshes. Node and mesh names **are McMaster catalog numbers**. |
| [`mcmaster-hardware-parts.csv`](mcmaster-hardware-parts.csv) | ETO-shaped BOM: `partNumber,name,meshName,qty`. |
| [`mcmaster-hardware-parts.json`](mcmaster-hardware-parts.json) | Same rows as JSON. |

Staff upload is the same as the palletizer fixture: GLB + CSV (or JSON) together as one pack. Join key is part number.

## Catalog id vs geometry

McMaster-Carr product CAD (STEP/STL) is login/JS-gated from this environment. GrabCAD library downloads returned HTTP 403 (CloudFront) with no login. Per the task, geometry is **public STEP** labeled with **real McMaster catalog numbers** as mesh / node / `partNumber` ids so `extractMeshNames` joins.

Do not treat the GLB as McMaster’s own CAD file. Catalog numbers identify the equivalent McMaster catalog item; geometry is the public ISO / vendor model listed below.

Regenerate (reads vendored preview GLBs under `scripts/hardware-cad/`):

```bash
npm run generate:hardware
```

## Parts

| Part number | Name | qty | Join | Geometry (public STEP) | License |
| --- | --- | --- | --- | --- | --- |
| `5972K325` | Shielded ball bearing, 8 mm ID × 22 mm OD × 7 mm W | 1 | Joined, clickable | [608ZZ ball bearing](https://www.step.parts/parts/bearing_608zz) ([STEP](https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/bearing_608zz.step)) | MIT ([earthtojake/step.parts](https://github.com/earthtojake/step.parts/blob/main/LICENSE)) |
| `91280A340` | Hex head cap screw, M6 × 25 mm, 18-8 SS | 4 | Joined, clickable | [ISO 4017 M6×25](https://www.step.parts/parts/iso4017_hex_head_cap_screw_m6x25) ([STEP](https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/iso4017_hex_head_cap_screw_m6x25.step)) | MIT |
| `91828A230` | Hex nut, M6, 18-8 SS | 4 | Joined, clickable | [ISO 4032 M6](https://www.step.parts/parts/iso4032_hex_nut_m6) ([STEP](https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/iso4032_hex_nut_m6.step)) | MIT |
| `6435K12` | Set-screw shaft collar, 8 mm bore | 1 | Joined, clickable | [Ø8 mm set-screw collar](https://www.step.parts/parts/shaft_collar_set_screw_bore_d08_simple) ([STEP](https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/shaft_collar_set_screw_bore_d08_simple.step)) | MIT |
| `6331K32` | Miniature DC motor | 1 | Joined, clickable | [Adafruit 711 DC Toy Motor](https://www.step.parts/parts/adafruit_711_dc_toy_motor) ([STEP](https://media.githubusercontent.com/media/earthtojake/step.parts/c6113328a5695b976a010a203a90fe86191769bf/catalog/step/adafruit_711_dc_toy_motor.step)); original [Adafruit CAD Parts / 711](https://github.com/adafruit/Adafruit_CAD_Parts/tree/main/711%20DC%20Toy%20Motor) | MIT ([Adafruit](https://github.com/adafruit/Adafruit_CAD_Parts/blob/main/LICENSE) and step.parts) |
| `93475A240` | Flat washer, M6 | 10 | List-only unmatched (no mesh) | — | — |

McMaster product pages (catalog ids, not the geometry we ship):

- https://www.mcmaster.com/5972K325/
- https://www.mcmaster.com/91280A340/
- https://www.mcmaster.com/91828A230/
- https://www.mcmaster.com/6435K12/
- https://www.mcmaster.com/6331K32/
- https://www.mcmaster.com/93475A240/

## What we did not use

- McMaster-Carr native CAD download (account / JS gate).
- GrabCAD library files (403 from this environment; no login scrape).
- Kevin’s SolidWorks machine or any customer file.

Redistribution here is a **private** GitHub repo for internal viewer testing only. Source models are MIT-licensed public CAD.
