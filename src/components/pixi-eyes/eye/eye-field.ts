// Main eye field module - orchestrates eye field creation and updates

import { Container, Rectangle, type Renderer } from "pixi.js";

import type { EyeFieldConfig, EyeFieldMetrics } from "./eye-types";
import type { EyeFieldRuntime } from "./eye-state";
import {
  createSharedContexts,
  createSharedTextures,
  createDropShadowTexture,
  destroySharedTextures,
  destroySharedContexts,
  resolveTextureResolutionProfile,
  selectBucket,
} from "./eye-assets";
import { packEyePositions, resolvePackedRadii, staggerDelay } from "./layout";
import { DEFAULT_EYE_SPIRAL_OFFSET } from "./eye-config";
import { createEyeInstance } from "./eye-factory";
import { startLayoutTransition, applyStaticEyeSettings, updateSingleEye } from "./eye-controller";
import { sampleSharedAttentionTarget, sampleSharedAttentionDelay } from "./behaviors/eye-tracking";
import { smoothTowards } from "../shared/math";
import { updateConfig, applyAppearanceRefresh } from "./eye-field-config";
import { createRuntime } from "./eye-field-runtime";

type EyeFieldOptions = {
  count: number;
  renderer: Renderer;
  worldBounds: Rectangle;
};

export type EyeField = {
  root: Container;
  layout: (width: number, height: number) => void;
  syncCount: (nextCount: number) => void;
  setConfig: (config: EyeFieldConfig) => void;
  setPointer: (x: number, y: number, isActive: boolean) => void;
  pointerDown: (x: number, y: number) => void;
  update: (dtSeconds: number) => EyeFieldMetrics;
  destroy: () => void;
  _runtime: EyeFieldRuntime;
};

