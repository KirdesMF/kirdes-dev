// Shared eye assets (textures, graphics contexts)

import {
  BlurFilter,
  Container,
  Graphics,
  GraphicsContext,
  Rectangle,
  type Renderer,
} from "pixi.js";

// Constants
const SCLERA_RADIUS = 24;
const GLOBE_TEXTURE_PADDING = 4;
const GLOBE_TEXTURE_RESOLUTION = 4;
const DROP_SHADOW_TEXTURE_PADDING = 18;
const IRIS_RADIUS = 16;
const PUPIL_RADIUS = 11; // Slightly smaller pupil
const HIGHLIGHT_RADIUS = 2.2;
const HIGHLIGHT_ELLIPSE_RX = 12.5; // Ellipse semi-major axis (X)
const HIGHLIGHT_ELLIPSE_RY = 7.64; // Ellipse semi-minor axis (Y)
const SHADOW_EDGE_OFFSET_DEGREES = 68;
const SHADOW_TOP_CONTROL_X_FACTOR = 0.42;
const SHADOW_TOP_CONTROL_Y = 0.9;
const SHADOW_SIDE_CONTROL_X_FACTOR = 0.9;
const SHADOW_RIGHT_CONTROL_Y = 0.82;
const SHADOW_BOTTOM_CONTROL_X_FACTOR = 0.24;
const SHADOW_BOTTOM_RIGHT_CONTROL_Y = 1;
const SHADOW_BOTTOM_LEFT_CONTROL_Y = 1;
const SHADOW_BOTTOM_X = 0;
const SHADOW_BOTTOM_Y = 1;

// Default colors
export const DEFAULT_IRIS_COLOR = 0xab53ee;

// Export radii constants
export { SCLERA_RADIUS, IRIS_RADIUS, PUPIL_RADIUS, HIGHLIGHT_RADIUS };

/**
 * Shared graphics contexts for eye rendering.
 */
export type SharedContexts = {
  scleraFillContext: GraphicsContext;
  scleraOutlineContext: GraphicsContext;
  scleraShadowContext: GraphicsContext;
  roundGlobeHighlightContext: GraphicsContext;
  irisContext: GraphicsContext;
  roundPupilContext: GraphicsContext;
  slitGlobeContext: GraphicsContext;
  highlightContext: GraphicsContext;
};

/**
 * Shared textures for eye rendering.
 */
export type TextureBucket = "small" | "medium" | "large" | "xlarge";

export const BUCKET_THRESHOLDS = {
  small: { maxRadius: 20 },
  medium: { maxRadius: 45 },
  large: { maxRadius: 75 },
  xlarge: { maxRadius: Infinity },
} as const;

export function selectBucket(radius: number): TextureBucket {
  if (radius <= BUCKET_THRESHOLDS.small.maxRadius) return "small";
  if (radius <= BUCKET_THRESHOLDS.medium.maxRadius) return "medium";
  if (radius <= BUCKET_THRESHOLDS.large.maxRadius) return "large";
  return "xlarge";
}

export type BucketTextures = {
  dropShadowTexture: ReturnType<Renderer["generateTexture"]>;
  scleraFillTexture: ReturnType<Renderer["generateTexture"]>;
  scleraOutlineTexture: ReturnType<Renderer["generateTexture"]>;
  scleraShadowTexture: ReturnType<Renderer["generateTexture"]>;
  roundGlobeHighlightTexture: ReturnType<Renderer["generateTexture"]>;
  irisFillTexture: ReturnType<Renderer["generateTexture"]>;
  roundPupilTexture: ReturnType<Renderer["generateTexture"]>;
  slitGlobeTexture: ReturnType<Renderer["generateTexture"]>;
  roundHighlightTexture: ReturnType<Renderer["generateTexture"]>;
};

export type TextureResolutionProfile = Record<TextureBucket, number>;

export type SharedTextures = {
  buckets: Record<TextureBucket, BucketTextures>;
  profile: TextureResolutionProfile;
};

