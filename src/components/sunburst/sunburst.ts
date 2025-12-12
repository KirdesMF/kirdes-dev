import { gsap } from "gsap";
import { events } from "../../lib/states";

export type SunburstConfig = {
	rayCount: number;
	innerRadiusRatio: number; // 0..1 relative to min dimension
	thicknessRatio: number; // 0..1 of diagonal reach
	gapRatio: number; // 0..0.5 fraction of step kept as gap
	invertBend: boolean;
};

type SunburstState = {
	rotation: number; // radians
	bend: number; // -0.5..0.5
	lastPointerAngle: number | null;
	lensActive: boolean;
	lensX: number;
	lensY: number;
};

type CanvasSize = {
	width: number;
	height: number;
	dpr: number;
};

type SunburstColors = {
	foreground: string;
	background: string;
};

const DEFAULT_CONFIG: SunburstConfig = {
	rayCount: 40,
	innerRadiusRatio: 0.1,
	thicknessRatio: 0.9,
	gapRatio: 0.1,
	invertBend: true,
};

const IDLE_ROTATION_SPEED = 0.05; // rad/sec when not interacting

function clamp(value: number, min: number, max: number): number {
	if (value < min) {
		return min;
	}
	if (value > max) {
		return max;
	}
	return value;
}

function normaliseAngleDelta(delta: number): number {
	let result = delta;
	if (result > Math.PI) {
		result -= Math.PI * 2;
	} else if (result < -Math.PI) {
		result += Math.PI * 2;
	}
	return result;
}

function getThemeColors(): SunburstColors {
	const style = getComputedStyle(document.documentElement);
	const foreground = style.getPropertyValue("--color-foreground").trim() || "#000000";
	const background = style.getPropertyValue("--color-background").trim() || "#ffffff";

	return { foreground, background };
}

function createHatchPattern(context: CanvasRenderingContext2D, colors: SunburstColors): CanvasPattern | null {
	const patternCanvas = document.createElement("canvas");
	const size = 10;
	patternCanvas.width = size;
	patternCanvas.height = size;
	const patternContext = patternCanvas.getContext("2d");

	if (patternContext === null) {
		return null;
	}

	patternContext.clearRect(0, 0, size, size);
	patternContext.fillStyle = colors.background;
	patternContext.fillRect(0, 0, size, size);

	patternContext.strokeStyle = colors.foreground;
	patternContext.lineWidth = 1;

	// Ligne principale
	patternContext.beginPath();
	patternContext.moveTo(0, size);
	patternContext.lineTo(size, 0);
	patternContext.stroke();

	// Lignes supplémentaires pour assurer la continuité
	patternContext.beginPath();
	patternContext.moveTo(-size, size);
	patternContext.lineTo(0, 0);
	patternContext.stroke();

	patternContext.beginPath();
	patternContext.moveTo(size, size);
	patternContext.lineTo(size * 2, 0);
	patternContext.stroke();

	const pattern = context.createPattern(patternCanvas, "repeat");
	return pattern;
}

function drawRayPath(
	context: CanvasRenderingContext2D,
	centerX: number,
	centerY: number,
	innerRadius: number,
	outerRadius: number,
	angleStart: number,
	angleEnd: number,
	bend: number,
): void {
	const radialSpan = outerRadius - innerRadius;
	const midRadius = innerRadius + radialSpan / 2;
	const bendMagnitude = bend * radialSpan;

	const dirStartX = Math.cos(angleStart);
	const dirStartY = Math.sin(angleStart);
	const dirEndX = Math.cos(angleEnd);
	const dirEndY = Math.sin(angleEnd);

	const tangentStartX = -dirStartY;
	const tangentStartY = dirStartX;
	const tangentEndX = -dirEndY;
	const tangentEndY = dirEndX;

	const innerStartX = centerX + innerRadius * dirStartX;
	const innerStartY = centerY + innerRadius * dirStartY;
	const outerStartX = centerX + outerRadius * dirStartX;
	const outerStartY = centerY + outerRadius * dirStartY;
	const innerEndX = centerX + innerRadius * dirEndX;
	const innerEndY = centerY + innerRadius * dirEndY;

	const midBaseStartX = centerX + midRadius * dirStartX;
	const midBaseStartY = centerY + midRadius * dirStartY;
	const midBaseEndX = centerX + midRadius * dirEndX;
	const midBaseEndY = centerY + midRadius * dirEndY;

	const controlStartX = midBaseStartX + tangentStartX * bendMagnitude;
	const controlStartY = midBaseStartY + tangentStartY * bendMagnitude;
	const controlEndX = midBaseEndX + tangentEndX * bendMagnitude;
	const controlEndY = midBaseEndY + tangentEndY * bendMagnitude;

	context.beginPath();
	context.moveTo(innerStartX, innerStartY);
	context.quadraticCurveTo(controlStartX, controlStartY, outerStartX, outerStartY);
	context.arc(centerX, centerY, outerRadius, angleStart, angleEnd);
	context.quadraticCurveTo(controlEndX, controlEndY, innerEndX, innerEndY);
	context.arc(centerX, centerY, innerRadius, angleEnd, angleStart, true);
	context.closePath();
}

