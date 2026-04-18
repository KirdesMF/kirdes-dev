// Dot eye rendering - minimalist design with small dot pupil

import { clamp } from "../../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "../eye-state";
import { SCLERA_RADIUS, IRIS_RADIUS, MAX_LOOK, MAX_SQUASH } from "../eye-config";

export function applyDotEyeAppearance(eye: EyeInstance, runtime: EyeFieldRuntime): void {
  const irisScale = 1.0;
  const effectiveIrisRadius = IRIS_RADIUS * irisScale;

  // Calculate raw iris position - iris should reach sclera boundary
  // Reduced movement for dot eyes (70% of normal) to keep pupil more centered
  const rawIrisX = eye.lookX * runtime.roundTranslateStrength * 0.7;
  const rawIrisY = eye.lookY * runtime.roundTranslateStrength * 0.7;
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

  // Pupil dot moves with the iris (centered on iris)
  // Clamp pupil position to stay inside the globe
  const pupilX = irisX;
  const pupilY = irisY;
  const pupilOffsetDist = Math.sqrt(pupilX * pupilX + pupilY * pupilY);
  const maxPupilOffset = SCLERA_RADIUS - IRIS_RADIUS * runtime.dotPupilRatio - 1;

  if (pupilOffsetDist > maxPupilOffset) {
    const scale = maxPupilOffset / pupilOffsetDist;
    eye.pupil.position.set(pupilX * scale, pupilY * scale);
  } else {
    eye.pupil.position.set(pupilX, pupilY);
  }

  // Note: eyeFill.tint is set in eye-controller.ts for mouse proximity color effect

  eye.iris.position.set(irisX, irisY);
  eye.iris.scale.set(eye.currentScaleX * irisScale, eye.currentScaleY * irisScale);
  // Rotate iris to align squeeze with look direction (same as human eye)
  eye.iris.rotation = (eye.currentAngle * Math.PI) / 180;

  // Pupil dot is centered on iris, scaled by dotPupilRatio
  eye.pupil.position.set(pupilX, pupilY);
  const dotScale = runtime.dotPupilRatio / 0.15; // Normalize to default ratio

  // Apply squeeze to pupil scale to keep it inside the globe
  const squeezedScaleX = dotScale * eye.currentScaleX;
  const squeezedScaleY = dotScale * eye.currentScaleY;

  eye.pupil.scale.set(squeezedScaleX, squeezedScaleY);
  // Rotate pupil with iris to align with look direction
  eye.pupil.rotation = (eye.currentAngle * Math.PI) / 180;

  // No highlight for minimalist look - now using cartoon-style highlights
  eye.highlight.visible = true;
  eye.highlight2.visible = true;

  // Position main highlight (larger)
  eye.highlight.position.set(pupilX - IRIS_RADIUS * 0.3, pupilY - IRIS_RADIUS * 0.3);
  eye.highlight.scale.set(2.0); // Large highlight for cartoon effect

  // Position secondary highlight (smaller, slightly closer to main)
  eye.highlight2.position.set(pupilX + IRIS_RADIUS * 0.15, pupilY + IRIS_RADIUS * 0.15);
  eye.highlight2.scale.set(1.3); // Smaller but still visible for cartoon effect

  eye.eyeShadow.position.set(0, 0);
  eye.eyeShadow.scale.set(1);
  eye.eyeShadow.rotation = 0;

  eye.globeHighlight.position.set(runtime.roundHighlightOffsetX, runtime.roundHighlightOffsetY);
  eye.globeHighlight.scale.set(runtime.roundHighlightScale);
  eye.globeHighlight.rotation = (runtime.roundHighlightRotationDegrees * Math.PI) / 180;
  eye.globeHighlight.alpha = runtime.roundHighlightOpacity;
  eye.globeHighlight.tint = runtime.roundHighlightColor;

  eye.needsAppearanceRefresh = false;
}

export function updateDotEyeDeformation(eye: EyeInstance, _eyeSeconds: number): void {
  // Calculate squeeze based on distance from center (radial)
  const lookDistance = Math.sqrt(eye.lookX * eye.lookX + eye.lookY * eye.lookY);
  const squeezeT = clamp(lookDistance / MAX_LOOK, 0, 1);

  // Same squeeze pattern as human eyes but lighter (40% strength)
  // Human: X = 1 - squeezeT * 0.2, Y = 1 + squeezeT * 0.2 * 0.5
  // Dot:   X = 1 - squeezeT * 0.08, Y = 1 + squeezeT * 0.08 * 0.5
  const dotSquash = MAX_SQUASH * 0.4; // 40% of human eye squeeze
  eye.currentScaleX = 1 - squeezeT * dotSquash;
  eye.currentScaleY = 1 + squeezeT * dotSquash * 0.5;

  // Calculate look angle for rotation (same as human eye)
  // This rotates the squeeze to align with the look direction
  const lookAngle = eye.lookX !== 0 || eye.lookY !== 0 ? Math.atan2(eye.lookY, eye.lookX) : 0;

  // Store the rotation angle for the iris sprite
  eye.currentAngle = (lookAngle * 180) / Math.PI;
}
