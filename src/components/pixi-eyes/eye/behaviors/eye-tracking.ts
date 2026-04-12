// Eye tracking behavior (micro-saccades removed)

import { clamp, lerp, hash01, smoothstep } from "../../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "../eye-state";
import { MAX_LOOK } from "../eye-config";

export function pupilFollowSpeed(runtime: EyeFieldRuntime, eye: EyeInstance): number {
  const smallSpeed = Math.max(runtime.smallEyeLookSpeed, 0);
  const largeSpeed = Math.max(runtime.largeEyeLookSpeed, 0);
  const t = clamp(eye.scale, 0, 1);
  return smallSpeed + (largeSpeed - smallSpeed) * t;
}

export function totalOffset(eye: EyeInstance): { x: number; y: number } {
  return {
    x: eye.parallaxX + eye.repelX,
    y: eye.parallaxY + eye.repelY,
  };
}

export function sampleSharedAttentionTarget(runtime: EyeFieldRuntime): { x: number; y: number } {
  const seed =
    runtime.elapsed * 0.731 +
    runtime.lastPointerMoveAt * 1.913 +
    runtime.mouseX * 0.017 +
    runtime.mouseY * 0.023;
  const angle = hash01(seed) * Math.PI * 2;
  const magnitude = MAX_LOOK * lerp(0.8, 1.0, hash01(seed * 2.417 + 0.31));

  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude,
  };
}

export function sampleSharedAttentionDelay(runtime: EyeFieldRuntime): number {
  const seed =
    runtime.elapsed * 1.271 +
    runtime.lastPointerMoveAt * 0.617 +
    runtime.sharedAttentionX * 0.11 +
    runtime.sharedAttentionY * 0.13;

  return lerp(
    runtime.sharedAttentionRetargetMinDelay,
    runtime.sharedAttentionRetargetMaxDelay,
    hash01(seed),
  );
}

export function sampleEyeSharedAttentionLook(
  runtime: EyeFieldRuntime,
  eye: EyeInstance,
  mode: "scattered" | "unified",
): { x: number; y: number } {
  const baseAngle =
    Math.abs(runtime.sharedAttentionX) > 0.001 || Math.abs(runtime.sharedAttentionY) > 0.001
      ? Math.atan2(runtime.sharedAttentionY, runtime.sharedAttentionX)
      : eye.focusCycleOffset * Math.PI * 2;
  const baseMagnitude = Math.hypot(runtime.sharedAttentionX, runtime.sharedAttentionY);

  if (mode === "unified") {
    return {
      x: Math.cos(baseAngle) * baseMagnitude,
      y: Math.sin(baseAngle) * baseMagnitude,
    };
  }

  const eyeSeed =
    runtime.sharedAttentionX * 0.173 +
    runtime.sharedAttentionY * 0.191 +
    eye.focusCycleOffset * 11.417 +
    eye.x * 0.0031 +
    eye.y * 0.0023;
  const angleSpread = lerp(-Math.PI * 0.9, Math.PI * 0.9, hash01(eyeSeed));
  const angle = baseAngle + angleSpread;
  const magnitude = MAX_LOOK * lerp(0.8, 1.0, smoothstep(hash01(eyeSeed * 2.137 + 0.41)));

  return {
    x: Math.cos(angle) * magnitude,
    y: Math.sin(angle) * magnitude,
  };
}

export function clickWaveTarget(
  _runtime: EyeFieldRuntime,
  _eye: EyeInstance,
): { x: number; y: number } {
  // Click wave effect removed
  return { x: 0, y: 0 };
}
