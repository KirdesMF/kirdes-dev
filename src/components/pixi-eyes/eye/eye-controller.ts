// Eye controller - update logic for individual eyes

import { Rectangle } from "pixi.js";

import { clamp, lerp, smoothstep, smoothTowards, lerpColor } from "../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "./eye-state";
import { SCLERA_RADIUS, MAX_LOOK } from "./eye-config";
import {
  totalOffset,
  sampleEyeSharedAttentionLook,
  pupilFollowSpeed,
} from "./behaviors/eye-tracking";
import { updateFloatingBehavior } from "./behaviors/eye-floating";
import { resolveScaleInProgress } from "./eye-factory";
import {
  applyHumanPupilAppearance,
  updateHumanPupilScale,
  updateHumanEyeDeformation,
} from "./render/human-eye-view";
import { applyDotEyeAppearance, updateDotEyeDeformation } from "./render/dot-eye-view";

export function updateLayoutTransition(
  eye: EyeInstance,
  runtime: EyeFieldRuntime,
  dtSeconds: number,
): void {
  if (!eye.layoutTransitionActive) {
    return;
  }

  const duration = Math.max(runtime.layoutTransitionDuration, 0.001);
  eye.layoutTransitionElapsed = Math.min(eye.layoutTransitionElapsed + dtSeconds, duration);
  const progress = clamp(eye.layoutTransitionElapsed / duration, 0, 1);
  const easedProgress = smoothstep(progress);
  eye.x = lerp(eye.layoutStartX, eye.targetX, easedProgress);
  eye.y = lerp(eye.layoutStartY, eye.targetY, easedProgress);

  if (progress >= 0.999) {
    eye.x = eye.targetX;
    eye.y = eye.targetY;
    eye.layoutTransitionActive = false;
  }
}

export function startLayoutTransition(
  eye: EyeInstance,
  nextX: number,
  nextY: number,
  duration: number,
): void {
  eye.targetX = nextX;
  eye.targetY = nextY;

  if (duration <= 0.001 || (Math.abs(eye.x - nextX) <= 0.001 && Math.abs(eye.y - nextY) <= 0.001)) {
    eye.x = nextX;
    eye.y = nextY;
    eye.layoutStartX = nextX;
    eye.layoutStartY = nextY;
    eye.layoutTransitionElapsed = duration;
    eye.layoutTransitionActive = false;
    return;
  }

  eye.layoutStartX = eye.x;
  eye.layoutStartY = eye.y;
  eye.layoutTransitionElapsed = 0;
  eye.layoutTransitionActive = true;
}

export function applyStaticEyeSettings(eye: EyeInstance, runtime: EyeFieldRuntime): void {
  eye.dropShadow.tint = runtime.dropShadowColor;
  eye.dropShadow.alpha = runtime.dropShadowOpacity;
  eye.dropShadow.position.set(0, 0);
  eye.dropShadow.scale.set(0.92 + runtime.dropShadowSpread * 0.12);
  eye.eyeShadow.tint = runtime.roundInnerShadowColor;
  eye.eyeShadow.alpha = runtime.shadowOpacity;
  eye.eyeFill.tint = runtime.eyeShapeColor;
  eye.globeHighlight.rotation = (runtime.roundHighlightRotationDegrees * Math.PI) / 180;
  eye.globeHighlight.alpha = runtime.roundHighlightOpacity;
  eye.iris.alpha = 1;
  eye.iris.tint = runtime.irisColor;
  eye.blinkGroup.visible = false;
}

function renderedEyeRadius(eye: EyeInstance): number {
  return SCLERA_RADIUS * Math.max(eye.renderScale, 0.001);
}