function quantizeResolution(value: number): number {
  const levels = [2, 3, 4, 5, 6, 8, 10];
  for (const level of levels) {
    if (value <= level) {
      return level;
    }
  }
  return levels.at(-1) ?? 10;
}

export function resolveTextureResolutionProfile(
  rendererResolution: number,
  maxRadius: number,
): TextureResolutionProfile {
  const safeRendererResolution = Math.max(rendererResolution, 1);
  const safeMaxRadius = Math.max(maxRadius, 1);
  const relativeScale = safeMaxRadius / SCLERA_RADIUS;
  const largeResolution = quantizeResolution(
    Math.max(safeRendererResolution * 2, relativeScale * 2),
  );
  const mediumResolution = quantizeResolution(Math.max(2, largeResolution * 0.67));
  const smallResolution = quantizeResolution(Math.max(2, largeResolution * 0.4));
  const xlargeResolution = quantizeResolution(Math.max(largeResolution, largeResolution * 1.25));

  return {
    small: smallResolution,
    medium: mediumResolution,
    large: largeResolution,
    xlarge: xlargeResolution,
  };
}

function shadowEdgePoint(sign: number): { x: number; y: number } {
  const offset = (SHADOW_EDGE_OFFSET_DEGREES * Math.PI) / 180;
  return {
    x: Math.sin(offset) * sign,
    y: Math.cos(offset),
  };
}

/**
 * Creates all shared graphics contexts.
 */
export function createSharedContexts(): SharedContexts {
  const scleraFillContext = new GraphicsContext().circle(0, 0, SCLERA_RADIUS).fill(0xfffbf2);
  const scleraOutlineContext = new GraphicsContext()
    .circle(0, 0, SCLERA_RADIUS)
    .stroke({ color: 0x2c241d, width: 2, alignment: 1 });

  const shadowLeft = shadowEdgePoint(-1);
  const shadowRight = shadowEdgePoint(1);
  const scleraShadowContext = new GraphicsContext()
    .moveTo(shadowLeft.x * SCLERA_RADIUS, shadowLeft.y * SCLERA_RADIUS)
    .bezierCurveTo(
      shadowLeft.x * SHADOW_TOP_CONTROL_X_FACTOR * SCLERA_RADIUS,
      SHADOW_TOP_CONTROL_Y * SCLERA_RADIUS,
      shadowRight.x * SHADOW_TOP_CONTROL_X_FACTOR * SCLERA_RADIUS,
      SHADOW_TOP_CONTROL_Y * SCLERA_RADIUS,
      shadowRight.x * SCLERA_RADIUS,
      shadowRight.y * SCLERA_RADIUS,
    )
    .bezierCurveTo(
      shadowRight.x * SHADOW_SIDE_CONTROL_X_FACTOR * SCLERA_RADIUS,
      SHADOW_RIGHT_CONTROL_Y * SCLERA_RADIUS,
      shadowRight.x * SHADOW_BOTTOM_CONTROL_X_FACTOR * SCLERA_RADIUS,
      SHADOW_BOTTOM_RIGHT_CONTROL_Y * SCLERA_RADIUS,
      SHADOW_BOTTOM_X * SCLERA_RADIUS,
      SHADOW_BOTTOM_Y * SCLERA_RADIUS,
    )
    .bezierCurveTo(
      shadowLeft.x * SHADOW_BOTTOM_CONTROL_X_FACTOR * SCLERA_RADIUS,
      SHADOW_BOTTOM_LEFT_CONTROL_Y * SCLERA_RADIUS,
      shadowLeft.x * SHADOW_SIDE_CONTROL_X_FACTOR * SCLERA_RADIUS,
      SHADOW_RIGHT_CONTROL_Y * SCLERA_RADIUS,
      shadowLeft.x * SCLERA_RADIUS,
      shadowLeft.y * SCLERA_RADIUS,
    )
    .closePath()
    .fill({ color: 0xffffff, alpha: 1 });

  const roundGlobeHighlightContext = new GraphicsContext()
    .ellipse(0, 0, HIGHLIGHT_ELLIPSE_RX, HIGHLIGHT_ELLIPSE_RY)
    .fill({ color: 0xffffff, alpha: 1 });

  const irisContext = new GraphicsContext().circle(0, 0, IRIS_RADIUS).fill(0xffffff);
  const roundPupilContext = new GraphicsContext().circle(0, 0, PUPIL_RADIUS).fill(0x17110d);
  const highlightContext = new GraphicsContext().circle(0, 0, HIGHLIGHT_RADIUS).fill(0xfffbf2);
  // White globe texture for dot eyes (pure white for proper tinting)
  const slitGlobeContext = new GraphicsContext().circle(0, 0, SCLERA_RADIUS).fill(0xffffff);

  return {
    scleraFillContext,
    scleraOutlineContext,
    scleraShadowContext,
    roundGlobeHighlightContext,
    irisContext,
    roundPupilContext,
    slitGlobeContext,
    highlightContext,
  };
}

