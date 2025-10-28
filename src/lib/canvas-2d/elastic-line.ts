import gsap from "gsap";
import { getMousePosCanvas, getPointDistance } from "./_utils";

const dpr = devicePixelRatio || 1;

const MAX_SNAP_DIST = 100;
const GRAB_DIST = 2;
const LINE_WIDTH = 1;
const LINE_DASH = [5, 5];
const SPACING = 30;

class ElasticLine {
	position: number; // x for vertical, y for horizontal
	size: number; // height for vertical, width for horizontal
	color: string;
	isVertical: boolean;

	// For natural deformation: store multiple control points
	grabPoint: number = 0; // Where along the line (0 to size) the mouse grabbed
	grabOffset: number = 0; // How far from original position
	isSnapped: boolean = false;

	constructor(
		position: number,
		size: number,
		color: string,
		isVertical: boolean,
	) {
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
			this.grabPoint = mousePerpendicular; // Store where along the line we grabbed
			gsap.killTweensOf(this);
			return true;
		}

		return false;
	}

	updateGrab(mousePos: number, mousePerpendicular: number) {
		if (this.isSnapped) {
			this.grabOffset = mousePos - this.position;
			this.grabPoint = mousePerpendicular;

			// Auto-release if pulled too far
			if (Math.abs(this.grabOffset) > MAX_SNAP_DIST) {
				this.release();
			}
		}
	}

	release() {
		this.isSnapped = false;

		gsap.to(this, {
			grabOffset: 0,
			ease: "elastic.out(1, 0.1)",
			duration: 2.5,
		});
	}

	draw(ctx: CanvasRenderingContext2D) {
		ctx.strokeStyle = this.color;
		ctx.lineWidth = LINE_WIDTH;
		ctx.lineCap = "round";
		ctx.lineJoin = "round";
		ctx.setLineDash(LINE_DASH);

		if (Math.abs(this.grabOffset) < 0.5) {
			// Draw straight line when not deformed
			if (this.isVertical) {
				ctx.beginPath();
				ctx.moveTo(this.position, 0);
				ctx.lineTo(this.position, this.size);
				ctx.stroke();
			} else {
				ctx.beginPath();
				ctx.moveTo(0, this.position);
				ctx.lineTo(this.size, this.position);
				ctx.stroke();
			}
		} else {
			// Draw curved line with control point at grab location
			const path = new Path2D();
			const controlPos = this.position + this.grabOffset;

			if (this.isVertical) {
				// Vertical line: x varies, y is along the line
				path.moveTo(this.position, 0);
				path.quadraticCurveTo(
					controlPos,
					this.grabPoint,
					this.position,
					this.size,
				);
			} else {
				// Horizontal line: y varies, x is along the line
				path.moveTo(0, this.position);
				path.quadraticCurveTo(
					this.grabPoint,
					controlPos,
					this.size,
					this.position,
				);
			}

			ctx.stroke(path);
		}
	}
}

function get2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get 2D context");
	return ctx;
}

/*
 * ElasticCanvas class
 * Represents a grid of elastic lines.
 */
export class ElasticCanvas {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	width: number = 0;
	height: number = 0;
	verticalLines: ElasticLine[] = [];
	horizontalLines: ElasticLine[] = [];
	isAnimating: boolean = false;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.ctx = get2DContext(canvas);

		this.init();
		this.setupEventListeners();
	}

	init() {
		this.resize();

		const spacing = this.width / SPACING;
		this.verticalLines = this.createLines(this.width, spacing, "#000", true);
		this.horizontalLines = this.createLines(
			this.height,
			spacing,
			"#000",
			false,
		);

		this.draw();
	}

	createLines(
		size: number,
		space: number,
		color: string,
		isVertical: boolean,
	): ElasticLine[] {
		const lines: ElasticLine[] = [];
		const perpSize = isVertical ? this.height : this.width;

		// Calculate number of lines to center the grid
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

		this.canvas.width = this.width * dpr;
		this.canvas.height = this.height * dpr;

		this.ctx.scale(dpr, dpr);
	}

	onMouseMove = (event: MouseEvent) => {
		if (!this.isAnimating) {
			gsap.ticker.add(this.draw);
			this.isAnimating = true;
		}

		const { x, y } = getMousePosCanvas(this.canvas, event);

		// Update vertical lines
		for (const line of this.verticalLines) {
			line.checkMouseProximity(x, y);
			line.updateGrab(x, y);
		}

		// Update horizontal lines
		for (const line of this.horizontalLines) {
			line.checkMouseProximity(y, x);
			line.updateGrab(y, x);
		}
	};

	onMouseLeave = () => {
		// Force release all lines
		[...this.verticalLines, ...this.horizontalLines].forEach((line) => {
			line.isSnapped = false;
			line.release();
		});

		// Don't stop ticker here - let it stop naturally when animations complete
	};

	draw = () => {
		this.checkResize();

		this.ctx.clearRect(0, 0, this.width, this.height);

		this.ctx.save();
		this.ctx.translate(-0.5, -0.5);

		for (const line of this.verticalLines) {
			line.draw(this.ctx);
		}
		for (const line of this.horizontalLines) {
			line.draw(this.ctx);
		}

		this.ctx.restore();

		// Check if any lines are still animating or snapped
		const anyActive = [...this.verticalLines, ...this.horizontalLines].some(
			(line) => line.isSnapped || Math.abs(line.grabOffset) > 0.5,
		);

		// Stop ticker when all animations are done
		if (!anyActive && this.isAnimating) {
			gsap.ticker.remove(this.draw);
			this.isAnimating = false;
		}
	};

	setupEventListeners() {
		this.canvas.addEventListener("mousemove", this.onMouseMove);
		this.canvas.addEventListener("mouseleave", this.onMouseLeave);
	}

	checkResize() {
		const newWidth = this.canvas.clientWidth;
		const newHeight = this.canvas.clientHeight;

		if (newWidth !== this.width || newHeight !== this.height) {
			this.init();
		}
	}
}
