import gsap from "gsap";

// Canvas scale
const dpr = devicePixelRatio || 1;

// Style de la grille
const LINE_WIDTH = 0.75;
const LINE_DASH = [5, 5];
const SPACING = 30;

// ✦ Ripple radial (clic) — sans écho
const RIPPLE_SPEED = 200; // px/s
const RIPPLE_LAMBDA = 300; // px (longueur d’onde)
const RIPPLE_DECAY_TIME = 4; // s (durée de décroissance de l’amplitude)
const RIPPLE_SPACE_ATTEN = 0.005; // atténuation spatiale
const RIPPLE_CLICK_AMP = 50; // amplitude de base au clic

// ✦ Souffle global (respiration très subtile)
const REDUCED_MOTION =
	typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const BREATH_FREQ = 0.07; // Hz (~14 s par cycle)
const BREATH_AMP = REDUCED_MOTION ? 0 : 0.35; // px
const BREATH_ALONG_FREQ = 0.004; // px^-1

type GridRipple = {
	t0: number;
	cx: number;
	cy: number;
	amp: number; // animé par GSAP → 0
	lambda: number;
	speed: number;
};

class ElasticLine {
	position: number; // x (verticale) ou y (horizontale)
	size: number; // h (verticale) ou w (horizontale)
	color: string;
	isVertical: boolean;

	private breathPhase = Math.random() * Math.PI * 2;

	constructor(position: number, size: number, color: string, isVertical: boolean) {
		this.position = position;
		this.size = size;
		this.color = color;
		this.isVertical = isVertical;
	}

	// ✦ souffle global très léger
	private breathAt(s: number, tSec: number): number {
		if (BREATH_AMP === 0) return 0;
		const temporal = Math.sin(this.breathPhase + 2 * Math.PI * BREATH_FREQ * tSec);
		const spatial = Math.sin(this.breathPhase * 0.73 + s * BREATH_ALONG_FREQ);
		return BREATH_AMP * (0.7 * temporal + 0.3 * spatial);
	}

	// rendu polyline (+ support d’un offset additionnel: ripple clic)
	draw(
		ctx: CanvasRenderingContext2D,
		tSec: number,
		extraOffset?: (s: number, tSec: number, line: ElasticLine) => number,
	) {
		ctx.strokeStyle = this.color;
		ctx.lineWidth = LINE_WIDTH;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.setLineDash(LINE_DASH);

		const samples = 32;
		const step = this.size / samples;

		ctx.beginPath();
		if (this.isVertical) {
			for (let i = 0; i <= samples; i++) {
				const s = i * step;
				const extra = extraOffset ? extraOffset(s, tSec, this) : 0;
				const x = this.position + this.breathAt(s, tSec) + extra;
				const y = s;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
		} else {
			for (let i = 0; i <= samples; i++) {
				const s = i * step;
				const extra = extraOffset ? extraOffset(s, tSec, this) : 0;
				const x = s;
				const y = this.position + this.breathAt(s, tSec) + extra;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
		}
		ctx.stroke();
	}
}

function get2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get 2D context");
	return ctx;
}

// axes
type AxisMode = "x" | "y" | "both";
function normalizeAxisMode(mode?: string): AxisMode {
	if (!mode) return "both";
	const m = mode.toLowerCase();
	return m === "x" || m === "y" || m === "both" ? (m as AxisMode) : "both";
}

export class ElasticRippleCanvas {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	width = 0;
	height = 0;
	verticalLines: ElasticLine[] = [];
	horizontalLines: ElasticLine[] = [];
	isAnimating = false;

	private _startTime = performance.now() / 1000;
	private axisMode: AxisMode = "both";

	// Ripples au clic
	private gridRipples: GridRipple[] = [];

	constructor(canvas: HTMLCanvasElement, mode: AxisMode = "both") {
		this.canvas = canvas;
		this.ctx = get2DContext(canvas);
		this.axisMode = normalizeAxisMode(mode);

		this.init();
		this.setupEventListeners();

		gsap.ticker.add(this.draw);
		this.isAnimating = true;
	}

