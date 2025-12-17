import { gsap } from "gsap";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SPLIT_HEADING_SELECTOR = "[data-split-heading]";

const BLUR_PX = 18;
const OUT_Y_PERCENT = 120;
const DURATION_SEC = 1.1;
const EASE = "power3.out";

let observer: IntersectionObserver | null = null;

function shouldReduceMotion(): boolean {
	return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ?? false;
}

function getHeadingText(heading: HTMLElement): string {
	const fromAttr = heading.getAttribute("data-split-text")?.trim();
	if (fromAttr) return fromAttr;
	return heading.textContent?.trim() ?? "";
}

function getSplitElements(heading: HTMLElement) {
	const fallback = heading.querySelector<HTMLElement>("[data-split-fallback]");
	const left = heading.querySelector<HTMLElement>("[data-split-layer][data-split-slice='left']");
	const center = heading.querySelector<HTMLElement>("[data-split-layer][data-split-slice='center']");
	const right = heading.querySelector<HTMLElement>("[data-split-layer][data-split-slice='right']");
	if (!fallback || !left || !center || !right) return null;
	return { fallback, left, center, right };
}

function initHeading(heading: HTMLElement) {
	if (heading.dataset.splitInit === "true") return;
	const parts = getSplitElements(heading);
	if (!parts) return;

	const { fallback, left, center, right } = parts;

	const text = getHeadingText(heading);
	heading.setAttribute("data-split-text", text);
	[left, center, right].forEach((layer) => {
		if (!layer.textContent?.trim()) layer.textContent = text;
	});

	gsap.set(fallback, { opacity: 0 });
	gsap.set([left, center, right], { opacity: 1 });
	gsap.set(left, { yPercent: -OUT_Y_PERCENT, filter: `blur(${BLUR_PX}px)` });
	gsap.set(center, { yPercent: 0, filter: `blur(${BLUR_PX}px)` });
	gsap.set(right, { yPercent: OUT_Y_PERCENT, filter: `blur(${BLUR_PX}px)` });

	heading.dataset.splitInit = "true";
}

function animateHeading(heading: HTMLElement) {
	if (heading.dataset.splitAnimated === "true") return;
	const parts = getSplitElements(heading);
	if (!parts) return;

	const { left, center, right } = parts;
	heading.dataset.splitAnimated = "true";

	const tl = gsap.timeline({ defaults: { duration: DURATION_SEC, ease: EASE } });
	tl.to([left, right], { yPercent: 0 }, 0);
	tl.to([left, center, right], { filter: "blur(0px)" }, 0);
}

export function setupSplitHeadings() {
	const headings = Array.from(document.querySelectorAll<HTMLElement>(SPLIT_HEADING_SELECTOR));
	if (headings.length === 0) return;

	const reduceMotion = shouldReduceMotion();
	if (reduceMotion) return;

	headings.forEach((heading) => {
		initHeading(heading);
	});

	if (!("IntersectionObserver" in window)) {
		headings.forEach((heading) => {
			animateHeading(heading);
		});
		return;
	}

	if (!observer) {
		observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (!entry.isIntersecting) return;
					const heading = entry.target as HTMLElement;
					animateHeading(heading);
					observer?.unobserve(heading);
				});
			},
			{ threshold: 0.2 },
		);
	}

	headings.forEach((heading) => {
		if (heading.dataset.splitAnimated === "true") return;
		if (heading.dataset.splitObserved === "true") return;
		heading.dataset.splitObserved = "true";
		observer?.observe(heading);
	});
}
