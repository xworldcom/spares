"use client";

import { Bounds, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Material, Object3D } from "three";
import { Box3, Color, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from "three";
import {
  assemblyCentroid,
  explodeTranslation,
  explodeTravel,
  ISOLATE_OPACITY,
  meshIsolateState,
} from "./assemblyView";
import {
  buildPartIndex,
  meshMatchesSelection,
  resolvePick,
} from "./resolvePick";
import type { PartPickerProps, UnmatchedMesh, ViewerPart } from "./types";
import { useCredentialedGLTF } from "./useCredentialedGLTF";

const NAMED_HIGHLIGHT = new Color("#38bdf8");
const UNMATCHED_HIGHLIGHT = new Color("#f59e0b");
const HOVER_HIGHLIGHT = new Color("#7dd3fc");
const DRAG_THRESHOLD = 4;
const HOLD_MS = 500;
const box = new Box3();
const localCenter = new Vector3();
const worldCenter = new Vector3();
const worldTarget = new Vector3();
const restLocal = new Vector3();
const targetLocal = new Vector3();

function emptyRaycast() {}

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && Boolean((object as Mesh).isMesh);
}

function asMaterials(material: Mesh["material"]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function partIdForObject(
  object: Object3D,
  partsByName: Map<string, ViewerPart>,
): string | null {
  const hit = resolvePick(object, partsByName);
  return hit && "part" in hit ? hit.part.id : null;
}

function applyHighlight(
  mesh: Mesh,
  selected: ViewerPart | UnmatchedMesh | null,
  hovered: ViewerPart | UnmatchedMesh | null,
) {
  const active = meshMatchesSelection(mesh, selected);
  const hover = !active && meshMatchesSelection(mesh, hovered);
  const color =
    selected && "id" in selected
      ? NAMED_HIGHLIGHT
      : hovered && "id" in hovered
        ? HOVER_HIGHLIGHT
        : UNMATCHED_HIGHLIGHT;

  for (const material of asMaterials(mesh.material)) {
    if (!(material instanceof MeshStandardMaterial)) {
      continue;
    }
    if (active) {
      material.emissive.copy(
        selected && "id" in selected ? NAMED_HIGHLIGHT : UNMATCHED_HIGHLIGHT,
      );
      material.emissiveIntensity = 0.72;
    } else if (hover) {
      material.emissive.copy(color);
      material.emissiveIntensity = 0.38;
    } else {
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
    }
  }
}

function applyIsolateMaterial(material: Material, ghosted: boolean) {
  if (material.userData.isolateBase == null) {
    material.userData.isolateBase = {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
    };
  }
  const base = material.userData.isolateBase as {
    transparent: boolean;
    opacity: number;
    depthWrite: boolean;
  };
  if (ghosted) {
    material.transparent = true;
    material.opacity = ISOLATE_OPACITY;
    material.depthWrite = false;
  } else {
    material.transparent = base.transparent;
    material.opacity = base.opacity;
    material.depthWrite = base.depthWrite;
  }
  material.needsUpdate = true;
}

function applyVisibility(
  mesh: Mesh,
  partsByName: Map<string, ViewerPart>,
  hiddenIds: ReadonlySet<string>,
  isolatedId: string | null,
) {
  const partId = partIdForObject(mesh, partsByName);
  const { hidden, ghosted } = meshIsolateState(partId, isolatedId, hiddenIds);
  mesh.visible = !hidden;
  mesh.raycast = hidden || ghosted ? emptyRaycast : Mesh.prototype.raycast;

  for (const material of asMaterials(mesh.material)) {
    applyIsolateMaterial(material, ghosted);
  }
}

function captureRestPose(scene: Object3D) {
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!isMesh(object)) {
      return;
    }
    object.userData.basePosition = object.position.clone();
    object.geometry.computeBoundingBox();
    if (object.geometry.boundingBox) {
      object.geometry.boundingBox.getCenter(localCenter);
    } else {
      box.setFromObject(object).getCenter(localCenter);
      object.worldToLocal(localCenter);
    }
    worldCenter.copy(localCenter).applyMatrix4(object.matrixWorld);
    object.userData.worldCenter = worldCenter.clone();
    object.userData.restParentInverse = object.parent
      ? object.parent.matrixWorld.clone().invert()
      : new Matrix4();
  });
}