	init() {
		this.resize();

		const spacing = this.width / SPACING;

		this.verticalLines =
			this.axisMode === "both" || this.axisMode === "x"
				? this.createLines(this.width, spacing, "#000", true)
				: [];
		this.horizontalLines =
			this.axisMode === "both" || this.axisMode === "y"
				? this.createLines(this.height, spacing, "#000", false)
				: [];

		this.draw();
	}

	createLines(size: number, space: number, color: string, isVertical: boolean): ElasticLine[] {
		const lines: ElasticLine[] = [];
		const perpSize = isVertical ? this.height : this.width;

		const numLines = Math.floor(size / space);
		const totalWidth = numLines * space;
		const offset = (size - totalWidth) / 2;

		for (let i = 0; i <= numLines; i++) {
			const position = offset + i * space;
			lines.push(new ElasticLine(position, perpSize, color, isVertical));
		}
		return lines;
	}

	resize() {
		this.width = this.canvas.clientWidth;
		this.height = this.canvas.clientHeight;

		this.canvas.width = Math.max(1, Math.floor(this.width * dpr));
		this.canvas.height = Math.max(1, Math.floor(this.height * dpr));

		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.scale(dpr, dpr);
	}

	// Ripple radial: créer + animer amp → 0 (sans écho)
	private addGridRipple(cx: number, cy: number, amp: number) {
		const r: GridRipple = {
			t0: performance.now() / 1000,
			cx,
			cy,
			amp,
			lambda: RIPPLE_LAMBDA,
			speed: RIPPLE_SPEED,
		};
		this.gridRipples.push(r);
		gsap.to(r, {
			amp: 0,
			duration: RIPPLE_DECAY_TIME,
			ease: "power3.out",
			onComplete: () => {
				const i = this.gridRipples.indexOf(r);
				if (i >= 0) this.gridRipples.splice(i, 1);
			},
		});
	}

	// contribution du ripple radial pour une ligne
	private rippleExtraOffset = (s: number, tSec: number, line: ElasticLine): number => {
		if (!this.gridRipples.length) return 0;

		const px = line.isVertical ? line.position : s;
		const py = line.isVertical ? s : line.position;

		let sum = 0;
		const twoPi = Math.PI * 2;

		for (const r of this.gridRipples) {
			if (r.amp <= 0.001) continue;
			const age = tSec - r.t0;
			if (age < 0) continue;

			const dx = px - r.cx,
				dy = py - r.cy;
			const dist = Math.hypot(dx, dy);
			const phase = twoPi * ((age * r.speed - dist) / r.lambda);
			const envSpace = Math.exp(-RIPPLE_SPACE_ATTEN * dist);

			sum += r.amp * envSpace * Math.sin(phase);
		}
		return sum;
	};

	// Clic → ripple
	onClick = (event: MouseEvent) => {
		const rect = this.canvas.getBoundingClientRect();
		const cx = event.clientX - rect.left;
		const cy = event.clientY - rect.top;
		this.addGridRipple(cx, cy, RIPPLE_CLICK_AMP);
	};

	draw = () => {
		this.checkResize();

		const tSec = performance.now() / 1000 - this._startTime;

		this.ctx.clearRect(0, 0, this.width, this.height);
		this.ctx.save();
		this.ctx.translate(-0.5, -0.5);

		for (const line of this.verticalLines) line.draw(this.ctx, tSec, this.rippleExtraOffset);
		for (const line of this.horizontalLines) line.draw(this.ctx, tSec, this.rippleExtraOffset);

		this.ctx.restore();
	};

	setupEventListeners() {
		this.canvas.addEventListener("pointerdown", this.onClick);
	}

	checkResize() {
		const newWidth = this.canvas.clientWidth;
		const newHeight = this.canvas.clientHeight;
		if (newWidth !== this.width || newHeight !== this.height) this.init();
	}
}
