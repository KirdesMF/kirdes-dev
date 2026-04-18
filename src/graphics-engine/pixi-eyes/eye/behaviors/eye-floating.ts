// Eye floating behavior (parallax and repulsion)

import { clamp, smoothTowards } from "../../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "../eye-state";
import { clickWaveTarget } from "./eye-tracking";

export function updateFloatingBehavior(
  eye: EyeInstance,
  runtime: EyeFieldRuntime,
  dtSeconds: number,
): void {
  const parallax = calculateParallaxOffset(runtime, eye);
  eye.parallaxX = parallax.x;
  eye.parallaxY = parallax.y;

  const targetRepel = calculateRepulsionTarget(runtime, eye);
  const waveRepel = clickWaveTarget(runtime, eye);
  const targetX = targetRepel.x + waveRepel.x;
  const targetY = targetRepel.y + waveRepel.y;

  // Use different speeds for push vs return
  // Push (moving away from center): fast, responsive
  // Return (moving back to center): slow, creates trail effect
  const isPushing =
    Math.abs(targetX) > Math.abs(eye.repelX) || Math.abs(targetY) > Math.abs(eye.repelY);
  const speed = isPushing ? runtime.repulsionPushSpeed : runtime.repulsionReturnSpeed;

  eye.repelX = smoothTowards(eye.repelX, targetX, speed, dtSeconds);
  eye.repelY = smoothTowards(eye.repelY, targetY, speed, dtSeconds);
}

function calculateParallaxOffset(
  runtime: EyeFieldRuntime,
  eye: EyeInstance,
): { x: number; y: number } {
  const weight = runtime.trackingBlend;
  if (weight <= 0.0001) {
    return { x: 0, y: 0 };
  }

  const radius = Math.max(runtime.clusterRadius, 1);
  const normalizedX = clamp(runtime.mouseX / radius, -1, 1);
  const normalizedY = clamp(runtime.mouseY / radius, -1, 1);
  const distance = runtime.parallaxStrength * eye.scale * weight;

  return { x: -normalizedX * distance, y: -normalizedY * distance };
}

function calculateRepulsionTarget(
  runtime: EyeFieldRuntime,
  eye: EyeInstance,
): { x: number; y: number } {
  const weight = runtime.trackingBlend;
  if (weight <= 0.0001) {
    return { x: 0, y: 0 };
  }

  const mouseRadius = Math.max(runtime.repulsionRadius, 0);
  if (mouseRadius <= 0) {
    return { x: 0, y: 0 };
  }

  const baseX = eye.x + eye.parallaxX;
  const baseY = eye.y + eye.parallaxY;
  const dx = baseX - runtime.mouseX;
  const dy = baseY - runtime.mouseY;
  const distanceSquared = dx * dx + dy * dy;
  const reach = mouseRadius + eye.radius;

  if (distanceSquared >= reach * reach) {
    return { x: 0, y: 0 };
  }

  const pushStrength = Math.max(runtime.repulsionStrength, 0);
  if (pushStrength <= 0) {
    return { x: 0, y: 0 };
  }

  if (distanceSquared > 0.0001) {
    const distance = Math.sqrt(distanceSquared);
    const overlap = reach - distance;
    const push = overlap * pushStrength * weight;
    return { x: (dx / distance) * push, y: (dy / distance) * push };
  }

  return { x: reach * pushStrength * weight, y: 0 };
}
