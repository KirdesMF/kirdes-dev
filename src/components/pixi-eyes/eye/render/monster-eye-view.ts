import { clamp, lerpColor } from "../../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "../eye-state";
import { SCLERA_RADIUS, IRIS_RADIUS, MAX_LOOK, MAX_SQUASH } from "../eye-config";

export function applyMonsterEyeAppearance(eye: EyeInstance, runtime: EyeFieldRuntime): void {
  const rawIrisX = eye.lookX * runtime.roundTranslateStrength;
  const rawIrisY = eye.lookY * runtime.roundTranslateStrength;
  const rawIrisDistance = Math.hypot(rawIrisX, rawIrisY);
  const maxIrisOffset = SCLERA_RADIUS - IRIS_RADIUS - 0.5;

  let irisCompression = 1;
  if (rawIrisDistance > maxIrisOffset * 0.95) {
    const t = (rawIrisDistance - maxIrisOffset * 0.95) / (maxIrisOffset * 0.05);
    irisCompression = 1 - Math.min(t, 1) * 0.2;
  }

  const irisX = rawIrisX * irisCompression;
  const irisY = rawIrisY * irisCompression;

  eye.eyeFill.tint = runtime.eyeShapeColor;
  eye.iris.visible = true;
  eye.iris.position.set(irisX, irisY);
  eye.iris.scale.set(eye.currentScaleX, eye.currentScaleY);
  eye.iris.rotation = (eye.currentAngle * Math.PI) / 180;

  eye.pupil.visible = true;
  eye.pupil.tint = lerpColor(0xffffff, 0x050505, eye.irisProximity);
  eye.pupil.position.set(irisX, irisY);
  eye.pupil.scale.set(
    eye.currentScaleX * runtime.slitPupilWidth * 2.5,
    eye.currentScaleY * runtime.slitPupilHeight * 1.05,
  );
  eye.pupil.rotation = 0;

  eye.highlight.visible = false;
  eye.highlight2.visible = false;
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

export function updateMonsterEyeDeformation(eye: EyeInstance, _eyeSeconds: number): void {
  const lookDistance = Math.hypot(eye.lookX, eye.lookY);
  const squeezeT = clamp(lookDistance / MAX_LOOK, 0, 1);

  eye.currentScaleX = 1 - squeezeT * MAX_SQUASH;
  eye.currentScaleY = 1 + squeezeT * MAX_SQUASH * 0.5;

  const lookAngle = eye.lookX !== 0 || eye.lookY !== 0 ? Math.atan2(eye.lookY, eye.lookX) : 0;
  eye.currentAngle = (lookAngle * 180) / Math.PI;
}
