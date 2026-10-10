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
  fitPerspectiveToBoundsBox,
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
  viewerFullscreen: boolean;
  assemblyKey: string;
  modelSrc: string;
};

const MIN_LAYOUT_PX = 80;
const STABLE_FRAMES = 3;
const READY_PAINT_FRAMES = 5;
const FIT_MARGIN = 1.3;
const MIN_BOUNDS_EXTENT = 0.02;

function boundsHasGeometry(bounds: ReturnType<typeof useBounds>) {
  const { size } = bounds.getSize();
  return size.length() >= MIN_BOUNDS_EXTENT;
}

export function ViewerCameraOwner({
  layoutRootRef,
  fitKey,
  resetKey,
  viewerFullscreen,
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
  const lastFitKey = useRef(fitKey);
  const lastAssemblyKey = useRef(assemblyKey);

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

  const fitModelInView = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls) {
      return false;
    }
    bounds.refresh();
    if (!boundsHasGeometry(bounds)) {
      return false;
    }
    const { size, center } = bounds.getSize();
    if (!fitPerspectiveToBoundsBox(camera, controls.target, size, center, FIT_MARGIN)) {
      return false;
    }
    uprightDefaultOrbit(camera, controls.target);
    controls.update();
    return true;
  }, [bounds, camera, controls]);

  const performRefit = useCallback(() => {
    if (!syncViewport()) {
      return;
    }
    if (!fitModelInView()) {
      return;
    }
    invalidate();
  }, [fitModelInView, invalidate, syncViewport]);

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

  const commitCanonicalReady = useCallback(
    (snap: ViewerOrbitSnapshot) => {
      if (!(camera instanceof PerspectiveCamera) || !controls) {
        return;
      }
      const perspective = camera;
      const orbit = controls;
      let alive = true;
      let pass = 0;
      function paint() {
        if (!alive) {
          return;
        }
        if (!syncViewport()) {
          requestAnimationFrame(paint);
          return;
        }
        applyOrbitSnapshot(perspective, orbit.target, snap);
        orbit.update();
        invalidate();
        pass += 1;
        if (pass < READY_PAINT_FRAMES) {
          requestAnimationFrame(paint);
          return;
        }
        canonicalReady.current = true;
        setCanonicalReadyFlag(true);
      }
      requestAnimationFrame(paint);
      return () => {
        alive = false;
      };
    },
    [camera, controls, invalidate, setCanonicalReadyFlag, syncViewport],
  );

  const captureCanonical = useCallback(() => {
    if (canonicalPose.current) {
      return true;
    }
    if (!(camera instanceof PerspectiveCamera) || !controls) {
      return false;
    }
    if (!syncViewport()) {
      return false;
    }
    if (!fitModelInView()) {
      return false;
    }
    invalidate();
    if (!fitModelInView()) {
      return false;
    }
    const snap = snapshotOrbit(camera, controls.target);
    if (!isValidOrbitSnapshot(snap)) {
      return false;
    }
    canonicalPose.current = snap;
    commitCanonicalReady(snap);
    return true;
  }, [camera, commitCanonicalReady, controls, fitModelInView, invalidate, syncViewport]);

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

    requestAnimationFrame(tick);
    return () => {
      alive = false;
    };
  }, [captureCanonical, modelSrc, readSize]);

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
        if (!syncViewport()) {
          return;
        }
        if (canonicalReady.current) {
          applyCanonical();
          return;
        }
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
    let alive = true;
    let frame = 0;
    let pass = 0;
    function step() {
      if (!alive) {
        return;
      }
      pass += 1;
      if (pass < 4) {
        frame = requestAnimationFrame(step);
        return;
      }
      if (!syncViewport()) {
        return;
      }
      if (viewerFullscreen) {
        performRefit();
        return;
      }
      if (canonicalReady.current) {
        applyCanonical();
      }
    }
    frame = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [applyCanonical, performRefit, syncViewport, viewerFullscreen]);

  useLayoutEffect(() => {
    function onFullscreenChange() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!syncViewport()) {
              return;
            }
            if (document.fullscreenElement) {
              performRefit();
              invalidate();
              return;
            }
            if (canonicalReady.current) {
              applyCanonical();
            }
          });
        });
      });
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [applyCanonical, performRefit, syncViewport]);

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
