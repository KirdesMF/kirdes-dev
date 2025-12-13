import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(Draggable, ScrollTrigger);

type CleanupFn = () => void;

interface CurvedGalleryConfig {
	cardWidthPx?: number;
	cardSpacingPx?: number;
	paddingEdgePx?: number;
}

const DEFAULT_CARD_WIDTH_PX = 300;
const DEFAULT_CARD_SPACING_PX = 340; // Width + gap
const DEFAULT_PADDING_EDGE_PX = 50;

function initCurvedGallery(container: HTMLElement, config: CurvedGalleryConfig = {}): CleanupFn {
	const cardWidthPx = config.cardWidthPx ?? DEFAULT_CARD_WIDTH_PX;
	const cardSpacingPx = config.cardSpacingPx ?? DEFAULT_CARD_SPACING_PX;
	const paddingEdgePx = config.paddingEdgePx ?? DEFAULT_PADDING_EDGE_PX;

	const path = container.querySelector<SVGPathElement>('[data-role="string-path"]');
	const hitPath = container.querySelector<SVGPathElement>('[data-role="hit-path"]');
	const cards = Array.from(container.querySelectorAll<HTMLDivElement>('[data-role="card"]'));

	if (!path || !hitPath || cards.length === 0) {
		return () => {};
	}

	const proxy = document.createElement("div");

	let width = 0;
	let height = 0;

	let maxScroll = 0;
	let minScroll = 0;

	let isLineGrab = false;
	let velocity = 0;
	let lastTime = 0;
	let lastX = 0;

	let updateCards: (() => void) | null = null;
	let recomputeBounds: (() => void) | null = null;

	let ctx: gsap.Context | null = null;
	let resizeObserver: ResizeObserver | null = null;

	function measure(): void {
		width = container.offsetWidth;
		height = container.offsetHeight;
	}

	function ensureGsap(): void {
		measure();
		if (width === 0 || height === 0) return;

		if (!ctx) {
			ctx = gsap.context(() => {
				const startX = paddingEdgePx;

				recomputeBounds = () => {
					const totalContentWidth = (cards.length - 1) * cardSpacingPx;
					maxScroll = paddingEdgePx - startX; // 0
					const computedMinScroll = width - paddingEdgePx - cardWidthPx - (startX + totalContentWidth);
					minScroll = Math.min(maxScroll, computedMinScroll);
				};

				updateCards = () => {
					const xOffset = gsap.getProperty(proxy, "x") as number;
					const yPull = gsap.getProperty(proxy, "y") as number;

					const baseY = height / 2;
					const controlY = baseY + yPull * 2;
					const pathString = `M -200,${baseY} Q ${width / 2},${controlY} ${width + 200},${baseY}`;

					path?.setAttribute("d", pathString);
					hitPath?.setAttribute("d", pathString);

					const virtualAnchorX = width / 1.5;
					const parabolaCoeff = yPull / virtualAnchorX ** 2;

					for (const [index, card] of cards.entries()) {
						const currentX = index * cardSpacingPx + startX + xOffset;
						const cardCenterX = currentX + cardWidthPx / 2;
						const distFromCenter = cardCenterX - width / 2;

						const yPos = baseY + yPull - parabolaCoeff * distFromCenter ** 2;

						const slope = -2 * parabolaCoeff * distFromCenter;
						const rotationRad = Math.atan(slope);
						const rotationDeg = rotationRad * (180 / Math.PI);

						gsap.set(card, {
							x: currentX,
							y: yPos,
							rotation: rotationDeg,
							transformOrigin: "center top",
							force3D: true,
							zIndex: Math.round(100 - Math.abs(distFromCenter) / 10),
						});
					}
				};

				recomputeBounds();
				updateCards();

				const introTimeline = gsap.timeline({
					scrollTrigger: {
						trigger: container,
						start: "top 85%",
						toggleActions: "play none none reverse",
					},
					onUpdate: updateCards,
				});

				introTimeline.fromTo(
					proxy,
					{ x: width * 0.8 },
					{
						x: 0,
						duration: 1.8,
						ease: "power3.out",
					},
					0,
				);

				introTimeline
					.fromTo(
						proxy,
						{ y: 0 },
						{
							y: 120,
							duration: 0.3,
							ease: "power1.out",
						},
						0.2,
					)
					.to(
						proxy,
						{
							y: 0,
							duration: 1.5,
							ease: "elastic.out(1, 0.3)",
						},
						0.5,
					);

				Draggable.create(proxy, {
					trigger: container,
					type: "x,y",
					inertia: false,
					dragClickables: true,
					onPress: function (event) {
						const composedPath = event.composedPath?.();
						isLineGrab = composedPath ? composedPath.includes(hitPath) : event.target === hitPath;

						gsap.killTweensOf(proxy);

						velocity = 0;
						lastX = this.x;
						lastTime = performance.now();
					},
					onDragStart: () => {
						gsap.to(cards, { scale: 0.98, duration: 0.2 });
					},
					onDrag: function () {
						const now = performance.now();
						const dt = now - lastTime;
						if (dt > 0) {
							const dx = this.x - lastX;
							const v = (dx / dt) * 1000;
							velocity = 0.6 * v + 0.4 * velocity;
							lastX = this.x;
							lastTime = now;
						}
						updateCards?.();
					},
					onDragEnd: () => {
						gsap.to(cards, { scale: 1, duration: 0.3, ease: "elastic.out(1, 0.3)" });

						const currentX = gsap.getProperty(proxy, "x") as number;

						const timeSinceLastMove = performance.now() - lastTime;
						let xVelocity = velocity;
						if (timeSinceLastMove > 100) xVelocity = 0;

						const isOvershotLeft = currentX > maxScroll + 1;
						const isOvershotRight = currentX < minScroll - 1;

						if (isOvershotLeft || isOvershotRight) {
							gsap.to(proxy, {
								x: isOvershotLeft ? maxScroll : minScroll,
								y: 0,
								duration: 1.2,
								ease: "elastic.out(1, 0.3)",
								onUpdate: () => updateCards?.(),
								overwrite: "auto",
							});
							return;
						}

						const inertiaFactor = 0.4;
						const glideDistance = xVelocity * inertiaFactor;
						let targetX = currentX + glideDistance;

						if (targetX > maxScroll) targetX = maxScroll;
						if (targetX < minScroll) targetX = minScroll;

						const slideDuration = Math.min(Math.abs(glideDistance) / 300, 1.2) + 0.5;

						if (Math.abs(glideDistance) > 10) {
							gsap.to(proxy, {
								x: targetX,
								duration: slideDuration,
								ease: "power3.out",
								onUpdate: () => updateCards?.(),
								overwrite: "auto",
							});
						}

						gsap.to(proxy, {
							y: 0,
							duration: 1.2,
							ease: "elastic.out(1, 0.3)",
							onUpdate: () => updateCards?.(),
							overwrite: "auto",
						});
					},
					modifiers: {
						x: (x: number) => {
							if (x > maxScroll) return maxScroll + (x - maxScroll) * 0.5;
							if (x < minScroll) return minScroll + (x - minScroll) * 0.5;
							return x;
						},
						y: (y: number) => {
							const maxY = 300;
							if (!isLineGrab) return 0;
							if (y > maxY) return maxY + (y - maxY) * 0.2;
							if (y < -maxY) return -maxY + (y + maxY) * 0.2;
							return y;
						},
					},
				});
			}, container);
		} else {
			recomputeBounds?.();

			const currentX = gsap.getProperty(proxy, "x") as number;
			if (currentX > maxScroll) gsap.set(proxy, { x: maxScroll });
			if (currentX < minScroll) gsap.set(proxy, { x: minScroll });

			updateCards?.();
			ScrollTrigger.refresh();
		}
	}

	ensureGsap();

	resizeObserver = new ResizeObserver(() => {
		ensureGsap();
	});

	resizeObserver.observe(container);

	return () => {
		resizeObserver?.disconnect();
		resizeObserver = null;

		ctx?.revert();
		ctx = null;
	};
}

const initialized = new WeakSet<HTMLElement>();
const cleanups: CleanupFn[] = [];

export function setupCurvedGalleries(): void {
	const containers = document.querySelectorAll<HTMLElement>("[data-curved-gallery]");

	for (const container of containers) {
		if (initialized.has(container)) continue;
		initialized.add(container);
		cleanups.push(initCurvedGallery(container));
	}
}

window.addEventListener("beforeunload", () => {
	for (const cleanup of cleanups) cleanup();
	cleanups.length = 0;
});
