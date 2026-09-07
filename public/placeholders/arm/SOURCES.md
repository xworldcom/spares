# 3-DOF arm pack — from a real SolidWorks assembly

Public MIT example from [ros/solidworks_urdf_exporter](https://github.com/ros/solidworks_urdf_exporter) (`examples/3_DOF_ARM`), originally Stephen Brawner.

## What was in the ZIP

| File | Role |
| --- | --- |
| `3_DOF_ARM.SLDASM` | Assembly. References parts. ~105 KB. Not OLE; no triangles we can read on Linux. |
| `3_DOF_ARM_BASE.SLDPRT` | Base part |
| `3_DOF_ARM_SEGMENT.SLDPRT` | Link used twice (`…-1`, `…-2`) |
| `3_DOF_ARM_END_EFFECTOR.SLDPRT` | Tool |
| `meshes/*.STL` | Tessellation the SolidWorks URDF exporter already wrote |
| `urdf/*.csv` | One row per link, including `SW Components` (`3_DOF_ARM_BASE-1`) |

The `.sldasm` does **not** contain the part solids. It stores component names, instance suffixes, and mates. Geometry lives in the `.sldprt` files, still proprietary.

## Connection we use

1. SolidWorks (or the official SW2URDF add-in) writes **one STL per component** + a CSV.
2. This repo parents those STLs with the joint origins and names each node the SW part number.
3. Upload `3-dof-arm.glb` + `3-dof-arm-parts.csv`.

That is the same pack shape as Total ETO CSV + Save As GLB. SW2URDF is just another exporter that already exists in many shops.

Regenerate:

```bash
npm run generate:arm
```
