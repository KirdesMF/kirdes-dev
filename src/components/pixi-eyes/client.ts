import { CONTROL_DEFINITIONS, sanitizeCrossType, sanitizeFocusEase, sanitizeLayoutShape } from "./controls";
import { createSidebar } from "./debug/create-sidebar";
import { createDefaultSettings, loadSettings, readStoredSettings, writeStoredSettings } from "./debug/debug-state";
import { PIXI_EYES_HERO_CONFIG } from "./default-config";
import { createHeroScene } from "./scenes/hero-scene";

type HeroRoot = HTMLElement & { dataset: DOMStringMap };

type Cleanup = () => void;

const cleanups = new WeakMap<HeroRoot, Cleanup>();

function hexToNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

function readLensRadiusPx(): number {
  if (typeof document === "undefined") {
    return PIXI_EYES_HERO_CONFIG.initialRepulsionRadius;
  }

  const style = getComputedStyle(document.documentElement);
  const rawLensSize = style.getPropertyValue("--lens-size").trim();
  const lensSize = Number.parseFloat(rawLensSize);

  if (Number.isFinite(lensSize)) {
    return lensSize / 2;
  }

  const rawLensRadius = style.getPropertyValue("--lens-radius").trim();
  const lensRadius = Number.parseFloat(rawLensRadius);

  return Number.isFinite(lensRadius) ? lensRadius : PIXI_EYES_HERO_CONFIG.initialRepulsionRadius;
}

function getSceneConfig(settingsState: Record<string, number | string>) {
  const toNum = (value: unknown, fallback: number) => (typeof value === "number" ? value : fallback);
  const toHex = (value: unknown, fallback: number) => (typeof value === "string" ? hexToNumber(value) : fallback);

  return {
    initialCount: toNum(settingsState["instance-count"], PIXI_EYES_HERO_CONFIG.initialCount),
    initialBackgroundAlpha: PIXI_EYES_HERO_CONFIG.initialBackgroundAlpha,
    initialLayoutShape: sanitizeLayoutShape(
      typeof settingsState["layout-shape"] === "string" ? settingsState["layout-shape"] : undefined,
      PIXI_EYES_HERO_CONFIG.initialLayoutShape,
    ),
    initialRingInnerRatio: toNum(settingsState["ring-inner-ratio"], PIXI_EYES_HERO_CONFIG.initialRingInnerRatio),
    initialCrossType: sanitizeCrossType(
      typeof settingsState["cross-type"] === "string" ? settingsState["cross-type"] : undefined,
      PIXI_EYES_HERO_CONFIG.initialCrossType,
    ),
    initialStarBranches: toNum(settingsState["star-branches"], PIXI_EYES_HERO_CONFIG.initialStarBranches),
    initialSlitEyeMix: toNum(settingsState["slit-eye-mix"], PIXI_EYES_HERO_CONFIG.initialSlitEyeMix),
    initialSlitPupilWidth: toNum(settingsState["slit-pupil-width"], PIXI_EYES_HERO_CONFIG.initialSlitPupilWidth),
    initialSlitPupilHeight: toNum(settingsState["slit-pupil-height"], PIXI_EYES_HERO_CONFIG.initialSlitPupilHeight),
    initialLayoutTransitionDuration: toNum(
      settingsState["layout-transition-duration"],
      PIXI_EYES_HERO_CONFIG.initialLayoutTransitionDuration,
    ),
    initialLayoutTransitionEase: sanitizeFocusEase(
      typeof settingsState["layout-transition-ease"] === "string"
        ? settingsState["layout-transition-ease"]
        : undefined,
      PIXI_EYES_HERO_CONFIG.initialLayoutTransitionEase,
    ),
    initialLayoutJitter: toNum(settingsState["layout-jitter"], PIXI_EYES_HERO_CONFIG.initialLayoutJitter),
    initialMinEyeSize: toNum(settingsState["min-eye-size"], PIXI_EYES_HERO_CONFIG.initialMinEyeSize),
    initialMaxEyeSize: toNum(settingsState["max-eye-size"], PIXI_EYES_HERO_CONFIG.initialMaxEyeSize),
    initialRepulsionRadius: readLensRadiusPx(),
    initialRepulsionPushSpeed: toNum(
      settingsState["repulsion-push-speed"],
      PIXI_EYES_HERO_CONFIG.initialRepulsionPushSpeed,
    ),
    initialRepulsionReturnSpeed: toNum(
      settingsState["repulsion-return-speed"],
      PIXI_EYES_HERO_CONFIG.initialRepulsionReturnSpeed,
    ),
    initialStaggerSeconds: toNum(settingsState["stagger-seconds"], PIXI_EYES_HERO_CONFIG.initialStaggerSeconds),
    initialShadowOpacity: toNum(settingsState["shadow-opacity"], PIXI_EYES_HERO_CONFIG.initialShadowOpacity),
    initialDropShadowColor: toHex(settingsState["drop-shadow-color"], PIXI_EYES_HERO_CONFIG.initialDropShadowColor),
    initialDropShadowOpacity: toNum(
      settingsState["drop-shadow-opacity"],
      PIXI_EYES_HERO_CONFIG.initialDropShadowOpacity,
    ),
    initialDropShadowBlur: toNum(settingsState["drop-shadow-blur"], PIXI_EYES_HERO_CONFIG.initialDropShadowBlur),
    initialDropShadowSpread: toNum(
      settingsState["drop-shadow-spread"],
      PIXI_EYES_HERO_CONFIG.initialDropShadowSpread,
    ),
    initialRoundInnerShadowColor: toHex(
      settingsState["round-inner-shadow-color"],
      PIXI_EYES_HERO_CONFIG.initialRoundInnerShadowColor,
    ),
    initialIrisColor: toHex(settingsState["iris-color"], PIXI_EYES_HERO_CONFIG.initialIrisColor),
    initialMouseIrisColor: toHex(settingsState["mouse-iris-color"], PIXI_EYES_HERO_CONFIG.initialMouseIrisColor),
    initialMouseIrisRadius: toNum(settingsState["mouse-iris-radius"], PIXI_EYES_HERO_CONFIG.initialMouseIrisRadius),
    initialMouseIrisBlend: toNum(settingsState["mouse-iris-blend"], PIXI_EYES_HERO_CONFIG.initialMouseIrisBlend),
    initialMouseIrisDecay: toNum(settingsState["mouse-iris-decay"], PIXI_EYES_HERO_CONFIG.initialMouseIrisDecay),
    initialEyeShapeColor: toHex(settingsState["eye-shape-color"], PIXI_EYES_HERO_CONFIG.initialEyeShapeColor),
    initialRoundTranslateStrength: toNum(
      settingsState["round-translate-strength"],
      PIXI_EYES_HERO_CONFIG.initialRoundTranslateStrength,
    ),
    initialRoundHighlightScale: toNum(
      settingsState["round-highlight-scale"],
      PIXI_EYES_HERO_CONFIG.initialRoundHighlightScale,
    ),
    initialRoundHighlightOffsetX: toNum(
      settingsState["round-highlight-offset-x"],
      PIXI_EYES_HERO_CONFIG.initialRoundHighlightOffsetX,
    ),
    initialRoundHighlightOffsetY: toNum(
      settingsState["round-highlight-offset-y"],
      PIXI_EYES_HERO_CONFIG.initialRoundHighlightOffsetY,
    ),
    initialRoundHighlightRotationDegrees: toNum(
      settingsState["round-highlight-rotation"],
      PIXI_EYES_HERO_CONFIG.initialRoundHighlightRotationDegrees,
    ),
    initialRoundHighlightOpacity: toNum(
      settingsState["round-highlight-opacity"],
      PIXI_EYES_HERO_CONFIG.initialRoundHighlightOpacity,
    ),
    initialRoundHighlightColor: toHex(
      settingsState["round-highlight-color"],
      PIXI_EYES_HERO_CONFIG.initialRoundHighlightColor,
    ),
    initialDotEyeMix: toNum(settingsState["dot-eye-mix"], PIXI_EYES_HERO_CONFIG.initialDotEyeMix),
    initialDotPupilRatio: toNum(settingsState["dot-pupil-ratio"], PIXI_EYES_HERO_CONFIG.initialDotPupilRatio),
    initialDotGlobeColor: toHex(settingsState["dot-globe-color"], PIXI_EYES_HERO_CONFIG.initialDotGlobeColor),
    initialDotMouseColor: toHex(settingsState["dot-mouse-color"], PIXI_EYES_HERO_CONFIG.initialDotMouseColor),
    initialBackgroundColor: toHex(settingsState["background-color"], PIXI_EYES_HERO_CONFIG.initialBackgroundColor),
  };
}

