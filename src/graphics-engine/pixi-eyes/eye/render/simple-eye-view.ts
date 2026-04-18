import { clamp } from "../../shared/math";
import type { EyeInstance, EyeFieldRuntime } from "../eye-state";
import { SCLERA_RADIUS, IRIS_RADIUS, MAX_LOOK, MAX_SQUASH } from "../eye-config";

export function applySimpleEyeAppearance(eye: EyeInstance, runtime: EyeFieldRuntime): void {
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
  eye.iris.tint = 0x050505;
  eye.iris.position.set(irisX, irisY);
  eye.iris.scale.set(eye.currentScaleX * 1.02, eye.currentScaleY * 1.02);
  eye.iris.rotation = (eye.currentAngle * Math.PI) / 180;

  eye.highlight2.visible = true;
  eye.highlight2.position.set(irisX, irisY);
  eye.highlight2.scale.set(eye.currentScaleX * 0.9, eye.currentScaleY * 0.9);
  eye.highlight2.rotation = (eye.currentAngle * Math.PI) / 180;

  eye.pupil.visible = true;
  eye.pupil.tint = 0x050505;
  eye.pupil.position.set(irisX, irisY);
  eye.pupil.scale.set(eye.currentScaleX * 0.58, eye.currentScaleY * 0.58);
  eye.pupil.rotation = (eye.currentAngle * Math.PI) / 180;

  eye.highlight.visible = true;
  eye.highlight.position.set(irisX, irisY);
  eye.highlight.scale.set(eye.currentScaleX * 0.7, eye.currentScaleY * 0.7);
  eye.highlight.rotation = (eye.currentAngle * Math.PI) / 180;
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

export function updateSimpleEyeDeformation(eye: EyeInstance, _eyeSeconds: number): void {
  const lookDistance = Math.hypot(eye.lookX, eye.lookY);
  const squeezeT = clamp(lookDistance / MAX_LOOK, 0, 1);

  eye.currentScaleX = 1 - squeezeT * MAX_SQUASH;
  eye.currentScaleY = 1 + squeezeT * MAX_SQUASH * 0.5;

  const lookAngle = eye.lookX !== 0 || eye.lookY !== 0 ? Math.atan2(eye.lookY, eye.lookX) : 0;
  eye.currentAngle = (lookAngle * 180) / Math.PI;
}
