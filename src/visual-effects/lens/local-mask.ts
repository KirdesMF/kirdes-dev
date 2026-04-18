// @env browser

import { subscribeToLensPointer, type LensPointerState } from "./pointer-state";

export type BindLocalLensMaskOptions = {
  container: HTMLElement;
  target?: HTMLElement;
  mode?: "always" | "hover";
  radiusPx?: number;
};

const OFFSCREEN_POINTER = -1000;

export function bindLocalLensMask({
  container,
  target = container,
  mode = "hover",
  radiusPx,
}: BindLocalLensMaskOptions): () => void {
  let isActive = mode === "always";

  if (typeof radiusPx === "number") {
    target.style.setProperty("--lens-mask-radius", `${radiusPx}px`);
  }

  function applyPointerState(pointerState: LensPointerState): void {
    if (!isActive || !pointerState.hasPointer) {
      target.style.setProperty("--lens-local-x", `${OFFSCREEN_POINTER}px`);
      target.style.setProperty("--lens-local-y", `${OFFSCREEN_POINTER}px`);
      return;
    }

    const rect = container.getBoundingClientRect();
    const relativeX = pointerState.x - rect.left;
    const relativeY = pointerState.y - rect.top;

    target.style.setProperty("--lens-local-x", `${relativeX}px`);
    target.style.setProperty("--lens-local-y", `${relativeY}px`);
  }

  function handlePointerEnter(): void {
    isActive = true;
  }

  function handlePointerLeave(): void {
    if (mode === "always") {
      return;
    }

    isActive = false;
    target.style.setProperty("--lens-local-x", `${OFFSCREEN_POINTER}px`);
    target.style.setProperty("--lens-local-y", `${OFFSCREEN_POINTER}px`);
  }

  const unsubscribe = subscribeToLensPointer(applyPointerState);

  if (mode === "hover") {
    container.addEventListener("pointerenter", handlePointerEnter);
    container.addEventListener("pointerleave", handlePointerLeave);
  }

  return () => {
    unsubscribe();
    container.removeEventListener("pointerenter", handlePointerEnter);
    container.removeEventListener("pointerleave", handlePointerLeave);
  };
}
