"use client";

import { OrbitControls, useGLTF } from "@react-three/drei";
import { StudioGround } from "@/components/viewer/StudioGround";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Box3,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Object3D,
} from "three";
import { workflowMeshNameMatchesPart } from "@/lib/ui/landing-demo";

const MODEL = "/placeholders/palletizer-placeholder.glb";
const STAGE = "#07080a";
const HIGHLIGHT = new Color("#38bdf8");
const box = new Box3();
const worldCenter = new Vector3();

function isMesh(object: Object3D): object is Mesh {
  return "isMesh" in object && Boolean((object as Mesh).isMesh);
}

function asMaterials(material: Mesh["material"]) {
  return Array.isArray(material) ? material : [material];
}

function FittedMachine({
  paused,
  spinYaw,
  highlightPartId,
  onPartAnchor,
}: {
  paused: boolean;
  spinYaw?: number;
  highlightPartId?: string | null;
  onPartAnchor?: (point: { x: number; y: number } | null) => void;
}) {
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const { scene } = useGLTF(MODEL);

  const model = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }
      const next = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material
          ? object.material.clone()
          : new MeshStandardMaterial();
      const apply = (material: MeshStandardMaterial) => {
        material.metalness = Math.min(0.72, Math.max(0.28, material.metalness || 0.4));
        material.roughness = Math.min(0.55, material.roughness || 0.38);
        material.envMapIntensity = 1.1;
        material.needsUpdate = true;
      };
      if (Array.isArray(next)) {
        for (const material of next) {
          if (material instanceof MeshStandardMaterial) {
            apply(material);
          }
        }
        object.material = next;
      } else if (next instanceof MeshStandardMaterial) {
        apply(next);
        object.material = next;
      }
    });
    return cloned;
  }, [scene]);

  useLayoutEffect(() => {
    const bounds = new Box3().setFromObject(model);
    const size = bounds.getSize(new Vector3());
    const center = bounds.getCenter(new Vector3());
    model.position.sub(center);
    model.position.y += size.y / 2;
    const longest = Math.max(size.x, size.y, size.z, 1);
    const scale = 2.85 / longest;
    if (root.current) {
      root.current.scale.setScalar(scale);
    }
  }, [model]);

  useLayoutEffect(() => {
    model.traverse((object) => {
      if (!isMesh(object)) {
        return;
      }
      const active = Boolean(
        highlightPartId && workflowMeshNameMatchesPart(object.name, highlightPartId),
      );
      for (const material of asMaterials(object.material)) {
        if (!(material instanceof MeshStandardMaterial)) {
          continue;
        }
        if (active) {
          material.emissive.copy(HIGHLIGHT);
          material.emissiveIntensity = 0.95;
        } else {
          material.emissive.set("#000000");
          material.emissiveIntensity = 0;
        }
        material.needsUpdate = true;
      }
    });
  }, [highlightPartId, model]);

  useFrame((state, delta) => {
    if (!spin.current) {
      return;
    }
    if (spinYaw !== undefined) {
      spin.current.rotation.y = spinYaw;
      spin.current.rotation.x = Math.sin(spinYaw * 0.35) * 0.04;
    } else if (!paused) {
      spin.current.rotation.y += delta * 0.045;
      spin.current.rotation.x = Math.sin(spin.current.rotation.y * 0.35) * 0.04;
    }

    if (!onPartAnchor || !highlightPartId) {
      return;
    }
    let found = false;
    let nearestDist = Number.POSITIVE_INFINITY;
    const nearest = new Vector3();
    model.updateWorldMatrix(true, true);
    model.traverse((object) => {
      if (!isMesh(object) || !workflowMeshNameMatchesPart(object.name, highlightPartId)) {
        return;
      }
      box.setFromObject(object);
      box.getCenter(worldCenter);
      const dist = worldCenter.distanceTo(state.camera.position);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest.copy(worldCenter);
        found = true;
      }
    });
    if (!found) {
      onPartAnchor(null);
      return;
    }
    nearest.project(state.camera);
    onPartAnchor({
      x: (nearest.x * 0.5 + 0.5) * 100,
      y: (-nearest.y * 0.5 + 0.5) * 100,
    });
  });

  return (
    <group ref={root} position={[0.15, -0.15, 0]}>
      <group ref={spin}>
        <primitive object={model} />
      </group>
    </group>
  );
}

function Lights() {
  return (
    <>
      <color attach="background" args={[STAGE]} />
      <fog attach="fog" args={[STAGE, 5.5, 16]} />
      <ambientLight intensity={0.22} color="#d9ddd4" />
      <directionalLight position={[4.2, 6.4, 3.2]} intensity={1.55} color="#fff6e8" />
      <directionalLight position={[-5.5, 1.4, -3.8]} intensity={0.45} color="#7f9bb8" />
      <spotLight position={[0.2, 7.5, 1.2]} angle={0.55} penumbra={0.8} intensity={0.55} color="#f3efe4" />
    </>
  );
}

export function OrbitStage({
  interactive = false,
  spinYaw,
  highlightPartId = null,
  onPartAnchor,
}: {
  interactive?: boolean;
  spinYaw?: number;
  highlightPartId?: string | null;
  onPartAnchor?: (point: { x: number; y: number } | null) => void;
}) {
  const [reduceMotion, setReduceMotion] = useState(true);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  const paused = reduceMotion || dragging || spinYaw !== undefined;

  return (
    <div
      className={interactive ? "landing-stage landing-stage--interactive" : "landing-stage"}
      aria-hidden="true"
    >
      <Canvas
        camera={{
          position: interactive ? [2.35, 1.85, 3.35] : [3.05, 1.55, 4.15],
          fov: interactive ? 38 : 32,
          near: 0.1,
          far: 40,
        }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <Lights />
        <StudioGround />
        <Suspense fallback={null}>
          <FittedMachine
            paused={paused}
            spinYaw={spinYaw}
            highlightPartId={highlightPartId}
            onPartAnchor={onPartAnchor}
          />
        </Suspense>
        {interactive ? (
          <OrbitControls
            enablePan={false}
            enableZoom
            minDistance={2.8}
            maxDistance={7.2}
            autoRotate={false}
            onStart={() => setDragging(true)}
            onEnd={() => setDragging(false)}
          />
        ) : null}
      </Canvas>
    </div>
  );
}

