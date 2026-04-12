// Human (round) eye rendering

import { clamp, smoothstep } from "../../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "../eye-state";
import {
  SCLERA_RADIUS,
  IRIS_RADIUS,
  PUPIL_RADIUS,
  PUPIL_IRIS_RATIO,
  MAX_SQUASH,
  MAX_LOOK,
} from "../eye-config";

export function applyHumanPupilAppearance(eye: EyeInstance, runtime: EyeFieldRuntime): void {
  const variant = humanEyeVariantMetrics();
  const effectiveIrisRadius = IRIS_RADIUS * variant.irisScale;

  // Calculate raw iris position - iris should reach sclera boundary
  const rawIrisX = eye.lookX * runtime.roundTranslateStrength;
  const rawIrisY = eye.lookY * runtime.roundTranslateStrength;
  const rawIrisDist = Math.sqrt(rawIrisX * rawIrisX + rawIrisY * rawIrisY);

  // Max travel: iris edge can reach sclera boundary
  const irisMaxTravel = SCLERA_RADIUS - effectiveIrisRadius - 0.5;

  // Soft compression at very edge (last 5%)
  let irisCompression = 1;
  if (rawIrisDist > irisMaxTravel * 0.95) {
    const t = (rawIrisDist - irisMaxTravel * 0.95) / (irisMaxTravel * 0.05);
    irisCompression = 1 - Math.min(t, 1) * 0.2;
  }

  const irisX = rawIrisX * irisCompression;
  const irisY = rawIrisY * irisCompression;

  // Pupil position relative to iris - travels proportionally with iris
  // This ensures pupil reaches the edge when iris is at the edge
  const pupilRelativeX = irisX * PUPIL_IRIS_RATIO;
  const pupilRelativeY = irisY * PUPIL_IRIS_RATIO;
  const pupilX = irisX + pupilRelativeX;
  const pupilY = irisY + pupilRelativeY;

  eye.iris.position.set(irisX, irisY);
  // Note: iris.tint is set in eye-controller.ts for edge iris color effect
  eye.eyeShadow.position.set(0, 0);
  eye.eyeShadow.scale.set(1);
  eye.eyeShadow.rotation = 0;
  eye.globeHighlight.position.set(runtime.roundHighlightOffsetX, runtime.roundHighlightOffsetY);
  eye.globeHighlight.scale.set(runtime.roundHighlightScale);
  eye.globeHighlight.rotation = (runtime.roundHighlightRotationDegrees * Math.PI) / 180;
  eye.globeHighlight.alpha = runtime.roundHighlightOpacity;
  eye.globeHighlight.tint = runtime.roundHighlightColor;
  eye.iris.scale.set(eye.currentScaleX * variant.irisScale, eye.currentScaleY * variant.irisScale);
  eye.iris.rotation = (eye.currentAngle * Math.PI) / 180;
  eye.pupilGroup.position.set(0, 0);
  eye.pupil.position.set(pupilX, pupilY);

  // Apply pupil scale animation
  eye.pupil.scale.set(eye.currentScaleX * eye.pupilScale, eye.currentScaleY * eye.pupilScale);
  eye.pupil.rotation = (eye.currentAngle * Math.PI) / 180;

  // Highlight - small white circle on pupil (offset from pupil center)
  eye.highlight.visible = true;
  eye.highlight.scale.set(1);
  eye.highlight.position.set(pupilX - PUPIL_RADIUS * 0.3, pupilY - PUPIL_RADIUS * 0.4);

  eye.needsAppearanceRefresh = false;
}

/**
 * Update pupil scale animation: natural pupil breathing
 * At rest: scale = 1.0 (pupil appears bigger)
 * During animation: dips to 0.70 then returns to 1.0
 * More natural timing with variable delays
 */
export function updateHumanPupilScale(
  eye: EyeInstance,
  runtime: EyeFieldRuntime,
  _eyeSeconds: number,
): void {
  // Animation timing - more natural variation
  const DIP_DURATION = 0.3; // Slower dip for more natural look
  const RETURN_DURATION = 0.4; // Even slower return
  const MIN_DELAY = 2.5; // Longer minimum delay
  const MAX_DELAY = 5.0; // Longer maximum delay

  // Calculate animation cycle with smooth transitions
  const delay = MIN_DELAY + eye.focusDelayMix * (MAX_DELAY - MIN_DELAY);
  const cycle = delay + DIP_DURATION + RETURN_DURATION;
  const cycleTime = (runtime.elapsed + eye.focusCycleOffset * cycle) % cycle;

  // Determine current phase
  if (cycleTime < delay) {
    // At rest: full size pupil with subtle pulse
    const restTime = cycleTime / delay;
    const subtlePulse = Math.sin(restTime * Math.PI * 2) * 0.02; // ±2% subtle breathing
    eye.pupilScale = 1.0 + subtlePulse;
  } else if (cycleTime < delay + DIP_DURATION) {
    // Dipping down - smooth acceleration
    const t = (cycleTime - delay) / DIP_DURATION;
    const eased = smoothstep(t); // Smooth S-curve
    eye.pupilScale = 1.0 - eased * 0.3; // 1.0 → 0.70
  } else if (cycleTime < cycle) {
    // Returning up - smooth deceleration
    const t = (cycleTime - delay - DIP_DURATION) / RETURN_DURATION;
    const eased = smoothstep(t); // Smooth S-curve
    eye.pupilScale = 0.7 + eased * 0.3; // 0.70 → 1.0
  } else {
    eye.pupilScale = 1.0;
  }
}

export function updateHumanEyeDeformation(eye: EyeInstance, _eyeSeconds: number): void {
  // Calculate squeeze based on distance from center (radial)
  const lookDistance = Math.sqrt(eye.lookX * eye.lookX + eye.lookY * eye.lookY);
  const squeezeT = clamp(lookDistance / MAX_LOOK, 0, 1);

  // Base squeeze: compress along X axis, expand along Y axis
  // The iris rotation will align this with the look direction
  eye.currentScaleX = 1 - squeezeT * MAX_SQUASH;
  eye.currentScaleY = 1 + squeezeT * MAX_SQUASH * 0.5;

  // Calculate look angle for rotation (instant, no smoothing)
  const lookAngle = eye.lookX !== 0 || eye.lookY !== 0 ? Math.atan2(eye.lookY, eye.lookX) : 0;

  // Store the rotation angle for the iris sprite
  eye.currentAngle = (lookAngle * 180) / Math.PI;
}

export function updateHumanEyeFocusPulse(
  _eye: EyeInstance,
  _runtime: EyeFieldRuntime,
  _isScrollFallLocked: boolean,
): void {
  // Disabled - replaced by pupilScale animation in applyHumanPupilAppearance
}

function humanEyeVariantMetrics(): { irisScale: number; pupilClipRadius: number } {
  return {
    irisScale: 1,
    pupilClipRadius: PUPIL_RADIUS,
  };
}