function applyExplode(scene: Object3D, amount: number) {
  const centers: { x: number; y: number; z: number }[] = [];
  const meshes: Mesh[] = [];
  scene.traverse((object) => {
    if (!isMesh(object) || !object.userData.worldCenter) {
      return;
    }
    meshes.push(object);
    centers.push(object.userData.worldCenter as { x: number; y: number; z: number });
  });
  const centroid = assemblyCentroid(centers);
  const travel = explodeTravel(centers);

  for (const mesh of meshes) {
    const center = mesh.userData.worldCenter as { x: number; y: number; z: number };
    const offset = explodeTranslation(center, centroid, amount, travel);
    const inverse = mesh.userData.restParentInverse as Matrix4;
    const base = mesh.userData.basePosition as Vector3;
    worldCenter.set(center.x, center.y, center.z);
    worldTarget.set(center.x + offset.x, center.y + offset.y, center.z + offset.z);
    restLocal.copy(worldCenter).applyMatrix4(inverse);
    targetLocal.copy(worldTarget).applyMatrix4(inverse);
    mesh.position.copy(base).add(targetLocal.sub(restLocal));
  }
}

function LoadedModel({
  src,
  parts,
  selected,
  hovered,
  explode,
  hiddenIds,
  isolatedId,
  onPick,
  onLongPress,
  onHover,
}: {
  src: string;
  parts: ViewerPart[];
  selected: ViewerPart | UnmatchedMesh | null;
  hovered: ViewerPart | UnmatchedMesh | null;
  explode: number;
  hiddenIds: readonly string[];
  isolatedId: string | null;
  onPick: (hit: { part: ViewerPart } | UnmatchedMesh | null) => void;
  onLongPress?: (part: ViewerPart) => void;
  onHover: (hit: ViewerPart | UnmatchedMesh | null) => void;
}) {
  const gltf = useCredentialedGLTF(src);
  const partsByName = useMemo(() => buildPartIndex(parts), [parts]);
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const holdRef = useRef<{
    timer: number | null;
    startX: number;
    startY: number;
    fired: boolean;
  }>({ timer: null, startX: 0, startY: 0, fired: false });

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
    captureRestPose(cloned);
    return cloned;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    applyExplode(scene, explode);
    scene.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }
      applyVisibility(object, partsByName, hiddenSet, isolatedId);
      applyHighlight(object, selected, hovered);
    });
  }, [scene, explode, hiddenSet, isolatedId, partsByName, selected, hovered]);

  useEffect(() => {
    const hold = holdRef.current;
    return () => {
      if (hold.timer != null) {
        window.clearTimeout(hold.timer);
      }
      scene.traverse((object) => {
        if (!isMesh(object)) {
          return;
        }
        for (const material of asMaterials(object.material)) {
          material.dispose();
        }
      });
    };
  }, [scene]);

  function clearHold() {
    if (holdRef.current.timer != null) {
      window.clearTimeout(holdRef.current.timer);
      holdRef.current.timer = null;
    }
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    holdRef.current.fired = false;
    holdRef.current.startX = event.clientX;
    holdRef.current.startY = event.clientY;
    clearHold();
    const hit = resolvePick(event.object, partsByName);
    const part = hit && "part" in hit ? hit.part : null;
    if (hit) {
      onHover("part" in hit ? hit.part : hit);
      if (part) {
        onPick({ part });
      }
    }
    holdRef.current.timer = window.setTimeout(() => {
      holdRef.current.fired = true;
      if (part) {
        onLongPress?.(part);
      }
    }, HOLD_MS);
  }

  function handlePointerMove(event: ThreeEvent<PointerEvent>) {
    const dx = event.clientX - holdRef.current.startX;
    const dy = event.clientY - holdRef.current.startY;
    if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
      clearHold();
    }
  }

  function handlePointerUp() {
    clearHold();
  }

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (holdRef.current.fired || event.delta > DRAG_THRESHOLD) {
      return;
    }
    onPick(resolvePick(event.object, partsByName));
  }

  function handlePointerOver(event: ThreeEvent<PointerEvent>) {
    event.stopPropagation();
    const hit = resolvePick(event.object, partsByName);
    if (!hit) {
      onHover(null);
      return;
    }
    onHover("part" in hit ? hit.part : hit);
  }

  return (
    <primitive
      object={scene}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerOver={handlePointerOver}
      onPointerOut={() => onHover(null)}
    />
  );
}

