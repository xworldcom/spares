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
const LAYOUT_DRIFT_RATIO = 0.05;

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
  const capturedLayoutSize = useRef<{ width: number; height: number } | null>(null);
  const lastResetKey = useRef(0);
  const lastModelSrc = useRef(modelSrc);
  const lastFitKey = useRef(fitKey);
  const lastAssemblyKey = useRef(assemblyKey);
  const restartCaptureRef = useRef<(() => void) | null>(null);

  const setCanonicalReadyFlag = useCallback(
    (ready: boolean) => {
      const root = layoutRootRef.current;
      if (!root) {
        return;
      }
      if (ready) {
        root.setAttribute("data-viewer-canonical-ready", "true");
      } else {
        root.removeAttribute("data-viewer-canonical-ready");
      }
    },
    [layoutRootRef],
  );

  const clearCanonical = useCallback(() => {
    canonicalPose.current = null;
    canonicalReady.current = false;
    capturedLayoutSize.current = null;
    setCanonicalReadyFlag(false);
  }, [setCanonicalReadyFlag]);

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
    const size = readSize();
    canonicalPose.current = snap;
    canonicalReady.current = true;
    if (size) {
      capturedLayoutSize.current = { width: size.width, height: size.height };
    }
    setCanonicalReadyFlag(true);
    invalidate();
    return true;
  }, [bounds, camera, controls, invalidate, readSize, setCanonicalReadyFlag, syncViewport]);

  useLayoutEffect(() => {
    if (lastModelSrc.current !== modelSrc) {
      lastModelSrc.current = modelSrc;
      clearCanonical();
    }
  }, [clearCanonical, modelSrc]);

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

    function restartCapture() {
      if (!alive) {
        return;
      }
      clearCanonical();
      stable = 0;
      lastW = 0;
      lastH = 0;
      requestAnimationFrame(tick);
    }

    restartCaptureRef.current = restartCapture;
    requestAnimationFrame(tick);
    return () => {
      alive = false;
      restartCaptureRef.current = null;
    };
  }, [captureCanonical, clearCanonical, modelSrc, readSize]);

  useLayoutEffect(() => {
    const fitChanged = fitKey !== lastFitKey.current;
    const assemblyChanged = assemblyKey !== lastAssemblyKey.current;
    lastFitKey.current = fitKey;
    lastAssemblyKey.current = assemblyKey;
    if (!canonicalReady.current || (!fitChanged && !assemblyChanged)) {
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
        const size = readSize();
        if (canonicalReady.current && size && capturedLayoutSize.current) {
          const prev = capturedLayoutSize.current;
          const drifted =
            Math.abs(size.width - prev.width) > prev.width * LAYOUT_DRIFT_RATIO ||
            Math.abs(size.height - prev.height) > prev.height * LAYOUT_DRIFT_RATIO;
          if (drifted) {
            restartCaptureRef.current?.();
            syncViewport();
            invalidate();
            return;
          }
          applyCanonical();
          return;
        }
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
  }, [applyCanonical, invalidate, layoutRootRef, readSize, syncViewport]);

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
