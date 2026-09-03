"use client";

import { Bounds, OrbitControls } from "@react-three/drei";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { Material, Mesh, Object3D } from "three";
import { Color, MeshStandardMaterial } from "three";
import {
  buildPartIndex,
  meshMatchesSelection,
  resolvePick,
} from "./resolvePick";
import type { PartPickerProps, UnmatchedMesh, ViewerPart } from "./types";
import { useCredentialedGLTF } from "./useCredentialedGLTF";

const NAMED_HIGHLIGHT = new Color("#38bdf8");
const UNMATCHED_HIGHLIGHT = new Color("#f59e0b");
const DRAG_THRESHOLD = 4;

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && Boolean((object as Mesh).isMesh);
}

function asMaterials(material: Mesh["material"]): Material[] {
  return Array.isArray(material) ? material : [material];
}

function applyHighlight(
  mesh: Mesh,
  selected: ViewerPart | UnmatchedMesh | null,
) {
  const active = meshMatchesSelection(mesh, selected);
  const color =
    selected && "id" in selected ? NAMED_HIGHLIGHT : UNMATCHED_HIGHLIGHT;

  for (const material of asMaterials(mesh.material)) {
    if (!(material instanceof MeshStandardMaterial)) {
      continue;
    }
    if (active) {
      material.emissive.copy(color);
      material.emissiveIntensity = 0.55;
    } else {
      material.emissive.set("#000000");
      material.emissiveIntensity = 0;
    }
  }
}

function LoadedModel({
  src,
  parts,
  selected,
  onPick,
}: {
  src: string;
  parts: ViewerPart[];
  selected: ViewerPart | UnmatchedMesh | null;
  onPick: (hit: { part: ViewerPart } | UnmatchedMesh | null) => void;
}) {
  const gltf = useCredentialedGLTF(src);
  const partsByName = useMemo(() => buildPartIndex(parts), [parts]);
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
    return cloned;
  }, [gltf.scene]);

  useLayoutEffect(() => {
    scene.traverse((object) => {
      if (isMesh(object)) {
        applyHighlight(object, selected);
      }
    });
  }, [scene, selected]);

  useEffect(() => {
    return () => {
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

  function handleClick(event: ThreeEvent<MouseEvent>) {
    event.stopPropagation();
    if (event.delta > DRAG_THRESHOLD) {
      return;
    }
    onPick(resolvePick(event.object, partsByName));
  }

  return <primitive object={scene} onClick={handleClick} />;
}

function ViewerCanvas({
  src,
  parts,
  selected,
  onPick,
}: {
  src: string;
  parts: ViewerPart[];
  selected: ViewerPart | UnmatchedMesh | null;
  onPick: (hit: { part: ViewerPart } | UnmatchedMesh | null) => void;
}) {
  return (
    <Canvas
      camera={{ position: [2.8, 1.9, 2.5], fov: 40, near: 0.1, far: 50 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onPointerMissed={() => onPick(null)}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={["#1c2128"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[4, 8, 3]} intensity={1.25} />
      <directionalLight position={[-3, 3, -4]} intensity={0.35} />
      <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.3}>
          <LoadedModel
            src={src}
            parts={parts}
            selected={selected}
            onPick={onPick}
          />
        </Bounds>
      </Suspense>
      <gridHelper args={[6, 12, "#3d4a58", "#2a323c"]} position={[0, 0, 0]} />
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
  onSelect,
  onUnmatchedSelect,
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
    <div className={className} style={{ height: "100%", minHeight: 320 }}>
      <ViewerCanvas
        src={src}
        parts={parts}
        selected={selected}
        onPick={handlePick}
      />
    </div>
  );
}
