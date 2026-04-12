// @env browser

import { gsap } from "gsap";

export type LensPointerState = {
  x: number;
  y: number;
  hasPointer: boolean;
};

type LensPointerListener = (state: LensPointerState) => void;

const OFFSCREEN_POINTER = -1000;
const state: LensPointerState = {
  x: OFFSCREEN_POINTER,
  y: OFFSCREEN_POINTER,
  hasPointer: false,
};
const listeners = new Set<LensPointerListener>();
let isInitialized = false;
let removeListeners: null | (() => void) = null;

export function ensureLensPointerTracking(): void {
  if (isInitialized) {
    return;
  }

  isInitialized = true;

  const quickX = gsap.quickTo(state, "x", { duration: 0.3, ease: "power2.out" });
  const quickY = gsap.quickTo(state, "y", { duration: 0.3, ease: "power2.out" });

  function updateRootVariables(): void {
    document.documentElement.style.setProperty("--lens-viewport-x", `${state.x}px`);
    document.documentElement.style.setProperty("--lens-viewport-y", `${state.y}px`);

    listeners.forEach((listener) => {
      listener(state);
    });
  }

  function handlePointerMove(event: PointerEvent): void {
    state.hasPointer = true;
    quickX(event.clientX);
    quickY(event.clientY);
  }

  function handlePointerLeave(): void {
    state.hasPointer = false;
    quickX(OFFSCREEN_POINTER);
    quickY(OFFSCREEN_POINTER);
  }

  document.addEventListener("pointermove", handlePointerMove, { passive: true });
  document.addEventListener("pointerleave", handlePointerLeave);
  window.addEventListener("blur", handlePointerLeave);
  gsap.ticker.add(updateRootVariables);
  updateRootVariables();

  removeListeners = () => {
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerleave", handlePointerLeave);
    window.removeEventListener("blur", handlePointerLeave);
    gsap.ticker.remove(updateRootVariables);
  };
}

export function subscribeToLensPointer(listener: LensPointerListener): () => void {
  ensureLensPointerTracking();
  listeners.add(listener);
  listener(state);

  return () => {
    listeners.delete(listener);
  };
}

export function destroyLensPointerTracking(): void {
  if (!isInitialized) {
    return;
  }

  removeListeners?.();
  removeListeners = null;
  listeners.clear();
  isInitialized = false;
}
