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
  onSelect?: (part: ViewerPart | null) => void;
  onUnmatchedSelect?: (mesh: { meshName: string } | null) => void;
  className?: string;
}): JSX.Element;
```

| Prop | Behavior |
| --- | --- |
| `src` | URL of a `.glb` / `.gltf`. Loaded with `fetch(..., { credentials: "include" })` so the `spares_session` cookie is sent. A cookie-less load 401s on the protected preview. |
| `parts` | Joined named parts only (customer-pickable). `id` is the part number. |
| `onSelect` | Click a mesh that maps to `parts[]` → `{ id, name, meshName, qty }`. Click empty space or an unmatched mesh → `null`. |
| `selectedId` | Optional controlled highlight (list → viewer). Omit to let the viewer keep last named pick. |
| `onUnmatchedSelect` | Optional staff hook. A named mesh with no `parts[]` row reports `{ meshName }` and is **not** a quote-pickable part. |

Unmatched meshes are never treated as named parts. Only rows in `parts` are customer-selectable. Staff unmatched QA belongs in Fern's staff panel, not in this picker.

Rotate, zoom, and pan are built in (OrbitControls).

## Cookie file URL

`src` is Brent's same-origin `fileUrl` (`GET /api/machines/:id/file`), not a public blob. The loader:

1. `fetch(src, { credentials: "include" })` for the GLB/GLTF bytes
2. `GLTFLoader.setWithCredentials(true)` for any follow-up buffer/texture requests

Public fixture URLs such as `/placeholders/palletizer-placeholder.glb` still work.

## Sample pack (staff upload)

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

### Join / unmatched QA

| Part number | Name | qty | Join |
| --- | --- | --- | --- |
| `PN-FRAME-1000` | Frame weldment | 1 | Named mesh, clickable |
| `PN-ROLL-2104` | Drive roller | 2 | Named mesh (two rollers, one part number), clickable |
| `PN-MTR-3301` | Gearmotor | 1 | Named mesh, clickable |
| `PN-BELT-4402` | Conveyor belt | 1 | List-only unmatched (no mesh) |
| `PN-GRD-5503` | Safety guard | — | Model-only unmatched (mesh, no BOM row) |

`id` in the API / `ViewerPart` is the part number.

## Dev check

`/dev/viewer` loads this pack for a private, not-live developer check. It is not a customer, staff, or login route (Fern owns those).
