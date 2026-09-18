"use client";

import { Bounds, OrbitControls } from "@react-three/drei";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";
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
import { StudioGround } from "./StudioGround";
import type { PartPickerProps, UnmatchedMesh, ViewerPart } from "./types";
import {
  loadGltfWithCredentials,
  useCredentialedGLTF,
} from "./useCredentialedGLTF";

const NAMED_HIGHLIGHT = new Color("#38bdf8");
const UNMATCHED_HIGHLIGHT = new Color("#f59e0b");
const HOVER_HIGHLIGHT = new Color("#7dd3fc");
const DRAG_THRESHOLD = 4;
const HOLD_MS = 500;

type PickHit = { part: ViewerPart } | UnmatchedMesh | null;

type ViewerGesture = {
  dragging: boolean;
  moved: boolean;
  fired: boolean;
  startX: number;
  startY: number;
  pointerId: number;
  pendingHit: PickHit;
};
const VIEWER_BG = "#12161c";
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

function hoverMatches(
  left: ViewerPart | UnmatchedMesh | null,
  right: ViewerPart | UnmatchedMesh | null,
) {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if ("id" in left && "id" in right) {
    return left.id === right.id;
  }
  if (!("id" in left) && !("id" in right)) {
    return left.meshName === right.meshName;
  }
  return false;
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
  explode,
  hiddenIds,
  isolatedId,
  gestureRef,
  onPick,
  onLongPress,
  onRegisterCancelHold,
  onRegisterClearHover,
}: {
  src: string;
  parts: ViewerPart[];
  selected: ViewerPart | UnmatchedMesh | null;
  explode: number;
  hiddenIds: readonly string[];
  isolatedId: string | null;
  gestureRef: MutableRefObject<ViewerGesture>;
  onPick: (hit: { part: ViewerPart } | UnmatchedMesh | null) => void;
  onLongPress?: (part: ViewerPart) => void;
  onRegisterCancelHold?: (cancelHold: () => void) => void;
  onRegisterClearHover?: (clearHover: () => void) => void;
}) {
  const gltf = useCredentialedGLTF(src);
  const partsByName = useMemo(() => buildPartIndex(parts), [parts]);
  const hiddenSet = useMemo(() => new Set(hiddenIds), [hiddenIds]);
  const holdRef = useRef<{ timer: number | null }>({ timer: null });
  const hoveredRef = useRef<ViewerPart | UnmatchedMesh | null>(null);

  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    cloned.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }
      if (!object.material) {
        object.material = new MeshStandardMaterial({
          color: "#c8d0d8",
          metalness: 0.12,
          roughness: 0.68,
        });
        return;
      }
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
    captureRestPose(cloned);
    return cloned;
  }, [gltf.scene]);

  function refreshHighlights() {
    scene.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }
      applyVisibility(object, partsByName, hiddenSet, isolatedId);
      applyHighlight(object, selected, hoveredRef.current);
    });
  }

  useLayoutEffect(() => {
    applyExplode(scene, explode);
    refreshHighlights();
  }, [scene, explode, hiddenSet, isolatedId, partsByName, selected]);

  useEffect(() => {
    return () => {
      if (holdRef.current.timer != null) {
        window.clearTimeout(holdRef.current.timer);
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

  useEffect(() => {
    onRegisterCancelHold?.(clearHold);
    onRegisterClearHover?.(() => {
      if (hoveredRef.current == null) {
        return;
      }
      hoveredRef.current = null;
      refreshHighlights();
    });
  });

  function isTap(event: ThreeEvent<PointerEvent>) {
    const gesture = gestureRef.current;
    if (gesture.fired || gesture.dragging || gesture.moved) {
      return false;
    }
    const dx = event.clientX - gestureRef.current.startX;
    const dy = event.clientY - gestureRef.current.startY;
    return dx * dx + dy * dy <= DRAG_THRESHOLD * DRAG_THRESHOLD;
  }

  function handlePointerDown(event: ThreeEvent<PointerEvent>) {
    clearHold();
    gestureRef.current.fired = false;
    const hit = resolvePick(event.object, partsByName);
    gestureRef.current.pendingHit = hit;
    const part = hit && "part" in hit ? hit.part : null;
    holdRef.current.timer = window.setTimeout(() => {
      gestureRef.current.fired = true;
      if (part) {
        onLongPress?.(part);
      }
    }, HOLD_MS);
  }

  function handlePointerUp(event: ThreeEvent<PointerEvent>) {
    clearHold();
    if (!isTap(event)) {
      return;
    }
    onPick(gestureRef.current.pendingHit);
  }

  function setHovered(hit: ViewerPart | UnmatchedMesh | null) {
    if (hoverMatches(hoveredRef.current, hit)) {
      return;
    }
    hoveredRef.current = hit;
    refreshHighlights();
  }

  function handlePointerOver(event: ThreeEvent<PointerEvent>) {
    if (
      gestureRef.current.dragging ||
      event.nativeEvent.pointerType === "touch"
    ) {
      return;
    }
    const hit = resolvePick(event.object, partsByName);
    if (!hit) {
      setHovered(null);
      return;
    }
    setHovered("part" in hit ? hit.part : hit);
  }

  function handlePointerOut(event: ThreeEvent<PointerEvent>) {
    if (
      gestureRef.current.dragging ||
      event.nativeEvent.pointerType === "touch"
    ) {
      return;
    }
    setHovered(null);
  }

  return (
    <>
      <ExpandCameraFar object={scene} />
      <primitive
        object={scene}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
      />
    </>
  );
}

function ViewerGestureTracker({
  gestureRef,
  onDragStart,
  onOrbitEngage,
}: {
  gestureRef: MutableRefObject<ViewerGesture>;
  onDragStart: () => void;
  onOrbitEngage: () => void;
}) {
  const { gl } = useThree();
  const onDragStartRef = useRef(onDragStart);
  onDragStartRef.current = onDragStart;
  const onOrbitEngageRef = useRef(onOrbitEngage);
  onOrbitEngageRef.current = onOrbitEngage;

  useEffect(() => {
    const canvas = gl.domElement;
    const gesture = gestureRef.current;

    function markDragging() {
      if (gesture.dragging) {
        return;
      }
      gesture.dragging = true;
      gesture.moved = true;
      onDragStartRef.current();
    }

    function onCanvasPointerDown(event: PointerEvent) {
      onOrbitEngageRef.current();
      gesture.dragging = false;
      gesture.moved = false;
      gesture.fired = false;
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.pointerId = event.pointerId;
    }

    function onCanvasWheel() {
      onOrbitEngageRef.current();
    }

    function onCanvasPointerMove(event: PointerEvent) {
      if (event.pointerId !== gesture.pointerId) {
        return;
      }
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        markDragging();
      }
    }

    function onCanvasPointerEnd(event: PointerEvent) {
      if (event.pointerId !== gesture.pointerId) {
        return;
      }
      gesture.pointerId = -1;
      gesture.dragging = false;
    }

    canvas.addEventListener("pointerdown", onCanvasPointerDown);
    canvas.addEventListener("pointermove", onCanvasPointerMove);
    canvas.addEventListener("pointerup", onCanvasPointerEnd);
    canvas.addEventListener("pointercancel", onCanvasPointerEnd);
    canvas.addEventListener("wheel", onCanvasWheel, { passive: true });

    return () => {
      canvas.removeEventListener("pointerdown", onCanvasPointerDown);
      canvas.removeEventListener("pointermove", onCanvasPointerMove);
      canvas.removeEventListener("pointerup", onCanvasPointerEnd);
      canvas.removeEventListener("pointercancel", onCanvasPointerEnd);
      canvas.removeEventListener("wheel", onCanvasWheel);
    };
  }, [gl, gestureRef]);

  return null;
}

function CaptureBridge({
  parts,
  onCaptureReady,
}: {
  parts: ViewerPart[];
  onCaptureReady?: (capture: (partId: string) => string | null) => void;
}) {
  const { gl, scene, camera } = useThree();
  const partsByName = useMemo(() => buildPartIndex(parts), [parts]);

  useEffect(() => {
    if (!onCaptureReady) {
      return;
    }
    onCaptureReady((partId) => {
      const meshes: Mesh[] = [];
      scene.traverse((object) => {
        if (!isMesh(object)) {
          return;
        }
        if (partIdForObject(object, partsByName) === partId) {
          meshes.push(object);
        }
      });
      if (meshes.length === 0) {
        return null;
      }

      const keep = new Set<Object3D>(meshes);
      for (const mesh of meshes) {
        let node: Object3D | null = mesh.parent;
        while (node) {
          keep.add(node);
          node = node.parent;
        }
      }
      const hidden: Object3D[] = [];
      scene.traverse((object) => {
        if (!object.visible || object === scene || keep.has(object)) {
          return;
        }
        object.visible = false;
        hidden.push(object);
      });

      const bounds = new Box3();
      for (const mesh of meshes) {
        bounds.expandByObject(mesh);
      }
      const center = bounds.getCenter(new Vector3());
      const size = bounds.getSize(new Vector3());
      const radius = Math.max(size.x, size.y, size.z, 0.25) * 1.7;
      const prevPos = camera.position.clone();
      const prevQuat = camera.quaternion.clone();
      camera.position.set(center.x + radius, center.y + radius * 0.72, center.z + radius);
      camera.lookAt(center);
      camera.updateMatrixWorld();
      gl.render(scene, camera);
      let url: string | null = null;
      try {
        url = gl.domElement.toDataURL("image/jpeg", 0.78);
      } catch {
        url = null;
      }
      camera.position.copy(prevPos);
      camera.quaternion.copy(prevQuat);
      camera.updateMatrixWorld();
      for (const object of hidden) {
        object.visible = true;
      }
      gl.render(scene, camera);
      return url;
    });
  }, [camera, gl, onCaptureReady, partsByName, scene]);

  return null;
}

function modelLoadMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    if (/failed to load model/i.test(error.message)) {
      return "The 3D file could not be downloaded. Check your connection and try again.";
    }
    return `The 3D model could not be shown. ${error.message}`;
  }
  return "The 3D model could not be shown. The file may be too large or invalid.";
}