export function updateSingleEye(
  eye: EyeInstance,
  runtime: EyeFieldRuntime,
  worldBounds: Rectangle,
  dtSeconds: number,
): void {
  updateLayoutTransition(eye, runtime, dtSeconds);
  eye.appearanceAccumulator += dtSeconds;

  const eyeSeconds = dtSeconds;
  const introScaleProgress = resolveScaleInProgress(eye, runtime.elapsed);

  eye.root.scale.set(eye.renderScale * introScaleProgress, eye.renderScale * introScaleProgress);

  // Update parallax and repulsion
  updateFloatingBehavior(eye, runtime, dtSeconds);

  // No micro-saccade offset - disabled
  const microSaccade = { x: 0, y: 0 };

  const interactionOffset = totalOffset(eye);
  const interactionDrawX = eye.x + interactionOffset.x + microSaccade.x;
  const interactionDrawY = eye.y + interactionOffset.y + microSaccade.y;
  eye.root.position.set(interactionDrawX, interactionDrawY);
  eye.root.rotation = 0;

  const visibleRadius =
    renderedEyeRadius(eye) *
    introScaleProgress *
    Math.max(Math.abs(eye.currentScaleX), Math.abs(eye.currentScaleY), 0.001);
  const drawX = worldBounds.width * 0.5 + interactionDrawX;
  const drawY = worldBounds.height * 0.5 + interactionDrawY;
  const isVisible =
    drawX - visibleRadius < worldBounds.width &&
    drawX + visibleRadius > 0 &&
    drawY - visibleRadius < worldBounds.height &&
    drawY + visibleRadius > 0;

  eye.root.visible = isVisible;

  if (!isVisible) {
    eye.needsAppearanceRefresh = true;
    eye.appearanceAccumulator = eye.appearanceUpdateInterval;
    return;
  }

  const cursorLook =
    runtime.trackingBlend > 0.0001
      ? (() => {
          const rawCursorLook = clampMagnitude(
            (runtime.mouseX - interactionDrawX) / eye.scale,
            (runtime.mouseY - interactionDrawY) / eye.scale,
            MAX_LOOK,
          );

          return {
            x: rawCursorLook.x * runtime.trackingBlend,
            y: rawCursorLook.y * runtime.trackingBlend,
          };
        })()
      : { x: 0, y: 0 };

  const sharedAttentionLook =
    runtime.sharedAttentionBlend > 0.0001
      ? sampleEyeSharedAttentionLook(runtime, eye, runtime.pointerActive ? "scattered" : "unified")
      : { x: 0, y: 0 };

  const desiredLook = {
    x: lerp(cursorLook.x, sharedAttentionLook.x, runtime.sharedAttentionBlend),
    y: lerp(cursorLook.y, sharedAttentionLook.y, runtime.sharedAttentionBlend),
  };

  const lookSpeed = pupilFollowSpeed(runtime, eye);
  eye.lookX = smoothTowards(eye.lookX, desiredLook.x, lookSpeed, eyeSeconds);
  eye.lookY = smoothTowards(eye.lookY, desiredLook.y, lookSpeed, eyeSeconds);

  // Update deformation based on eye type
  if (eye.type === "dot") {
    updateDotEyeDeformation(eye, eyeSeconds);
  } else {
    updateHumanEyeDeformation(eye, eyeSeconds);
  }

  const shouldThrottleAppearance = eye.lowDetail;
  if (
    shouldThrottleAppearance &&
    eye.scaleInFinished &&
    !eye.needsAppearanceRefresh &&
    eye.appearanceAccumulator < eye.appearanceUpdateInterval
  ) {
    return;
  }

  eye.appearanceAccumulator = 0;

  // Update pupil scale animation for human eyes only
  if (eye.type === "human") {
    updateHumanPupilScale(eye, runtime, eyeSeconds);
  }

  // Mouse proximity color effect
  const dx = eye.x - runtime.mouseX;
  const dy = eye.y - runtime.mouseY;
  const distanceToMouse = Math.sqrt(dx * dx + dy * dy);

  // Use a larger radius for the color effect (200px instead of mouseIrisRadius)
  const maxDist = 200; // Larger radius for more visible effect
  const targetProximity = 1 - clamp(distanceToMouse / maxDist, 0, 1);

  const decaySpeed = runtime.mouseIrisDecay;
  if (targetProximity > eye.irisProximity) {
    eye.irisProximity += (targetProximity - eye.irisProximity) * decaySpeed * 3;
  } else {
    eye.irisProximity += (targetProximity - eye.irisProximity) * decaySpeed;
  }
  eye.irisProximity = clamp(eye.irisProximity, 0, 1);

  // Apply color to appropriate element based on eye type
  if (eye.type === "dot") {
    // Dot eye: colored globe with small dot pupil, different mouse proximity color
    const newTint = lerpColor(runtime.dotGlobeColor, runtime.dotMouseColor, eye.irisProximity);
    eye.eyeFill.tint = newTint;
    applyDotEyeAppearance(eye, runtime);
  } else {
    // Human eye: color the iris
    eye.iris.tint = lerpColor(runtime.irisColor, runtime.mouseIrisColor, eye.irisProximity);
    applyHumanPupilAppearance(eye, runtime);
  }
}

function clampMagnitude(x: number, y: number, maxLength: number): { x: number; y: number } {
  const length = Math.hypot(x, y);
  if (length <= maxLength || length <= 0.0001) {
    return { x, y };
  }

  const scale = maxLength / length;
  return { x: x * scale, y: y * scale };
}
