// FILE: hero-animation/timeline.ts
import { gsap } from "gsap";
import { PixiPlugin } from "gsap/PixiPlugin";
import * as PIXI from "pixi.js";
import type { Scene } from "./scene";

// register the plugin
gsap.registerPlugin(PixiPlugin);
PixiPlugin.registerPIXI(PIXI);

export type CreateHeroTimelineOptions = {
	scene: Scene;
	/** Autoplay when created (default: true). */
	autoplay?: boolean;
	/** Duration in seconds for intro scale-in. */
	introDuration?: number;
	/** Stagger between blobs (seconds). */
	introStagger?: number;
	/** Start scale for intro (e.g., 0.5). */
	introScaleFrom?: number;
	/** Title start scale (default: 0.8 for minimal delta & no overshoot). */
	titleScaleFrom?: number;
	/** Title scale easing (default: "power2.out" to avoid overshoot). */
	titleEase?: string;
};

/** Timeline "intro-only": title + blobs appear with scale (no fade), staggered. */
export function createHeroTimeline(opts: CreateHeroTimelineOptions) {
	const scene = opts.scene;
	const autoplay = opts.autoplay !== false;
	const introDuration =
		typeof opts.introDuration === "number"
			? Math.max(0.05, opts.introDuration)
			: 0.8;
	const introStagger =
		typeof opts.introStagger === "number"
			? Math.max(0, opts.introStagger)
			: 0.01;
	const introScaleFrom =
		typeof opts.introScaleFrom === "number"
			? Math.max(0.01, opts.introScaleFrom)
			: 0.6;
	const titleScaleFrom =
		typeof opts.titleScaleFrom === "number"
			? Math.max(0.01, opts.titleScaleFrom)
			: 0.8;
	const titleEase =
		typeof opts.titleEase === "string" ? opts.titleEase : "power2.out";

	const tl = gsap.timeline({
		paused: !autoplay,
		defaults: { ease: "power2.out" },
	});

	// Collect targets
	const title = scene.getTitleDisplay();
	const blobs = scene.getBlobDisplays();

	// Initial states
	if (title) {
		gsap.set(title.scale, { x: titleScaleFrom, y: titleScaleFrom });
	}
	if (blobs.length > 0) {
		// No fade on blobs → visible, init scale via PixiPlugin
		gsap.set(blobs, { pixi: { scale: introScaleFrom } });
	}

	// Animate blobs first (stagger), then title slightly after
	if (blobs.length > 0) {
		tl.to(
			blobs,
			{
				duration: introDuration,
				pixi: { scale: 1 },
				stagger: introStagger,
			},
			0,
		);
	}
	if (title) {
		tl.to(
			title.scale,
			{ duration: introDuration, x: 1, y: 1, ease: titleEase },
			0.05,
		);
	}

	return tl;
}