export function createEyeField({ count, renderer, worldBounds }: EyeFieldOptions): EyeField {
  const root = new Container();
  const runtime = createRuntime(count);
  const contexts = createSharedContexts();
  const getMaxEyeRadius = () => Math.max(runtime.maxEyeSize * 0.5, 1);
  let textures = createSharedTextures(renderer, contexts, runtime.dropShadowBlur, getMaxEyeRadius());

  function refreshDynamicTextures(): void {
    const nextProfile = resolveTextureResolutionProfile(renderer.resolution, getMaxEyeRadius());
    const shouldRebuildTextures = Object.entries(nextProfile).some(
      ([bucket, resolution]) => textures.profile[bucket as keyof typeof nextProfile] !== resolution,
    );

    if (shouldRebuildTextures) {
      destroySharedTextures(textures);
      textures = createSharedTextures(renderer, contexts, runtime.dropShadowBlur, getMaxEyeRadius());
      return;
    }

    for (const [bucketName, bucket] of Object.entries(textures.buckets)) {
      bucket.dropShadowTexture.destroy(true);
      bucket.dropShadowTexture = createDropShadowTexture(
        renderer,
        runtime.dropShadowBlur,
        textures.profile[bucketName as keyof typeof textures.profile],
      );
    }
    runtime.eyes.forEach((eye) => {
      eye.dropShadow.texture = textures.buckets[selectBucket(eye.radius)].dropShadowTexture;
    });
  }

  function rebuildEyes(): void {
    runtime.eyes.forEach((eye) => eye.root.destroy({ children: true }));
    runtime.eyes = [];
    root.removeChildren();
    const minEyeRadius = runtime.minEyeSize * 0.5;
    const maxEyeRadius = runtime.maxEyeSize * 0.5;
    refreshDynamicTextures();
    const radii = resolvePackedRadii(runtime.count, minEyeRadius, maxEyeRadius);
    const layoutJitter = runtime.layoutJitter;

    const positions = packEyePositions(
      radii,
      runtime.clusterRadius,
      runtime.packAttempts,
      runtime.spiralStepDegrees,
      runtime.radialExponent,
      DEFAULT_EYE_SPIRAL_OFFSET,
      runtime.layoutShape,
      layoutJitter,
      runtime.ringInnerRatio,
      runtime.crossType,
      runtime.starBranches,
    );

    positions.forEach((position, index) => {
      const eye = createEyeInstance(
        textures,
        position.x,
        position.y,
        position.r,
        maxEyeRadius,
        positions.length,
        index + 1,
        runtime.dotEyeMix,
      );
      eye.delay = staggerDelay(
        index + 1,
        positions.length,
        runtime.staggerSeconds,
        runtime.randomizeStagger,
      );
      applyStaticEyeSettings(eye, runtime);
      runtime.eyes.push(eye);
      root.addChild(eye.root);
      // Start with full scale - no scale-in animation
      eye.root.scale.set(eye.renderScale);
      eye.scaleInFinished = true;
    });
    root.sortChildren();
  }

  function relayoutEyes(): void {
    if (runtime.eyes.length === 0) {
      return;
    }

    const layoutJitter = runtime.layoutJitter;
    const positions = packEyePositions(
      runtime.eyes.map((eye) => eye.radius),
      runtime.clusterRadius,
      runtime.packAttempts,
      runtime.spiralStepDegrees,
      runtime.radialExponent,
      DEFAULT_EYE_SPIRAL_OFFSET,
      runtime.layoutShape,
      layoutJitter,
      runtime.ringInnerRatio,
      runtime.crossType,
      runtime.starBranches,
    );

    positions.forEach((position, index) => {
      const eye = runtime.eyes[index];
      if (!eye) {
        return;
      }

      startLayoutTransition(eye, position.x, position.y, runtime.layoutTransitionDuration);
    });
  }

  function layout(width: number, height: number): void {
    runtime.clusterRadius = Math.min(width, height) * 0.42;
    root.position.set(width * 0.5, height * 0.5);
    if (runtime.eyes.length === runtime.count && runtime.eyes.length > 0) {
      relayoutEyes();
      return;
    }

    rebuildEyes();
  }

  function syncCount(nextCount: number): void {
    runtime.count = Math.max(0, Math.floor(nextCount));
    rebuildEyes();
  }

  function setConfig(config: EyeFieldConfig): void {
    const result = updateConfig(runtime, config);

    if (result.shouldRefreshDropShadowTexture) {
      refreshDynamicTextures();
    }

    if (result.shouldRebuild) {
      rebuildEyes();
    } else if (result.shouldRelayout) {
      relayoutEyes();
    } else if (result.shouldRefreshAppearance) {
      applyAppearanceRefresh(runtime);
    }
  }

  function setPointer(x: number, y: number, isActive: boolean): void {
    if (root.destroyed) {
      return;
    }

    if (!isActive) {
      runtime.pointerActive = false;
      return;
    }

    const nextTargetMouseX = x - root.position.x;
    const nextTargetMouseY = y - root.position.y;

    const movedDistance = Math.hypot(
      nextTargetMouseX - runtime.targetMouseX,
      nextTargetMouseY - runtime.targetMouseY,
    );
    const isNewPointerSession = !runtime.pointerActive;

    if (isNewPointerSession) {
      runtime.trackingBlend = 0;
      runtime.sharedAttentionBlend = 0;
      runtime.sharedAttentionX = 0;
      runtime.sharedAttentionY = 0;
      // Don't reset mouseX/Y - let them smooth towards target naturally
      // This prevents jump when mouse re-enters canvas
      runtime.targetMouseX = nextTargetMouseX;
      runtime.targetMouseY = nextTargetMouseY;
      runtime.eyes.forEach((eye) => {
        eye.parallaxX = 0;
        eye.parallaxY = 0;
        eye.repelX = 0;
        eye.repelY = 0;
        eye.lookX = 0;
        eye.lookY = 0;
        eye.currentScaleX = 1;
        eye.currentScaleY = 1;
        eye.currentAngle = 0;
        eye.needsAppearanceRefresh = true;
        eye.appearanceAccumulator = eye.appearanceUpdateInterval;
      });
    }

    if (isNewPointerSession || movedDistance > 0.5) {
      runtime.lastPointerMoveAt = runtime.elapsed;
      runtime.nextSharedAttentionAt = runtime.elapsed + runtime.sharedAttentionDelay;
    }

    runtime.pointerActive = true;
    runtime.targetMouseX = nextTargetMouseX;
    runtime.targetMouseY = nextTargetMouseY;
  }

  function pointerDown(x: number, y: number): void {
    if (root.destroyed) {
      return;
    }

    setPointer(x, y, true);
  }

  function update(dtSeconds: number): EyeFieldMetrics {
    runtime.elapsed += Math.max(dtSeconds, 0);
    const trackingTarget = runtime.pointerActive ? 1 : 0;
    runtime.trackingBlend = smoothTowards(
      runtime.trackingBlend,
      trackingTarget,
      runtime.trackingBlendSpeed,
      dtSeconds,
    );
    runtime.mouseX = smoothTowards(
      runtime.mouseX,
      runtime.targetMouseX,
      runtime.pointerEaseSpeed,
      dtSeconds,
    );
    runtime.mouseY = smoothTowards(
      runtime.mouseY,
      runtime.targetMouseY,
      runtime.pointerEaseSpeed,
      dtSeconds,
    );
    const sharedAttentionIdle =
      runtime.elapsed - runtime.lastPointerMoveAt >= runtime.sharedAttentionDelay;

    if (sharedAttentionIdle && runtime.elapsed >= runtime.nextSharedAttentionAt) {
      const nextTarget = sampleSharedAttentionTarget(runtime);
      runtime.sharedAttentionX = nextTarget.x;
      runtime.sharedAttentionY = nextTarget.y;
      runtime.nextSharedAttentionAt = runtime.elapsed + sampleSharedAttentionDelay(runtime);
    }

    runtime.sharedAttentionBlend = smoothTowards(
      runtime.sharedAttentionBlend,
      sharedAttentionIdle ? 1 : 0,
      runtime.sharedAttentionBlendSpeed,
      dtSeconds,
    );

    let visibleCount = 0;

    runtime.eyes.forEach((eye) => {
      updateSingleEye(eye, runtime, worldBounds, dtSeconds);

      // Filter eyes for ring shape - hide eyes near center
      if (eye.root.visible && runtime.layoutShape === "ring") {
        const minRadius = runtime.clusterRadius * runtime.ringInnerRatio;
        const distanceFromCenter = Math.sqrt(eye.x * eye.x + eye.y * eye.y);
        eye.root.visible = distanceFromCenter >= minRadius;
      }

      if (eye.root.visible) {
        visibleCount += 1;
      }
    });

    return {
      visibleCount,
    };
  }

  rebuildEyes();

  return {
    root,
    layout,
    syncCount,
    setConfig,
    setPointer,
    pointerDown,
    update,
    _runtime: runtime,
    destroy: () => {
      if (root.destroyed) {
        return;
      }

      root.destroy({ children: true });
      destroySharedTextures(textures);
      destroySharedContexts(contexts);
    },
  };
}
