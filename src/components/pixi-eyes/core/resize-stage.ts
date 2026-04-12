// Stage resize handling

import type { Rectangle } from "pixi.js";

export type ResizeStageOptions = {
  worldBounds: Rectangle;
  mountNode: HTMLElement;
  onResize: (width: number, height: number) => void;
};

export type ResizeHandler = {
  resize: () => void;
  destroy: () => void;
};

/**
 * Creates a resize handler for the stage.
 */
export function createResizeHandler({
  worldBounds,
  mountNode,
  onResize,
}: ResizeStageOptions): ResizeHandler {
  const resizeObserver = new ResizeObserver(() => {
    resize();
  });

  const resize = () => {
    worldBounds.width = mountNode.clientWidth;
    worldBounds.height = mountNode.clientHeight;
    onResize(worldBounds.width, worldBounds.height);
  };

  resizeObserver.observe(mountNode);

  return {
    resize,
    destroy: () => {
      resizeObserver.disconnect();
    },
  };
}
