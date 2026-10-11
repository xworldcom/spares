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
import { PerspectiveCamera, Vector3 } from "three";
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
  viewerFullscreen: boolean;
  assemblyKey: string;
  modelSrc: string;
};

const MIN_LAYOUT_PX = 80;
const STABLE_FRAMES = 3;
const READY_PAINT_FRAMES = 5;
const FIT_MARGIN = 1.3;
const FIT_MARGIN_PHONE = 1.48;
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

  const fitMargin = useCallback(() => {
    const layout = readSize();
    if (layout && layout.width < 480) {
      return FIT_MARGIN_PHONE;
    }
    return FIT_MARGIN;
  }, [readSize]);

  const fitModelInView = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls) {
      return false;
    }
    bounds.refresh();
    if (!boundsHasGeometry(bounds)) {
      return false;
    }
    const margin = fitMargin();
    const { center, distance, size } = bounds.getSize();
    const sphereRadius = size.length() * 0.5;
    const vFovRad = (camera.fov * Math.PI) / 180;
    const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * camera.aspect);
    const sphereDistV = sphereRadius / Math.sin(vFovRad / 2);
    const sphereDistH = sphereRadius / Math.sin(hFovRad / 2);
    const sphereDistance = Math.max(sphereDistV, sphereDistH) * margin;
    const fitDistance = Math.max(distance, sphereDistance);
    const direction = new Vector3().subVectors(camera.position, controls.target);
    if (direction.lengthSq() < 1e-8) {
      direction.set(1, 0.75, 1);
    }
    direction.normalize();
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(direction, fitDistance);
    uprightDefaultOrbit(camera, controls.target);
    controls.update();
    return true;
  }, [bounds, camera, controls, fitMargin]);

  const refitToContainer = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls) {
      return false;
    }
    if (!syncViewport()) {
      return false;
    }
    if (canonicalPose.current) {
      const damping = controls.enableDamping;
      controls.enableDamping = false;
      applyOrbitSnapshot(camera, controls.target, canonicalPose.current);
      controls.enableDamping = damping;
    }
    if (!fitModelInView()) {
      return false;
    }
    controls.update();
    invalidate();
    return true;
  }, [camera, controls, fitModelInView, invalidate, syncViewport]);

  const performRefit = useCallback(() => {
    if (canonicalPose.current) {
      refitToContainer();
      return;
    }
    if (!syncViewport()) {
      return;
    }
    if (!fitModelInView()) {
      return;
    }
    invalidate();
  }, [fitModelInView, invalidate, refitToContainer, syncViewport]);

  const applyCanonical = useCallback(() => {
    if (!(camera instanceof PerspectiveCamera) || !controls || !canonicalPose.current) {
      return false;
    }
    if (!syncViewport()) {
      return false;
    }
    const damping = controls.enableDamping;
    controls.enableDamping = false;
    if (!applyOrbitSnapshot(camera, controls.target, canonicalPose.current)) {
      controls.enableDamping = damping;
      return false;
    }
    controls.update();
    controls.enableDamping = damping;
    invalidate();
    return true;
  }, [camera, controls, invalidate, syncViewport]);

  const refitAfterFullscreenExit = useCallback(() => {
    if (!applyCanonical()) {
      return;
    }
    let frame = 0;
    const settle = () => {
      frame += 1;
      if (frame < 3) {
        requestAnimationFrame(settle);
        return;
      }
      syncViewport();
      applyCanonical();
      invalidate();
    };
    requestAnimationFrame(settle);
  }, [applyCanonical, invalidate, syncViewport]);

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
        const damping = orbit.enableDamping;
        orbit.enableDamping = false;
        applyOrbitSnapshot(perspective, orbit.target, snap);
        orbit.update();
        orbit.enableDamping = damping;
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
      return canonicalReady.current;
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
    return canonicalReady.current;
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
        refitToContainer();
        return;
      }
      if (canonicalReady.current) {
        refitAfterFullscreenExit();
      }
    }
    frame = requestAnimationFrame(step);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [refitAfterFullscreenExit, refitToContainer, syncViewport, viewerFullscreen]);

  useLayoutEffect(() => {
    function onFullscreenChange() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!syncViewport()) {
              return;
            }
            if (document.fullscreenElement) {
              refitToContainer();
              return;
            }
            if (canonicalReady.current) {
              refitAfterFullscreenExit();
            }
          });
        });
      });
    }
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, [refitAfterFullscreenExit, refitToContainer, syncViewport]);

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
