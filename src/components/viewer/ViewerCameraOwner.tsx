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
  type ViewerOrbitSnapshot,
} from "./viewer-viewport";

type ViewerCameraOwnerProps = {
  layoutRootRef: RefObject<HTMLElement | null>;
  fitKey: number;
  resetKey: number;
  assemblyKey: string;
  containFullscreenGestures: boolean;
};

export function ViewerCameraOwner({
  layoutRootRef,
  fitKey,
  resetKey,
  assemblyKey,
  containFullscreenGestures,
}: ViewerCameraOwnerProps) {
  const bounds = useBounds();
  const { gl, camera, invalidate } = useThree();
  const controls = useThree((state) => state.controls as OrbitControlsImpl | null);
  const initialPose = useRef<ViewerOrbitSnapshot | null>(null);
  const lastResetKey = useRef(0);
  const pendingCapture = useRef(false);

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

  const fitAssembly = useCallback(() => {
    if (!syncViewport()) {
      return;
    }
    bounds.refresh().clip().fit();
    pendingCapture.current = initialPose.current === null;
    invalidate();
  }, [bounds, invalidate, syncViewport]);

  const captureInitialPose = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls || initialPose.current) {
      return;
    }
    initialPose.current = snapshotOrbit(camera, controls.target);
    pendingCapture.current = false;
  }, [camera, controls]);

  useFrame(() => {
    if (pendingCapture.current) {
      captureInitialPose();
    }
  });

  useLayoutEffect(() => {
    fitAssembly();
  }, [fitAssembly, fitKey, assemblyKey]);

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
    const onResize = () => {
      fitAssembly();
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(root);
    return () => observer.disconnect();
  }, [fitAssembly, layoutRootRef]);

  useLayoutEffect(() => {
    function onFullscreenChange() {
      requestAnimationFrame(() => {
        fitAssembly();
      });
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [fitAssembly]);

  useLayoutEffect(() => {
    const root = layoutRootRef.current;
    if (!root) {
      return;
    }
    const blockWheel = (event: WheelEvent) => {
      if (!containFullscreenGestures) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node) || !root.contains(target)) {
        return;
      }
      // Keep zoom on the canvas; block browser scroll that drops native fullscreen.
      event.preventDefault();
    };
    root.addEventListener("wheel", blockWheel, { passive: false, capture: true });
    return () => root.removeEventListener("wheel", blockWheel, { capture: true });
  }, [containFullscreenGestures, layoutRootRef]);

  return null;
}
