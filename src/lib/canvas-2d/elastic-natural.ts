import gsap from "gsap";
import { getMousePosCanvas, getPointDistance } from "./_utils";

const dpr = devicePixelRatio || 1;

const MAX_SNAP_DIST = 150;
const GRAB_DIST = 2;
const LINE_WIDTH = 0.75;
const LINE_DASH = [3, 5];
const SPACING = 30;

// ✦ réglages des nouveaux effets (lignes)
const SMALL_PULL = 25;
const RELEASE_ELASTIC = "elastic.out(1, 0.15)";
const RELEASE_BACK = "back.out(1.4)";
const RELEASE_OUTQUART = "power4.out";

const WAVE_SPEED = 240; // px/s
const WAVE_LAMBDA = 140; // px
const WAVE_DECAY_TIME = 1.8; // s
const WAVE_SPACE_ATTEN = 0.014;
const WAVE_AMP_MULT = 0.55;

// Souffle global (respiration)
const REDUCED_MOTION =
	typeof window !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const BREATH_FREQ = 0.07; // Hz
const BREATH_AMP = REDUCED_MOTION ? 0 : 0.35; // px
const BREATH_ALONG_FREQ = 0.004; // px^-1

type Pulse = {
	t0: number; // s
	origin: number; // 0..size (grabPoint)
	amp: number; // px
	lambda: number;
	speed: number; // px/s
	decay: number; // s^-1
};

class ElasticLine {
	position: number; // x (verticale) ou y (horizontale)
	size: number; // h (verticale) ou w (horizontale)
	color: string;
	isVertical: boolean;

	grabPoint = 0; // 0..size
	grabOffset = 0;
	isSnapped = false;

	private pulses: Pulse[] = [];
	private breathPhase = Math.random() * Math.PI * 2;

	constructor(position: number, size: number, color: string, isVertical: boolean) {
		this.position = position;
		this.size = size;
		this.color = color;
		this.isVertical = isVertical;
		this.grabPoint = size / 2;
	}

	checkMouseProximity(mousePos: number, mousePerpendicular: number): boolean {
		const distance = getPointDistance(this.position, mousePos);
		if (distance <= GRAB_DIST && !this.isSnapped) {
			this.isSnapped = true;
			this.grabPoint = clamp(mousePerpendicular, 0, this.size);
			gsap.killTweensOf(this);
			return true;
		}
		return false;
	}

	updateGrab(mousePos: number, mousePerpendicular: number) {
		if (!this.isSnapped) return;
		this.grabOffset = mousePos - this.position;
		this.grabPoint = clamp(mousePerpendicular, 0, this.size);
		if (Math.abs(this.grabOffset) > MAX_SNAP_DIST) {
			this.release(performance.now() / 1000);
		}
	}

	private addPulse(nowSec: number, amp: number, origin: number) {
		this.pulses.push({
			t0: nowSec,
			origin,
			amp,
			lambda: WAVE_LAMBDA,
			speed: WAVE_SPEED,
			decay: 1 / WAVE_DECAY_TIME,
		});
	}

	release(nowSec: number) {
		const magnitude = Math.abs(this.grabOffset);
		this.isSnapped = false;

		// Onde principale (pas d'écho)
		if (magnitude > 0.5) {
			this.addPulse(nowSec, magnitude * WAVE_AMP_MULT, this.grabPoint);
		}

		const ease =
			magnitude < SMALL_PULL
				? magnitude < SMALL_PULL * 0.5
					? RELEASE_OUTQUART
					: RELEASE_BACK
				: RELEASE_ELASTIC;

		gsap.to(this, {
			grabOffset: 0,
			ease,
			duration: lerp(0.5, 2.5, clamp01(magnitude / MAX_SNAP_DIST)),
		});
	}

	private breathAt(s: number, tSec: number): number {
		if (BREATH_AMP === 0) return 0;
		const temporal = Math.sin(this.breathPhase + 2 * Math.PI * BREATH_FREQ * tSec);
		const spatial = Math.sin(this.breathPhase * 0.73 + s * BREATH_ALONG_FREQ);
		return BREATH_AMP * (0.7 * temporal + 0.3 * spatial);
	}