export async function mountPixiEyesHero(root: HeroRoot): Promise<void> {
  if (root.dataset.pixiEyesMounted === "true") return;

  const mountNode = root.querySelector<HTMLElement>("[data-pixi-eyes-stage]");
  if (!mountNode) throw new Error("Missing [data-pixi-eyes-stage] mount node");

  const shouldReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (shouldReduceMotion) {
    root.dataset.pixiEyesMounted = "true";
    return;
  }

  root.dataset.pixiEyesMounted = "true";

  const defaultSettings = createDefaultSettings(CONTROL_DEFINITIONS);
  const storedSettings = readStoredSettings();
  const settingsState = loadSettings(defaultSettings, storedSettings);

  const updateStoredSettings = (patch: Record<string, number | string>) => {
    Object.assign(settingsState, patch);
    writeStoredSettings(settingsState);
  };

  const scene = await createHeroScene({
    ...getSceneConfig(settingsState),
    mountNode,
    onMetrics: ({ fps, visibleCount }) => {
      const fpsEl = document.getElementById("pixi-eyes-fps");
      const visibleEl = document.getElementById("pixi-eyes-visible");
      if (fpsEl) fpsEl.textContent = fps.toFixed(0);
      if (visibleEl) visibleEl.textContent = String(visibleCount);
    },
  });

  const viewportObserver =
    "IntersectionObserver" in window
      ? new IntersectionObserver(
          ([entry]) => {
            if (entry?.isIntersecting) {
              scene.resume();
            } else {
              scene.pause();
            }
          },
          { threshold: 0.05 },
        )
      : null;

  viewportObserver?.observe(root);

  writeStoredSettings(settingsState);

  const isDev = import.meta.env.DEV ?? true;
  const sidebar = isDev ? createSidebar(scene, updateStoredSettings, settingsState) : null;

  const cleanup = () => {
    cleanups.delete(root);
    viewportObserver?.disconnect();
    sidebar?.destroy();
    scene.destroy();
    root.dataset.pixiEyesMounted = "false";
  };

  cleanups.set(root, cleanup);
}

export function destroyPixiEyesHero(root: HeroRoot): void {
  cleanups.get(root)?.();
}