export class Sunburst {
	#canvas: HTMLCanvasElement;
	#context: CanvasRenderingContext2D | null = null;
	#size: CanvasSize = { width: 0, height: 0, dpr: 1 };
	#config: SunburstConfig;
	#state: SunburstState = {
		rotation: 0,
		bend: 0,
		lastPointerAngle: null,
		lensActive: false,
		lensX: 0,
		lensY: 0,
	};
	#hatchPattern: CanvasPattern | null = null;
	#relaxTimeoutId: number | null = null;
	#transformReady = false;
	#colors: SunburstColors = getThemeColors();
	#resizeObserver: ResizeObserver | null = null;
	#lensRadiusPx = Sunburst.#readCssLensRadius();
	#quickLensX: ((value: number) => gsap.core.Tween) | null = null;
	#quickLensY: ((value: number) => gsap.core.Tween) | null = null;
	#isRunning = false;

	#unsubscribeTheme: (() => void) | null = null;

	constructor(canvas: HTMLCanvasElement, config?: Partial<SunburstConfig>) {
		this.#canvas = canvas;
		this.#config = { ...DEFAULT_CONFIG, ...config };

		this.resize();
		this.#state.lensX = this.#size.width / 2;
		this.#state.lensY = this.#size.height / 2;
		this.#updateColorsFromTheme();
		this.#subscribeToThemeChanges();

		this.#quickLensX = gsap.quickTo(this.#state, "lensX", { duration: 0.3, ease: "power2.out" });
		this.#quickLensY = gsap.quickTo(this.#state, "lensY", { duration: 0.3, ease: "power2.out" });

		this.#canvas.addEventListener("mousemove", this.#handleMouseMove);
		this.#canvas.addEventListener("mouseleave", this.#handleMouseLeave);
		this.#canvas.addEventListener("touchmove", this.#handleTouchMove, { passive: true });
		this.#canvas.addEventListener("touchend", this.#handleMouseLeave);

		this.#resizeObserver = new ResizeObserver(() => this.resize());
		this.#resizeObserver.observe(this.#canvas);
	}

	start(): void {
		if (this.#isRunning) return;
		gsap.ticker.add(this.#tick);
		this.#isRunning = true;
	}

	stop(): void {
		if (!this.#isRunning) return;
		gsap.ticker.remove(this.#tick);
		this.#isRunning = false;
	}

	resize(): void {
		const rect = this.#canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;

		const displayWidth = Math.max(1, Math.floor(rect.width * dpr));
		const displayHeight = Math.max(1, Math.floor(rect.height * dpr));

		this.#size.width = rect.width;
		this.#size.height = rect.height;
		this.#size.dpr = dpr;

		if (this.#context === null) {
			this.#context = this.#canvas.getContext("2d");
			if (this.#context === null) {
				return;
			}
			this.#transformReady = false;
		}

		const shouldResize =
			displayWidth !== this.#canvas.width || displayHeight !== this.#canvas.height || !this.#transformReady;

		if (shouldResize) {
			this.#canvas.width = displayWidth;
			this.#canvas.height = displayHeight;
			this.#context.setTransform(dpr, 0, 0, dpr, 0, 0);
			this.#transformReady = true;
		}

		if (this.#hatchPattern === null) {
			this.#hatchPattern = createHatchPattern(this.#context, this.#colors);
		}
	}

	destroy(): void {
		this.stop();
		this.#canvas.removeEventListener("mousemove", this.#handleMouseMove);
		this.#canvas.removeEventListener("mouseleave", this.#handleMouseLeave);
		this.#canvas.removeEventListener("touchmove", this.#handleTouchMove);
		this.#canvas.removeEventListener("touchend", this.#handleMouseLeave);

		if (this.#relaxTimeoutId !== null) {
			window.clearTimeout(this.#relaxTimeoutId);
			this.#relaxTimeoutId = null;
		}

		this.#resizeObserver?.disconnect();

		gsap.killTweensOf(this.#state);

		this.#unsubscribeTheme?.();
	}

	#subscribeToThemeChanges(): void {
		this.#unsubscribeTheme = events.onThemeChange(() => {
			this.#updateColorsFromTheme();
		});
	}

	#updateColorsFromTheme(): void {
		this.#colors = getThemeColors();
		this.#lensRadiusPx = Sunburst.#readCssLensRadius();
		if (this.#context !== null) {
			this.#hatchPattern = createHatchPattern(this.#context, this.#colors);
		}
	}

	static #readCssLensRadius(): number {
		if (typeof document === "undefined") {
			return 200;
		}
		const style = getComputedStyle(document.documentElement);
		const raw = style.getPropertyValue("--lens-radius").trim();
		const numeric = parseFloat(raw);
		const diameterPx = Number.isFinite(numeric) ? numeric : 200;

		// CSS variable is the diameter; canvas needs radius.
		return Math.max(0, diameterPx * 0.5);
	}

	#animateBendTo(target: number, elastic: boolean): void {
		const clampedTarget = clamp(target, -0.5, 0.5);

		gsap.to(this.#state, {
			bend: clampedTarget,
			duration: elastic ? 1.25 : 0.2,
			ease: elastic ? "elastic.out(1, 0.1)" : "power2.out",
		});
	}

	#scheduleRelax(): void {
		if (this.#relaxTimeoutId !== null) {
			window.clearTimeout(this.#relaxTimeoutId);
		}
		this.#relaxTimeoutId = window.setTimeout(() => {
			this.#animateBendTo(0, true);
		}, 150);
	}

	#handlePointerMove(clientX: number, clientY: number): void {
		const rect = this.#canvas.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;

		const pointerX = clientX;
		const pointerY = clientY;

		const angle = Math.atan2(pointerY - centerY, pointerX - centerX);

		if (this.#state.lastPointerAngle !== null) {
			const rawDelta = angle - this.#state.lastPointerAngle;
			const delta = normaliseAngleDelta(rawDelta);

			this.#state.rotation += delta;

			const speed = Math.abs(delta);
			if (speed > 0.0005) {
				const direction = delta >= 0 ? 1 : -1;
				const bendDirection = this.#config.invertBend ? -direction : direction;
				const speedFactor = clamp(speed * 4, 0, 0.4);
				const targetBend = bendDirection * (0.1 + speedFactor);
				this.#animateBendTo(targetBend, false);
			}
		}

		this.#state.lastPointerAngle = angle;

		const normX = (pointerX - rect.left) / rect.width;
		const normY = (pointerY - rect.top) / rect.height;

		const targetX = clamp(normX, 0, 1) * this.#size.width;
		const targetY = clamp(normY, 0, 1) * this.#size.height;

		if (!this.#state.lensActive) {
			// Positionner directement sans animation
			this.#state.lensX = targetX;
			this.#state.lensY = targetY;
			this.#state.lensActive = true;
		} else {
			// Animer normalement avec quickTo
			this.#quickLensX?.(targetX);
			this.#quickLensY?.(targetY);
		}

		this.#scheduleRelax();
	}

	#handleMouseMove = (event: MouseEvent): void => {
		this.#handlePointerMove(event.clientX, event.clientY);
	};

	#handleTouchMove = (event: TouchEvent): void => {
		if (event.touches.length < 1) {
			return;
		}
		const touch = event.touches[0];
		this.#handlePointerMove(touch.clientX, touch.clientY);
	};

	#handleMouseLeave = (): void => {
		if (this.#relaxTimeoutId !== null) {
			window.clearTimeout(this.#relaxTimeoutId);
			this.#relaxTimeoutId = null;
		}
		this.#animateBendTo(0, true);

		// Tuer les tweens de position de la lens
		gsap.killTweensOf(this.#state, "lensX,lensY");

		// Recréer les quickTo pour la prochaine entrée
		this.#quickLensX = gsap.quickTo(this.#state, "lensX", { duration: 0.3, ease: "power2.out" });
		this.#quickLensY = gsap.quickTo(this.#state, "lensY", { duration: 0.3, ease: "power2.out" });

		this.#state.lensActive = false;
		this.#state.lastPointerAngle = null;
	};

	#tick = (): void => {
		const deltaRatio = gsap.ticker.deltaRatio(60);
		const dtSec = deltaRatio / 60;

		if (!this.#state.lensActive) {
			this.#state.rotation += IDLE_ROTATION_SPEED * dtSec;
			if (this.#state.rotation > Math.PI * 2 || this.#state.rotation < -Math.PI * 2) {
				this.#state.rotation = ((this.#state.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
			}
		}

		this.resize();
		this.#render();
	};

	#render(): void {
		const ctx = this.#context;
		if (!ctx) return;

		const width = this.#size.width;
		const height = this.#size.height;

		if (width <= 0 || height <= 0) {
			return;
		}

		const centerX = width / 2;
		const centerY = height / 2;

		ctx.clearRect(0, 0, width, height);

		const minDim = Math.min(width, height);
		const innerRadius = minDim * 0.5 * clamp(this.#config.innerRadiusRatio, 0, 0.9);

		const halfDiagonal = Math.sqrt(centerX * centerX + centerY * centerY);
		const maxOuterRadius = halfDiagonal;
		const availableThickness = maxOuterRadius - innerRadius;
		const outerRadius = innerRadius + availableThickness * clamp(this.#config.thicknessRatio, 0, 1);

		const rayCount = Math.max(3, Math.round(this.#config.rayCount));
		const fullStep = (Math.PI * 2) / rayCount;
		const gap = fullStep * clamp(this.#config.gapRatio, 0, 0.5);
		const arcAngle = fullStep - gap;

		ctx.fillStyle = this.#colors.foreground;
		for (let index = 0; index < rayCount; index += 1) {
			const angleStart = index * fullStep + gap / 2 + this.#state.rotation;
			const angleEnd = angleStart + arcAngle;

			drawRayPath(ctx, centerX, centerY, innerRadius, outerRadius, angleStart, angleEnd, this.#state.bend);
			ctx.fill();
		}

		if (this.#state.lensActive && this.#hatchPattern !== null) {
			this.#lensRadiusPx = Sunburst.#readCssLensRadius();
			const lensRadius = this.#lensRadiusPx;

			ctx.save();
			ctx.beginPath();
			ctx.arc(this.#state.lensX, this.#state.lensY, lensRadius, 0, Math.PI * 2);
			ctx.clip();

			const strokeScale = Math.max(1, Math.min(width, height) / 500);

			ctx.fillStyle = this.#hatchPattern;
			ctx.strokeStyle = this.#colors.background;
			ctx.lineWidth = strokeScale;
			ctx.setLineDash([6 * strokeScale, 4 * strokeScale]);

			for (let index = 0; index < rayCount; index += 1) {
				const angleStart = index * fullStep + gap / 2 + this.#state.rotation;
				const angleEnd = angleStart + arcAngle;

				drawRayPath(ctx, centerX, centerY, innerRadius, outerRadius, angleStart, angleEnd, this.#state.bend);
				ctx.fill();
				ctx.stroke();
			}

			ctx.setLineDash([]);
			ctx.restore();
		}

		if (innerRadius > 0) {
			ctx.fillStyle = this.#colors.background;
			ctx.beginPath();
			ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
			ctx.fill();
		}
	}
}
