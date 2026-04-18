// Create Pixi Application

import { Application } from "pixi.js";

export type CreateAppOptions = {
  mountNode: HTMLElement;
  resolution?: number;
  antialias?: boolean;
  backgroundAlpha?: number;
};

/**
 * Creates and initializes a Pixi Application.
 */
export async function createApp({
  mountNode,
  resolution = Math.min(window.devicePixelRatio || 1, 2),
  antialias = true,
  backgroundAlpha = 0,
}: CreateAppOptions): Promise<Application> {
  const app = new Application();

  await app.init({
    antialias,
    autoDensity: true,
    backgroundAlpha,
    preference: "webgl",
    resolution,
    resizeTo: mountNode,
    powerPreference: "high-performance",
  });

  mountNode.appendChild(app.canvas);

  return app;
}
