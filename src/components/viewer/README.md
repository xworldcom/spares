# Browser part picker (T1.1)

Fern should import the viewer from this folder. It loads **glTF / GLB only**. There is no CAD kernel and no native SolidWorks ingest.

```ts
import { PartPicker } from "@/components/viewer";
import type { ViewerPart } from "@/components/viewer";

<PartPicker
  src={machine.fileUrl}
  parts={machine.parts}
  selectedId={selectedId}
  onSelect={(part) => {
    /* part is { id, name, meshName, qty } or null */
  }}
/>
```

`PartPicker` is a Client Component wrapped in `next/dynamic(..., { ssr: false })` so WebGL does not run during SSR or `npm run build`. Import it from a Server Component page or from a Client Component.

## Props

```ts
export type ViewerPart = {
  id: string; // part number
  name: string;
  meshName: string;
  qty: number;
};

export function PartPicker(props: {
  src: string; // GLB/GLTF URL — Fern passes GET /api/machines/:id/file
  parts: ViewerPart[];
  selectedId?: string | null;
  explode?: number; // 0 = assembled, 1 = fully exploded
  hiddenIds?: readonly string[];
  isolatedId?: string | null;
  onSelect?: (part: ViewerPart | null) => void;
  onUnmatchedSelect?: (mesh: { meshName: string } | null) => void;
  onLongPress?: (part: ViewerPart) => void;
  className?: string;
}): JSX.Element;
```

| Prop | Behavior |
| --- | --- |
| `src` | URL of a `.glb` / `.gltf`. Same-origin paths load with `fetch(..., { credentials: "include" })` so the `spares_session` cookie is sent. Presigned R2/CDN URLs load cross-origin without cookies. |
| `parts` | Joined named parts only (customer-pickable). `id` is the part number. |
| `onSelect` | Pointer-down on a mesh that maps to `parts[]` → `{ id, name, meshName, qty }`. Empty space → `null`. |
| `selectedId` | Optional controlled highlight (list → viewer). Omit to let the viewer keep last named pick. |
| `explode` | Radial explode from the assembly centroid. `0` is assembled. Meshes translate away from the centroid; camera framing is not refit. |
| `hiddenIds` | Named parts with `visible = false`. |
| `isolatedId` | Other meshes go to opacity ~0.12 and are not clickable. Isolated part stays solid. |
| `onLongPress` | Press-and-hold (~500ms) on a named part. Parent shows Hide / Only this. Not a right-click CAD menu. |
| `onUnmatchedSelect` | Optional staff hook. A named mesh with no `parts[]` row reports `{ meshName }` and is **not** a quote-pickable part. |

Unmatched meshes are never treated as named parts. Only rows in `parts` are customer-selectable. Staff unmatched QA belongs in Fern's staff panel, not in this picker.

Rotate, zoom, and pan are built in (OrbitControls). There is no CAD ribbon. Hide / isolate / explode live on the machine page chrome.

WebXR / VR is a later pass — do not add XR buttons here.

## Model file URL

`src` is Brent's `fileUrl` from `GET /api/machines/:id`. With S3/R2 configured, that is a short-lived presigned GET URL (browser loads directly from object storage, no cookies). Without S3, it is the same-origin proxy `GET /api/machines/:id/file`. The loader:

1. `fetch(src, { credentials: "include" })` for same-origin URLs; `credentials: "omit"` for presigned/CDN URLs
2. `GLTFLoader.setWithCredentials(true)` only for same-origin follow-up buffer/texture requests

Public fixture URLs such as `/placeholders/palletizer-placeholder.glb` and `/placeholders/hardware/mcmaster-hardware.glb` still work.

## Sample packs (staff upload)

### Palletizer placeholder (T1.1)

Ship these together. Paths are under `public/placeholders/`:

| File | Role |
| --- | --- |
| [`/placeholders/palletizer-placeholder.glb`](../../../public/placeholders/palletizer-placeholder.glb) | Short palletizer / conveyor infeed. Node and mesh names **are part numbers**. |
| [`/placeholders/palletizer-parts.csv`](../../../public/placeholders/palletizer-parts.csv) | Fake Total ETO-shaped BOM (`partNumber,name,meshName,qty`). |
| [`/placeholders/palletizer-parts.json`](../../../public/placeholders/palletizer-parts.json) | Same rows as JSON. |

Regenerate the GLB (does not download third-party models):

```bash
npm run generate:placeholder
```

#### Join / unmatched QA

| Part number | Name | qty | Join |
| --- | --- | --- | --- |
| `PN-FRAME-1000` | Frame weldment | 1 | Named mesh, clickable |
| `PN-ROLL-2104` | Drive roller | 2 | Named mesh (two rollers, one part number), clickable |
| `PN-MTR-3301` | Gearmotor | 1 | Named mesh, clickable |
| `PN-BELT-4402` | Conveyor belt | 1 | List-only unmatched (no mesh) |
| `PN-GRD-5503` | Safety guard | — | Model-only unmatched (mesh, no BOM row) |

`id` in the API / `ViewerPart` is the part number.

### Hardware CAD pack

Real public CAD (ISO fasteners, 608ZZ bearing, Adafruit DC motor) with **McMaster catalog numbers** as node / mesh / `partNumber`. Sources and licenses: [`public/placeholders/hardware/SOURCES.md`](../../../public/placeholders/hardware/SOURCES.md).

| File | Role |
| --- | --- |
| [`/placeholders/hardware/mcmaster-hardware.glb`](../../../public/placeholders/hardware/mcmaster-hardware.glb) | Five separate named meshes. |
| [`/placeholders/hardware/mcmaster-hardware-parts.csv`](../../../public/placeholders/hardware/mcmaster-hardware-parts.csv) | ETO-shaped BOM (`partNumber,name,meshName,qty`). |
| [`/placeholders/hardware/mcmaster-hardware-parts.json`](../../../public/placeholders/hardware/mcmaster-hardware-parts.json) | Same rows as JSON. |

```bash
npm run generate:hardware
```

| Part number | Name | qty | Join |
| --- | --- | --- | --- |
| `5972K325` | Shielded ball bearing, 8 mm ID × 22 mm OD × 7 mm W | 1 | Named mesh, clickable |
| `91280A340` | Hex head cap screw, M6 × 25 mm, 18-8 SS | 4 | Named mesh, clickable |
| `91828A230` | Hex nut, M6, 18-8 SS | 4 | Named mesh, clickable |
| `6435K12` | Set-screw shaft collar, 8 mm bore | 1 | Named mesh, clickable |
| `6331K32` | Miniature DC motor | 1 | Named mesh, clickable |
| `93475A240` | Flat washer, M6 | 10 | List-only unmatched (no mesh) |

## Dev check

`/dev/viewer` loads the hardware pack for a private, not-live developer check. `?pack=palletizer` loads the T1.1 placeholder. It is not a customer, staff, or login route (Fern owns those).