function ViewerCanvas({
  src,
  parts,
  selected,
  explode,
  hiddenIds,
  isolatedId,
  onPick,
  onLongPress,
}: {
  src: string;
  parts: ViewerPart[];
  selected: ViewerPart | UnmatchedMesh | null;
  explode: number;
  hiddenIds: readonly string[];
  isolatedId: string | null;
  onPick: (hit: { part: ViewerPart } | UnmatchedMesh | null) => void;
  onLongPress?: (part: ViewerPart) => void;
}) {
  const [hovered, setHovered] = useState<ViewerPart | UnmatchedMesh | null>(null);

  return (
    <Canvas
      camera={{ position: [2.8, 1.9, 2.5], fov: 40, near: 0.1, far: 80 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => onPick(null)}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#0b0d10"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 3]} intensity={1.25} />
      <directionalLight position={[-3, 3, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <Bounds fit margin={1.3}>
          <LoadedModel
            src={src}
            parts={parts}
            selected={selected}
            hovered={hovered}
            explode={explode}
            hiddenIds={hiddenIds}
            isolatedId={isolatedId}
            onPick={onPick}
            onLongPress={onLongPress}
            onHover={setHovered}
          />
        </Bounds>
      </Suspense>
      <OrbitControls
        makeDefault
        enableDamping
        enablePan
        enableRotate
        enableZoom
      />
    </Canvas>
  );
}

export function PartPicker({
  src,
  parts,
  selectedId,
  explode = 0,
  hiddenIds = [],
  isolatedId = null,
  onSelect,
  onUnmatchedSelect,
  onLongPress,
  className,
}: PartPickerProps) {
  const controlled = selectedId !== undefined;
  const [internalId, setInternalId] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedMesh | null>(null);

  const activeId = controlled ? (selectedId ?? null) : internalId;
  const selectedPart = activeId
    ? (parts.find((part) => part.id === activeId) ?? null)
    : null;
  const selected = selectedPart ?? unmatched;

  function handlePick(hit: { part: ViewerPart } | UnmatchedMesh | null) {
    if (!hit) {
      if (!controlled) {
        setInternalId(null);
      }
      setUnmatched(null);
      onSelect?.(null);
      onUnmatchedSelect?.(null);
      return;
    }

    if ("part" in hit) {
      if (!controlled) {
        setInternalId(hit.part.id);
      }
      setUnmatched(null);
      onSelect?.(hit.part);
      onUnmatchedSelect?.(null);
      return;
    }

    if (!controlled) {
      setInternalId(null);
    }
    setUnmatched(hit);
    onSelect?.(null);
    onUnmatchedSelect?.(hit);
  }

  return (
    <div className={className} style={{ height: "100%", minHeight: 0 }}>
      <ViewerCanvas
        src={src}
        parts={parts}
        selected={selected}
        explode={explode}
        hiddenIds={hiddenIds}
        isolatedId={isolatedId}
        onPick={handlePick}
        onLongPress={onLongPress}
      />
    </div>
  );
}