function ViewerStatus({
  children,
  role = "status",
}: {
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <div
      role={role}
      className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--spares-stage)]/82 px-6 text-center"
    >
      <p className="max-w-sm text-sm leading-relaxed text-[#e8eef6]">{children}</p>
    </div>
  );
}

function ExpandCameraFar({ object }: { object: Object3D }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    box.setFromObject(object);
    if (box.isEmpty()) {
      return;
    }
    const size = box.getSize(localCenter).length();
    const dist = camera.position.distanceTo(box.getCenter(worldCenter));
    const needed = Math.max(size, dist) * 8;
    if (Number.isFinite(needed) && needed > camera.far) {
      camera.far = needed;
      camera.near = Math.min(camera.near, Math.max(needed / 100_000, 0.01));
      camera.updateProjectionMatrix();
    }
  }, [camera, object]);
  return null;
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
  onCaptureReady,
}: {
  src: string;
  parts: ViewerPart[];
  selected: ViewerPart | UnmatchedMesh | null;
  explode: number;
  hiddenIds: readonly string[];
  isolatedId: string | null;
  onPick: (hit: { part: ViewerPart } | UnmatchedMesh | null) => void;
  onLongPress?: (part: ViewerPart) => void;
  onCaptureReady?: (capture: (partId: string) => string | null) => void;
}) {
  const [orbitEnabled, setOrbitEnabled] = useState(false);
  const gestureRef = useRef<ViewerGesture>({
    dragging: false,
    moved: false,
    fired: false,
    startX: 0,
    startY: 0,
    pointerId: -1,
    pendingHit: null,
  });
  const cancelHoldRef = useRef<(() => void) | null>(null);
  const clearHoverRef = useRef<(() => void) | null>(null);
  const [load, setLoad] = useState<{
    status: "loading" | "ready" | "error";
    message?: string;
  }>({ status: "loading" });

  useEffect(() => {
    setOrbitEnabled(false);
  }, [src]);

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
    loadGltfWithCredentials(src)
      .then(() => {
        if (!cancelled) {
          setLoad({ status: "ready" });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoad({ status: "error", message: modelLoadMessage(error) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <>
      {load.status === "loading" ? (
        <ViewerStatus>
          Loading the 3D model… Large packs can take a minute.
        </ViewerStatus>
      ) : null}
      {load.status === "error" ? (
        <ViewerStatus role="alert">
          {load.message ?? "The 3D model could not be shown."}
        </ViewerStatus>
      ) : null}
    <Canvas
      camera={{ position: [2.8, 1.9, 2.5], fov: 40, near: 0.05, far: 8000 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => {
        const gesture = gestureRef.current;
        if (!gesture.dragging && !gesture.moved) {
          onPick(null);
        }
      }}
      style={{ touchAction: "none" }}
    >
      <color attach="background" args={[VIEWER_BG]} />
      <ViewerGestureTracker
        gestureRef={gestureRef}
        onOrbitEngage={() => setOrbitEnabled(true)}
        onDragStart={() => {
          clearHoverRef.current?.();
          cancelHoldRef.current?.();
        }}
      />
      <CaptureBridge parts={parts} onCaptureReady={onCaptureReady} />
      <hemisphereLight args={["#e8eef6", "#1a1f26", 0.95]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[4, 8, 3]} intensity={1.2} />
      <directionalLight position={[-3.5, 2.4, -4]} intensity={0.42} />
      <directionalLight position={[0, 6, -2]} intensity={0.28} />
      <StudioGround />
      {load.status === "ready" ? (
        <Suspense fallback={null}>
        <Bounds fit clip observe margin={1.3}>
          <LoadedModel
            src={src}
            parts={parts}
            selected={selected}
            explode={explode}
            hiddenIds={hiddenIds}
            isolatedId={isolatedId}
            gestureRef={gestureRef}
            onPick={onPick}
            onLongPress={onLongPress}
            onRegisterCancelHold={(cancelHold) => {
              cancelHoldRef.current = cancelHold;
            }}
            onRegisterClearHover={(clearHover) => {
              clearHoverRef.current = clearHover;
            }}
          />
        </Bounds>
        </Suspense>
      ) : null}
      <OrbitControls
        makeDefault
        enabled={orbitEnabled}
        enableDamping={orbitEnabled}
        enablePan
        enableRotate
        enableZoom
      />
    </Canvas>
    </>
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
  onCaptureReady,
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
    <div
      className={`relative ${className ?? ""}`}
      style={{ height: "100%", minHeight: 0 }}
    >
      <ViewerCanvas
        src={src}
        parts={parts}
        selected={selected}
        explode={explode}
        hiddenIds={hiddenIds}
        isolatedId={isolatedId}
        onPick={handlePick}
        onLongPress={onLongPress}
        onCaptureReady={onCaptureReady}
      />
    </div>
  );
}
