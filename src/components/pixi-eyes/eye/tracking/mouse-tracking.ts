// Mouse/pointer tracking for eyes

export type MouseTrackingState = {
  x: number;
  y: number;
  isInside: boolean;
};

export type MouseTrackingCallbacks = {
  onPointerUpdate: (x: number, y: number, isInside: boolean) => void;
  onPointerDown: (x: number, y: number) => void;
};

export type MouseTracking = {
  state: MouseTrackingState;
  updatePointerFromEvent: (event: PointerEvent) => void;
  handlePointerMove: (event: PointerEvent) => void;
  handlePointerEnter: (event: PointerEvent) => void;
  handlePointerDown: (event: PointerEvent) => void;
  handlePointerLeave: () => void;
  destroy: () => void;
};

/**
 * Creates a mouse tracking instance.
 */
export function createMouseTracking(
  canvas: HTMLCanvasElement,
  callbacks: MouseTrackingCallbacks,
  initialX: number,
  initialY: number,
): MouseTracking {
  const state: MouseTrackingState = {
    x: initialX,
    y: initialY,
    isInside: false,
  };

  const updatePointerFromEvent = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    state.x = event.clientX - rect.left;
    state.y = event.clientY - rect.top;
  };

  const handlePointerMove = (event: PointerEvent) => {
    updatePointerFromEvent(event);
    callbacks.onPointerUpdate(state.x, state.y, true);
  };

  const handlePointerEnter = (event: PointerEvent) => {
    updatePointerFromEvent(event);
    state.isInside = true;
    callbacks.onPointerUpdate(state.x, state.y, true);
  };

  const handlePointerDown = (event: PointerEvent) => {
    updatePointerFromEvent(event);
    callbacks.onPointerDown(state.x, state.y);
  };

  const handlePointerLeave = () => {
    state.isInside = false;
    callbacks.onPointerUpdate(state.x, state.y, false);
  };

  canvas.addEventListener("pointerenter", handlePointerEnter);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointerleave", handlePointerLeave);

  return {
    state,
    updatePointerFromEvent,
    handlePointerMove,
    handlePointerEnter,
    handlePointerDown,
    handlePointerLeave,
    destroy: () => {
      canvas.removeEventListener("pointerenter", handlePointerEnter);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
    },
  };
}