	private wavesAt(s: number, tSec: number): number {
		if (!this.pulses.length) return 0;
		let sum = 0;
		const twoPi = Math.PI * 2;

		this.pulses = this.pulses.filter((p) => {
			const age = tSec - p.t0;
			if (age < 0) return false;
			const envTime = Math.exp(-p.decay * age);
			if (envTime < 0.04) return false;

			const dist = Math.abs(s - p.origin);
			const phase = twoPi * (dist / p.lambda - (p.speed * age) / p.lambda);
			const envSpace = Math.exp(-WAVE_SPACE_ATTEN * dist);

			sum += p.amp * envTime * envSpace * Math.sin(phase);
			return true;
		});
		return sum;
	}

	private localGrabDeformAt(s: number): number {
		if (Math.abs(this.grabOffset) < 0.001) return 0;
		const sigma = Math.max(18, this.size * 0.06);
		return this.grabOffset * gaussian(s, this.grabPoint, sigma);
	}

	private offsetAt(s: number, tSec: number): number {
		return this.localGrabDeformAt(s) + this.wavesAt(s, tSec) + this.breathAt(s, tSec);
	}

	draw(ctx: CanvasRenderingContext2D, tSec: number) {
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
				const x = this.position + this.offsetAt(s, tSec);
				const y = s;
				if (i === 0) ctx.moveTo(x, y);
				else ctx.lineTo(x, y);
			}
		} else {
			for (let i = 0; i <= samples; i++) {
				const s = i * step;
				const x = s;
				const y = this.position + this.offsetAt(s, tSec);
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

export class ElasticNaturalCanvas {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	width = 0;
	height = 0;
	verticalLines: ElasticLine[] = [];
	horizontalLines: ElasticLine[] = [];
	isAnimating = false;

	private _startTime = performance.now();
	private axisMode: AxisMode = "both";

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

	onMouseMove = (event: MouseEvent) => {
		const { x, y } = getMousePosCanvas(this.canvas, event);

		if (this.verticalLines.length) {
			for (const line of this.verticalLines) {
				if (line.checkMouseProximity(x, y)) {
					/* noop */
				}
				line.updateGrab(x, y);
			}
		}
		if (this.horizontalLines.length) {
			for (const line of this.horizontalLines) {
				if (line.checkMouseProximity(y, x)) {
					/* noop */
				}
				line.updateGrab(y, x);
			}
		}
	};

	onMouseLeave = () => {
		const nowSec = performance.now() / 1000;
		for (const line of this.verticalLines) {
			line.isSnapped = false;
			line.release(nowSec);
		}
		for (const line of this.horizontalLines) {
			line.isSnapped = false;
			line.release(nowSec);
		}
	};

	draw = () => {
		this.checkResize();

		const tSec = (performance.now() - this._startTime) / 1000;

		this.ctx.clearRect(0, 0, this.width, this.height);
		this.ctx.save();
		this.ctx.translate(-0.5, -0.5);

		for (const line of this.verticalLines) line.draw(this.ctx, tSec);
		for (const line of this.horizontalLines) line.draw(this.ctx, tSec);

		this.ctx.restore();
	};

	setupEventListeners() {
		this.canvas.addEventListener("mousemove", this.onMouseMove);
		this.canvas.addEventListener("mouseleave", this.onMouseLeave);
	}

	checkResize() {
		const newWidth = this.canvas.clientWidth;
		const newHeight = this.canvas.clientHeight;
		if (newWidth !== this.width || newHeight !== this.height) this.init();
	}
}

// Utils
function clamp(v: number, a: number, b: number) {
	return Math.max(a, Math.min(b, v));
}
function clamp01(v: number) {
	return clamp(v, 0, 1);
}
function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}
function gaussian(x: number, mu: number, sigma: number) {
	const d = (x - mu) / sigma;
	return Math.exp(-0.5 * d * d);
}
