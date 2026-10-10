"use client";

import { useBounds } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { PerspectiveCamera } from "three";
import {
  applyOrbitSnapshot,
  snapshotOrbit,
  syncRendererViewport,
  uprightDefaultOrbit,
  type ViewerOrbitSnapshot,
} from "./viewer-viewport";

type ViewerCameraOwnerProps = {
  layoutRootRef: RefObject<HTMLDivElement | null>;
  fitKey: number;
  resetKey: number;
  assemblyKey: string;
  modelSrc: string;
};

export function ViewerCameraOwner({
  layoutRootRef,
  fitKey,
  resetKey,
  assemblyKey,
  modelSrc,
}: ViewerCameraOwnerProps) {
  const bounds = useBounds();
  const { gl, camera, invalidate } = useThree();
  const controls = useThree((state) => state.controls as OrbitControlsImpl | null);
  const initialPose = useRef<ViewerOrbitSnapshot | null>(null);
  const initialCaptured = useRef(false);
  const lastResetKey = useRef(0);
  const lastModelSrc = useRef(modelSrc);

  const readSize = useCallback(() => {
    const root = layoutRootRef.current;
    if (!root) {
      return null;
    }
    const width = root.clientWidth;
    const height = root.clientHeight;
    if (width < 1 || height < 1) {
      return null;
    }
    return { width, height };
  }, [layoutRootRef]);

  const syncViewport = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera)) {
      return false;
    }
    const size = readSize();
    if (!size) {
      return false;
    }
    syncRendererViewport(gl, camera, size.width, size.height);
    invalidate();
    return true;
  }, [camera, gl, invalidate, readSize]);

  const refitBounds = useCallback(
    (captureInitial: boolean) => {
      if (!(camera instanceof PerspectiveCamera) || !controls) {
        return;
      }
      if (!syncViewport()) {
        return;
      }
      bounds.refresh().clip().fit();
      uprightDefaultOrbit(camera, controls.target);
      controls.update();
      if (captureInitial && !initialCaptured.current) {
        initialPose.current = snapshotOrbit(camera, controls.target);
        initialCaptured.current = true;
      }
      invalidate();
    },
    [bounds, camera, controls, invalidate, syncViewport],
  );

  useLayoutEffect(() => {
    if (lastModelSrc.current !== modelSrc) {
      lastModelSrc.current = modelSrc;
      initialPose.current = null;
      initialCaptured.current = false;
    }
  }, [modelSrc]);

  useLayoutEffect(() => {
    refitBounds(!initialCaptured.current);
  }, [assemblyKey, fitKey, refitBounds]);

  useLayoutEffect(() => {
    if (resetKey === 0 || resetKey === lastResetKey.current) {
      return;
    }
    lastResetKey.current = resetKey;
    if (!(camera instanceof PerspectiveCamera) || !controls || !initialPose.current) {
      return;
    }
    syncViewport();
    applyOrbitSnapshot(camera, controls.target, initialPose.current);
    controls.update();
    invalidate();
  }, [camera, controls, invalidate, resetKey, syncViewport]);

  useLayoutEffect(() => {
    const root = layoutRootRef.current;
    if (!root) {
      return;
    }
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!(camera instanceof PerspectiveCamera) || !controls) {
          return;
        }
        if (!syncViewport()) {
          return;
        }
        bounds.refresh().clip().fit();
        uprightDefaultOrbit(camera, controls.target);
        controls.update();
        invalidate();
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [bounds, camera, controls, invalidate, layoutRootRef, syncViewport]);

  useLayoutEffect(() => {
    function onFullscreenChange() {
      requestAnimationFrame(() => {
        refitBounds(false);
      });
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [refitBounds]);

  useLayoutEffect(() => {
    const root = layoutRootRef.current;
    if (!root) {
      return;
    }
    const blockWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !root.contains(target)) {
        return;
      }
      event.preventDefault();
    };
    root.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    return () => root.removeEventListener("wheel", blockWheel, { capture: true });
  }, [layoutRootRef]);

  return null;
}