function generateTextureFromContext(
  renderer: Renderer,
  context: GraphicsContext,
  options?: { antialias?: boolean; padding?: number; resolution?: number },
) {
  const target = new Graphics(context);
  const padding = options?.padding ?? GLOBE_TEXTURE_PADDING;
  const resolution = options?.resolution ?? GLOBE_TEXTURE_RESOLUTION;
  const textureFrame = new Rectangle(
    -(SCLERA_RADIUS + padding),
    -(SCLERA_RADIUS + padding),
    (SCLERA_RADIUS + padding) * 2,
    (SCLERA_RADIUS + padding) * 2,
  );
  const texture = renderer.generateTexture({
    target,
    frame: textureFrame,
    resolution,
    antialias: options?.antialias ?? true,
    clearColor: [0, 0, 0, 0],
    textureSourceOptions: {
      scaleMode: "linear",
      autoGenerateMipmaps: true,
    },
  });

  target.destroy();

  return texture;
}

/**
 * Creates a texture from a context with a custom frame size.
 * Used for blink textures which are larger than the standard globe textures.
 */
function generateTextureFromContextWithFrame(
  renderer: Renderer,
  context: GraphicsContext,
  frameSize: number,
  options?: { antialias?: boolean; resolution?: number },
) {
  const target = new Graphics(context);
  const resolution = options?.resolution ?? GLOBE_TEXTURE_RESOLUTION;
  const textureFrame = new Rectangle(-frameSize, -frameSize, frameSize * 2, frameSize * 2);
  const texture = renderer.generateTexture({
    target,
    frame: textureFrame,
    resolution,
    antialias: options?.antialias ?? true,
    clearColor: [0, 0, 0, 0],
    textureSourceOptions: {
      scaleMode: "linear",
      autoGenerateMipmaps: true,
    },
  });

  target.destroy();

  return texture;
}

/**
 * Creates a drop shadow texture with blur.
 */
export function createDropShadowTexture(renderer: Renderer, blur: number, resolution?: number) {
  const blurStrength = Math.max(blur, 0);
  const padding = Math.max(DROP_SHADOW_TEXTURE_PADDING, blurStrength * 3 + 12);
  const res = resolution ?? Math.max(renderer.resolution * 2, GLOBE_TEXTURE_RESOLUTION);
  const target = new Container();
  const source = new Graphics().circle(0, 0, SCLERA_RADIUS).fill(0xffffff);

  if (blurStrength > 0.01) {
    source.filters = [
      new BlurFilter({
        strength: blurStrength,
        quality: blurStrength > 8 ? 4 : 3,
        kernelSize: blurStrength > 10 ? 9 : 7,
      }),
    ];
  }

  target.addChild(source);
  const texture = renderer.generateTexture({
    target,
    frame: new Rectangle(
      -(SCLERA_RADIUS + padding),
      -(SCLERA_RADIUS + padding),
      (SCLERA_RADIUS + padding) * 2,
      (SCLERA_RADIUS + padding) * 2,
    ),
    resolution: res,
    antialias: true,
    clearColor: [0, 0, 0, 0],
    textureSourceOptions: {
      scaleMode: "linear",
      autoGenerateMipmaps: true,
    },
  });

  target.destroy({ children: true });

  return texture;
}

