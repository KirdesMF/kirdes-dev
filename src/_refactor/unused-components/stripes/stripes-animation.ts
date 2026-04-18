// @env browser
import { gsap } from "gsap";

import { bindLocalLensMask } from "../../visual-effects/lens/local-mask";

const STRIPE_SHIFT = 160;
const ANIMATION_DURATION = 1.2;

export function initStripesAnimation(): void {
	const containers = document.querySelectorAll(".stripes-container");

	containers.forEach((container) => {
		const trackBase = container.querySelector(".stripes-track-base");
		const trackOverlay = container.querySelector(".stripes-track-overlay");

		if (!trackBase || !trackOverlay) return;

		gsap.to([trackBase, trackOverlay], {
			x: -STRIPE_SHIFT,
			duration: ANIMATION_DURATION,
			ease: "none",
			repeat: -1,
			modifiers: {
				x: gsap.utils.unitize((value: number) => value % STRIPE_SHIFT),
			},
		});

		const maskedEl = container.querySelector<HTMLElement>("[data-stripes-mask]");
		if (!maskedEl) return;

		bindLocalLensMask({
			container,
			target: maskedEl,
			mode: "hover",
			radiusPx: 150,
		});
	});
}

const initOnReady = (): void => {
	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", initStripesAnimation);
	} else {
		initStripesAnimation();
	}
};

if (typeof document !== "undefined") {
	initOnReady();
}
