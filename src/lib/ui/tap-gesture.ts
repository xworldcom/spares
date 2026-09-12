import type { PointerEvent as ReactPointerEvent } from "react";

/** Match PartPicker 3D tap slop — movement beyond this is scroll/drag, not tap. */
export const TAP_SLOP_PX = 4;

type TapGesture = {
  startX: number;
  startY: number;
  moved: boolean;
  pointerId: number;
};

function createTapGesture(): TapGesture {
  return { startX: 0, startY: 0, moved: false, pointerId: -1 };
}

function slopExceeded(gesture: TapGesture, clientX: number, clientY: number) {
  const dx = clientX - gesture.startX;
  const dy = clientY - gesture.startY;
  return dx * dx + dy * dy > TAP_SLOP_PX * TAP_SLOP_PX;
}

export function tapActivateHandlers(
  gesture: TapGesture,
  onTap: () => void,
): {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
} {
  function reset() {
    gesture.pointerId = -1;
    gesture.moved = false;
  }

  function finish(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerId !== gesture.pointerId) {
      return;
    }
    if (!gesture.moved) {
      onTap();
    }
    reset();
  }

  return {
    onPointerDown(event) {
      if (event.button !== 0) {
        return;
      }
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.moved = false;
      gesture.pointerId = event.pointerId;
    },
    onPointerMove(event) {
      if (event.pointerId !== gesture.pointerId || gesture.moved) {
        return;
      }
      if (slopExceeded(gesture, event.clientX, event.clientY)) {
        gesture.moved = true;
      }
    },
    onPointerUp: finish,
    onPointerCancel: reset,
    onClick(event) {
      // Keyboard activation only — pointer path handles mouse/touch.
      if (event.detail !== 0) {
        event.preventDefault();
        return;
      }
      onTap();
    },
  };
}

export { createTapGesture };