/**
 * Creates all shared textures from contexts.
 */
export function createSharedTextures(
  renderer: Renderer,
  contexts: SharedContexts,
  dropShadowBlur: number,
  maxRadius: number,
): SharedTextures {
  const profile = resolveTextureResolutionProfile(renderer.resolution, maxRadius);
  const buckets: Record<TextureBucket, BucketTextures> = {
    small: generateBucketTextures(renderer, contexts, dropShadowBlur, profile.small),
    medium: generateBucketTextures(renderer, contexts, dropShadowBlur, profile.medium),
    large: generateBucketTextures(renderer, contexts, dropShadowBlur, profile.large),
    xlarge: generateBucketTextures(renderer, contexts, dropShadowBlur, profile.xlarge),
  };

  return { buckets, profile };
}

function generateBucketTextures(
  renderer: Renderer,
  contexts: SharedContexts,
  dropShadowBlur: number,
  resolution: number,
): BucketTextures {
  // Pupil texture needs a smaller frame sized for the pupil
  const pupilFrameSize = PUPIL_RADIUS + 2;
  return {
    dropShadowTexture: createDropShadowTexture(renderer, dropShadowBlur, resolution),
    scleraFillTexture: generateTextureFromContext(renderer, contexts.scleraFillContext, {
      resolution,
    }),
    scleraOutlineTexture: generateTextureFromContext(renderer, contexts.scleraOutlineContext, {
      resolution,
    }),
    scleraShadowTexture: generateTextureFromContext(renderer, contexts.scleraShadowContext, {
      resolution,
    }),
    roundGlobeHighlightTexture: generateTextureFromContext(
      renderer,
      contexts.roundGlobeHighlightContext,
      { resolution },
    ),
    // New static textures (replacing Graphics)
    irisFillTexture: generateTextureFromContext(renderer, contexts.irisContext, { resolution }),
    roundPupilTexture: generateTextureFromContextWithFrame(
      renderer,
      contexts.roundPupilContext,
      pupilFrameSize,
      { resolution },
    ),
    slitGlobeTexture: generateTextureFromContext(renderer, contexts.slitGlobeContext, {
      resolution,
    }),
    roundHighlightTexture: generateTextureFromContext(renderer, contexts.highlightContext, {
      resolution: resolution * 2,
    }), // Higher res for sharper cartoon highlights
  };
}

/**
 * Destroys all shared graphics contexts.
 */
export function destroySharedContexts(contexts: SharedContexts): void {
  contexts.scleraFillContext.destroy();
  contexts.scleraOutlineContext.destroy();
  contexts.scleraShadowContext.destroy();
  contexts.roundGlobeHighlightContext.destroy();
  contexts.irisContext.destroy();
  contexts.roundPupilContext.destroy();
  contexts.slitGlobeContext.destroy();
  contexts.highlightContext.destroy();
}

/**
 * Destroys all shared textures.
 */
export function destroySharedTextures(textures: SharedTextures): void {
  for (const bucket of Object.values(textures.buckets)) {
    bucket.dropShadowTexture.destroy(true);
    bucket.scleraFillTexture.destroy(true);
    bucket.scleraOutlineTexture.destroy(true);
    bucket.scleraShadowTexture.destroy(true);
    bucket.roundGlobeHighlightTexture.destroy(true);
    bucket.irisFillTexture.destroy(true);
    bucket.roundPupilTexture.destroy(true);
    bucket.slitGlobeTexture.destroy(true);
    bucket.roundHighlightTexture.destroy(true);
  }
}
