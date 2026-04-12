// @env browser
import { gsap } from "gsap";

type SmoothState = { x: number; y: number };

const STRIPE_SHIFT = 160;
const ANIMATION_DURATION = 1.2;
const SMOOTH_DURATION = 0.3;
const OFF_SCREEN = -1000;

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

		const maskedEl = container.querySelector("[data-masked]") as HTMLElement | null;
		if (!maskedEl) return;

		const smoothState: SmoothState = { x: OFF_SCREEN, y: OFF_SCREEN };

		gsap.to(smoothState, {
			x: OFF_SCREEN,
			y: OFF_SCREEN,
			duration: SMOOTH_DURATION,
			ease: "power2.out",
			onUpdate: () => {
				maskedEl.style.setProperty("--mouse-x", `${smoothState.x}px`);
				maskedEl.style.setProperty("--mouse-y", `${smoothState.y}px`);
			},
		});

		const handleMouseMove = (e: MouseEvent): void => {
			const rect = container.getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;

			gsap.to(smoothState, {
				x: mouseX,
				y: mouseY,
				duration: SMOOTH_DURATION,
				ease: "power2.out",
				overwrite: true,
			});

			maskedEl.style.setProperty("--lens-radius", "150px");
		};

		const handleMouseLeave = (): void => {
			gsap.to(smoothState, {
				x: OFF_SCREEN,
				y: OFF_SCREEN,
				duration: SMOOTH_DURATION,
				ease: "power2.out",
				overwrite: true,
			});
		};

		container.addEventListener("mousemove", handleMouseMove);
		container.addEventListener("mouseleave", handleMouseLeave);
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
