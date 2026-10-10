"use client";

import { useBounds } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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
  isValidOrbitSnapshot,
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

const MIN_LAYOUT_PX = 80;
const STABLE_FRAMES = 2;

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
  const canonicalPose = useRef<ViewerOrbitSnapshot | null>(null);
  const canonicalReady = useRef(false);
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
    return syncRendererViewport(gl, camera, size.width, size.height);
  }, [camera, gl, readSize]);

  const performRefit = useCallback(() => {
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
  }, [bounds, camera, controls, invalidate, syncViewport]);

  const applyCanonical = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls || !canonicalPose.current) {
      return false;
    }
    if (!syncViewport()) {
      return false;
    }
    if (!applyOrbitSnapshot(camera, controls.target, canonicalPose.current)) {
      return false;
    }
    controls.update();
    invalidate();
    return true;
  }, [camera, controls, invalidate, syncViewport]);

  const captureCanonical = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls) {
      return false;
    }
    if (!syncViewport()) {
      return false;
    }
    bounds.refresh().clip().fit();
    uprightDefaultOrbit(camera, controls.target);
    controls.update();
    const snap = snapshotOrbit(camera, controls.target);
    if (!isValidOrbitSnapshot(snap)) {
      return false;
    }
    canonicalPose.current = snap;
    canonicalReady.current = true;
    invalidate();
    return true;
  }, [bounds, camera, controls, invalidate, syncViewport]);

  useLayoutEffect(() => {
    if (lastModelSrc.current !== modelSrc) {
      lastModelSrc.current = modelSrc;
      canonicalPose.current = null;
      canonicalReady.current = false;
    }
  }, [modelSrc]);

  useLayoutEffect(() => {
    let alive = true;
    let stable = 0;
    let lastW = 0;
    let lastH = 0;

    function tick() {
      if (!alive || canonicalReady.current) {
        return;
      }
      const size = readSize();
      if (!size || size.width < MIN_LAYOUT_PX || size.height < MIN_LAYOUT_PX) {
        requestAnimationFrame(tick);
        return;
      }
      if (size.width === lastW && size.height === lastH) {
        stable += 1;
      } else {
        stable = 0;
        lastW = size.width;
        lastH = size.height;
      }
      if (stable < STABLE_FRAMES) {
        requestAnimationFrame(tick);
        return;
      }
      if (!captureCanonical()) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [modelSrc, captureCanonical, readSize]);

  useLayoutEffect(() => {
    if (!canonicalReady.current) {
      return;
    }
    performRefit();
  }, [assemblyKey, fitKey, performRefit]);

  useLayoutEffect(() => {
    if (resetKey === 0 || resetKey === lastResetKey.current) {
      return;
    }
    lastResetKey.current = resetKey;
    applyCanonical();
  }, [applyCanonical, resetKey]);

  useLayoutEffect(() => {
    const root = layoutRootRef.current;
    if (!root) {
      return;
    }
    let frame = 0;
    const onResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (canonicalReady.current) {
          applyCanonical();
          return;
        }
        syncViewport();
        invalidate();
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [applyCanonical, invalidate, layoutRootRef, syncViewport]);

  useLayoutEffect(() => {
    function onFullscreenChange() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (canonicalReady.current) {
            applyCanonical();
            return;
          }
          captureCanonical();
        });
      });
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [applyCanonical, captureCanonical]);

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
