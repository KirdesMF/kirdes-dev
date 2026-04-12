import type { EyeFieldRuntime } from "./eye-state";
import type { EyeFieldConfig as EyeFieldConfigType } from "./eye-types";

export type UpdateConfigResult = {
  shouldRebuild: boolean;
  shouldRelayout: boolean;
  shouldRefreshAppearance: boolean;
  shouldRefreshDropShadowTexture: boolean;
};

export function updateConfig(
  runtime: EyeFieldRuntime,
  config: EyeFieldConfigType,
): UpdateConfigResult {
  const result: UpdateConfigResult = {
    shouldRebuild: false,
    shouldRelayout: false,
    shouldRefreshAppearance: false,
    shouldRefreshDropShadowTexture: false,
  };

  // Layout config
  if (config.layoutShape !== undefined && config.layoutShape !== runtime.layoutShape) {
    runtime.layoutShape = config.layoutShape;
    result.shouldRelayout = true;
  }
  if (config.layoutTransitionDuration !== undefined) {
    runtime.layoutTransitionDuration = Math.max(config.layoutTransitionDuration, 0);
  }
  if (config.layoutTransitionEase !== undefined) {
    runtime.layoutTransitionEase = config.layoutTransitionEase;
  }
  if (config.layoutJitter !== undefined) {
    runtime.layoutJitter = Math.max(0, Math.min(1, config.layoutJitter));
    result.shouldRelayout = true;
  }
  if (config.layoutShape !== undefined && config.layoutShape !== runtime.layoutShape) {
    runtime.layoutShape = config.layoutShape;
    result.shouldRelayout = true;
  }
  if (config.ringInnerRatio !== undefined) {
    runtime.ringInnerRatio = Math.max(0.2, Math.min(0.8, config.ringInnerRatio));
    result.shouldRelayout = true;
  }
  if (config.crossType !== undefined && config.crossType !== runtime.crossType) {
    runtime.crossType = config.crossType;
    result.shouldRelayout = true;
  }
  if (config.starBranches !== undefined) {
    runtime.starBranches = Math.max(3, Math.min(12, Math.floor(config.starBranches)));
    result.shouldRelayout = true;
  }

  // Eye count and sizes
  if (config.instanceCount !== undefined) {
    runtime.count = Math.max(0, Math.floor(config.instanceCount));
    result.shouldRebuild = true;
  }
  if (config.minEyeSize !== undefined) {
    runtime.minEyeSize = Math.max(config.minEyeSize, 0);
    result.shouldRebuild = true;
  }
  if (config.maxEyeSize !== undefined) {
    runtime.maxEyeSize = Math.max(config.maxEyeSize, 0);
    result.shouldRebuild = true;
  }

  // Repulsion config
  if (config.repulsionRadius !== undefined) {
    runtime.repulsionRadius = Math.max(0, config.repulsionRadius);
  }
  if (config.repulsionPushSpeed !== undefined) {
    runtime.repulsionPushSpeed = Math.max(1, config.repulsionPushSpeed);
  }
  if (config.repulsionReturnSpeed !== undefined) {
    runtime.repulsionReturnSpeed = Math.max(0.1, config.repulsionReturnSpeed);
  }

  // Stagger config
  if (config.staggerSeconds !== undefined) {
    runtime.staggerSeconds = Math.max(0, config.staggerSeconds);
    result.shouldRebuild = true;
  }

  // Shadow config
  if (config.shadowOpacity !== undefined) {
    runtime.shadowOpacity = Math.max(0, Math.min(1, config.shadowOpacity));
    result.shouldRefreshAppearance = true;
  }
  if (config.dropShadowOpacity !== undefined) {
    runtime.dropShadowOpacity = Math.max(0, Math.min(1, config.dropShadowOpacity));
    result.shouldRefreshAppearance = true;
  }
  if (config.dropShadowBlur !== undefined) {
    const nextDropShadowBlur = Math.max(config.dropShadowBlur, 0);
    if (nextDropShadowBlur !== runtime.dropShadowBlur) {
      runtime.dropShadowBlur = nextDropShadowBlur;
      result.shouldRefreshDropShadowTexture = true;
    }
  }
  if (config.dropShadowSpread !== undefined) {
    runtime.dropShadowSpread = Math.max(0, config.dropShadowSpread);
    result.shouldRefreshAppearance = true;
  }

  // Translate strength
  if (config.roundTranslateStrength !== undefined) {
    runtime.roundTranslateStrength = Math.max(0, Math.min(1, config.roundTranslateStrength));
    result.shouldRefreshAppearance = true;
  }

  // Highlight config
  if (config.roundHighlightScale !== undefined) {
    runtime.roundHighlightScale = Math.max(0, config.roundHighlightScale);
    result.shouldRefreshAppearance = true;
  }
  if (config.roundHighlightOffsetX !== undefined) {
    runtime.roundHighlightOffsetX = config.roundHighlightOffsetX;
    result.shouldRefreshAppearance = true;
  }
  if (config.roundHighlightOffsetY !== undefined) {
    runtime.roundHighlightOffsetY = config.roundHighlightOffsetY;
    result.shouldRefreshAppearance = true;
  }
  if (config.roundHighlightRotationDegrees !== undefined) {
    runtime.roundHighlightRotationDegrees = config.roundHighlightRotationDegrees;
    result.shouldRefreshAppearance = true;
  }
  if (config.roundHighlightOpacity !== undefined) {
    runtime.roundHighlightOpacity = Math.max(0, Math.min(1, config.roundHighlightOpacity));
    result.shouldRefreshAppearance = true;
  }
  if (config.roundHighlightColor !== undefined && Number.isFinite(config.roundHighlightColor)) {
    runtime.roundHighlightColor = config.roundHighlightColor;
    result.shouldRefreshAppearance = true;
  }
  if (config.dotEyeMix !== undefined) {
    runtime.dotEyeMix = Math.max(0, Math.min(1, config.dotEyeMix));
    result.shouldRebuild = true;
  }
  if (config.dotPupilRatio !== undefined) {
    runtime.dotPupilRatio = Math.max(0.05, Math.min(0.5, config.dotPupilRatio));
    result.shouldRefreshAppearance = true;
  }
  if (config.dotGlobeColor !== undefined && Number.isFinite(config.dotGlobeColor)) {
    runtime.dotGlobeColor = config.dotGlobeColor;
    result.shouldRefreshAppearance = true;
  }
  if (config.dotMouseColor !== undefined && Number.isFinite(config.dotMouseColor)) {
    runtime.dotMouseColor = config.dotMouseColor;
    result.shouldRefreshAppearance = true;
  }

  // Color config
  if (config.dropShadowColor !== undefined && Number.isFinite(config.dropShadowColor)) {
    runtime.dropShadowColor = config.dropShadowColor;
  }
  if (config.roundInnerShadowColor !== undefined && Number.isFinite(config.roundInnerShadowColor)) {
    runtime.roundInnerShadowColor = config.roundInnerShadowColor;
    result.shouldRefreshAppearance = true;
  }
  if (config.irisColor !== undefined && Number.isFinite(config.irisColor)) {
    runtime.irisColor = config.irisColor;
    result.shouldRefreshAppearance = true;
  }
  if (config.mouseIrisColor !== undefined && Number.isFinite(config.mouseIrisColor)) {
    runtime.mouseIrisColor = config.mouseIrisColor;
    result.shouldRefreshAppearance = true;
  }
  if (config.mouseIrisRadius !== undefined) {
    runtime.mouseIrisRadius = Math.max(50, Math.min(200, config.mouseIrisRadius));
    result.shouldRefreshAppearance = true;
  }
  if (config.mouseIrisBlend !== undefined) {
    runtime.mouseIrisBlend = Math.max(0, Math.min(1, config.mouseIrisBlend));
    result.shouldRefreshAppearance = true;
  }
  if (config.mouseIrisDecay !== undefined) {
    runtime.mouseIrisDecay = Math.max(0.01, Math.min(0.5, config.mouseIrisDecay));
    result.shouldRefreshAppearance = true;
  }
  if (config.eyeShapeColor !== undefined && Number.isFinite(config.eyeShapeColor)) {
    runtime.eyeShapeColor = config.eyeShapeColor;
    result.shouldRefreshAppearance = true;
  }

  return result;
}

export function applyAppearanceRefresh(runtime: EyeFieldRuntime): void {
  runtime.eyes.forEach((eye) => {
    eye.needsAppearanceRefresh = true;
    eye.appearanceAccumulator = eye.appearanceUpdateInterval;
  });
}
