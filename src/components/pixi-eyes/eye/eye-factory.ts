import { Container, Sprite } from "pixi.js";

import type { EyeInstance } from "./eye-state";
import type { EyeType } from "./eye-types";
import type { SharedTextures } from "./eye-assets";
import { SCLERA_RADIUS, DEFAULT_IRIS_COLOR, selectBucket } from "./eye-assets";
import {
  DEFAULT_RANDOMIZE_STAGGER,
  DEFAULT_LOW_DETAIL_SCALE_THRESHOLD,
  SCALE_IN_DURATION,
  DEFAULT_DOT_EYE_MIX,
} from "./eye-config";
import { hash01, smoothstep } from "../shared/math";
import { staggerDelay } from "./layout";

function resolveEyeType(index: number, count: number, dotEyeMix: number): EyeType {
  const hash = hash01(index * 11.337 + count * 1.73);
  return hash < dotEyeMix ? "dot" : "human";
}

export function createEyeInstance(
  textures: SharedTextures,
  x: number,
  y: number,
  radius: number,
  maxRadius: number,
  count: number,
  index: number,
  dotEyeMix: number = DEFAULT_DOT_EYE_MIX,
): EyeInstance {
  const bucket = selectBucket(radius);
  const bt = textures.buckets[bucket];

  const eyeType = resolveEyeType(index, count, dotEyeMix);
  const isDot = eyeType === "dot";

  const root = new Container();
  const dropShadow = new Sprite(bt.dropShadowTexture);
  const blinkGroup = new Container();

  // For dot eyes: use custom texture for proper tinting
  const eyeFill = new Sprite(isDot ? bt.slitGlobeTexture : bt.scleraFillTexture);
  eyeFill.anchor.set(0.5);

  const eyeOutline = new Sprite(bt.scleraOutlineTexture);
  const eyeShadow = new Sprite(bt.scleraShadowTexture);
  const globeHighlight = new Sprite(bt.roundGlobeHighlightTexture);
  const irisGroup = new Container();
  const pupilGroup = new Container();

  // For dot eyes: no iris texture, just globe + small dot pupil
  const iris = new Sprite(bt.irisFillTexture);
  const pupil = new Sprite(bt.roundPupilTexture);
  const highlight = new Sprite(bt.roundHighlightTexture);
  const highlight2 = new Sprite(bt.roundHighlightTexture); // Second smaller highlight for cartoon effect

  if (isDot) {
    // For dot eyes: no iris, small dot pupil + cartoon highlights
    pupil.visible = true;
    highlight.visible = true;
    highlight2.visible = true;
  } else {
    iris.tint = DEFAULT_IRIS_COLOR;
    iris.visible = true;
    highlight2.visible = false; // Only one highlight for human eyes
  }
  dropShadow.anchor.set(0.5);
  eyeFill.anchor.set(0.5);
  eyeOutline.anchor.set(0.5);
  eyeShadow.anchor.set(0.5);
  globeHighlight.anchor.set(0.5);
  iris.anchor.set(0.5);
  pupil.anchor.set(0.5);
  highlight.anchor.set(0.5);
  highlight2.anchor.set(0.5);

  pupilGroup.addChild(pupil, highlight, highlight2);

  if (isDot) {
    // For dot eyes: no iris, pupil goes directly in root
    root.addChild(
      dropShadow,
      eyeFill, // Globe color - behind everything
      eyeShadow,
      pupilGroup, // Pupil + highlight
      globeHighlight,
      blinkGroup,
      eyeOutline,
    );
  } else {
    // For human eyes: iris + pupil in irisGroup
    irisGroup.addChild(iris, pupilGroup);
    root.addChild(
      dropShadow,
      eyeFill,
      irisGroup,
      eyeShadow,
      globeHighlight,
      blinkGroup,
      eyeOutline,
    );
  }

  const scale = Math.max(radius / Math.max(maxRadius, 0.001), 0.001);
  const renderScale = Math.max(radius / SCLERA_RADIUS, 0.001);
  root.zIndex = renderScale;
  root.alpha = 1;

  return {
    type: eyeType,
    root,
    dropShadow,
    eyeFill,
    eyeOutline,
    eyeShadow,
    globeHighlight,
    blinkGroup,
    irisGroup,
    pupilGroup,
    iris,
    pupil,
    highlight,
    highlight2,
    x,
    y,
    layoutStartX: x,
    layoutStartY: y,
    targetX: x,
    targetY: y,
    layoutTransitionElapsed: 0,
    layoutTransitionActive: false,
    radius,
    scale,
    renderScale,
    lowDetail: lowDetailEnabled(scale),
    appearanceUpdateInterval: eyeAppearanceUpdateInterval(scale),
    appearanceAccumulator: 0,
    needsAppearanceRefresh: true,
    delay: staggerDelay(index, count, 0, DEFAULT_RANDOMIZE_STAGGER),
    scaleInFinished: false,
    parallaxX: 0,
    parallaxY: 0,
    repelX: 0,
    repelY: 0,
    lookX: 0,
    lookY: 0,
    currentScaleX: 1,
    currentScaleY: 1,
    currentAngle: 0,
    pupilScale: 1,
    irisProximity: 0,
    focusDelayMix: hash01(index * 8.137 + count * 1.17),
    focusCycleOffset: hash01(index * 17.413 + count * 2.31),
  } satisfies EyeInstance;
}

export function eyeAppearanceUpdateInterval(scale: number): number {
  const fps = lerpAppearanceFps(scale);
  return 1 / Math.max(fps, 1);
}

export function lowDetailEnabled(scale: number): boolean {
  return scale < clamp(DEFAULT_LOW_DETAIL_SCALE_THRESHOLD, 0, 1);
}

export function resolveScaleInProgress(eye: EyeInstance, elapsed: number): number {
  const progress = clamp((elapsed - eye.delay) / SCALE_IN_DURATION, 0, 1);
  eye.scaleInFinished = progress >= 0.999;

  return smoothstep(progress);
}

function lerpAppearanceFps(scale: number): number {
  const t = clamp(scale, 0, 1);
  const DEFAULT_SMALL_EYE_APPEARANCE_FPS = 24;
  const DEFAULT_LARGE_EYE_APPEARANCE_FPS = 60;
  return (
    DEFAULT_SMALL_EYE_APPEARANCE_FPS +
    (DEFAULT_LARGE_EYE_APPEARANCE_FPS - DEFAULT_SMALL_EYE_APPEARANCE_FPS) * t
  );
}

function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(value, maxValue));
}
