import gsap from "gsap";
import { get2DContext } from "./_utils";

export class GridSquare {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	diagonalPattern: CanvasPattern | null;

	squareSize = 60;
	radius = 0;
	padding = 4;
	bgColor = "oklch(0.9332 0.025 75.27)";
	fgColor = "oklch(0.329 0 0)";

	mouseX = 0;
	mouseY = 0;
	hoverRadius = 100; // Rayon du cercle autour de la souris
	cornerConfig = { radius: this.radius, padding: this.padding };

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		const rect = canvas.parentElement?.getBoundingClientRect();
		this.canvas.width = rect?.width || this.canvas.width;
		this.canvas.height = rect?.height || this.canvas.height;
		this.ctx = get2DContext(canvas);
		this.diagonalPattern = this.createDiagonalPattern();
		this.resize();

		gsap.ticker.fps(60);
		gsap.ticker.add(() => this.render());
	}

	resize() {
		const resizeObserver = new ResizeObserver(() => {
			const rect = this.canvas.parentElement?.getBoundingClientRect();
			this.canvas.width = rect?.width || this.canvas.width;
			this.canvas.height = rect?.height || this.canvas.height;
			this.render(); // render directly to avoid flickering
		});
		if (!this.canvas.parentElement) return;
		resizeObserver.observe(this.canvas.parentElement);
	}

	createDiagonalPattern(spacing: number = 4) {
		const canvas = document.createElement("canvas");
		canvas.width = spacing * 2;
		canvas.height = spacing * 2;
		const ctx = get2DContext(canvas);

		ctx.strokeStyle = this.fgColor;
		ctx.lineWidth = 0.5;

		// Diagonale de haut-droite à bas-gauche
		ctx.beginPath();
		ctx.moveTo(spacing * 2, 0);
		ctx.lineTo(0, spacing * 2);
		ctx.stroke();

		return this.ctx.createPattern(canvas, "repeat");
	}

	drawFilledSquare(x: number, y: number, size: number, radius: number) {
		const padding = this.padding;
		this.ctx.fillStyle = this.fgColor;
		this.ctx.beginPath();
		this.ctx.roundRect(
			x + padding,
			y + padding,
			size - padding * 2,
			size - padding * 2,
			radius,
		);
		this.ctx.fill();
	}

	drawWireframeSquare(x: number, y: number, size: number, radius: number) {
		if (!this.diagonalPattern) return;

		const path = new Path2D();
		const padding = this.padding;
		path.roundRect(
			x + padding,
			y + padding,
			size - padding * 2,
			size - padding * 2,
			radius,
		);
		this.ctx.strokeStyle = this.fgColor;
		this.ctx.lineWidth = 0.5;
		this.ctx.setLineDash([2, 5, 2]);
		this.ctx.stroke(path);
		this.ctx.setLineDash([]); // reset line dash

		this.ctx.fillStyle = this.diagonalPattern;
		this.ctx.fill(path);
	}

	drawGrid() {
		const cols = Math.floor(this.canvas.width / this.squareSize);
		const rows = Math.floor(this.canvas.height / this.squareSize);

		const offsetX = (this.canvas.width - cols * this.squareSize) / 2;
		const offsetY = (this.canvas.height - rows * this.squareSize) / 2;

		for (let x = 0; x < cols; x++) {
			for (let y = 0; y < rows; y++) {
				const squareX = offsetX + x * this.squareSize;
				const squareY = offsetY + y * this.squareSize;
				const squareCenterX = squareX + this.squareSize / 2;
				const squareCenterY = squareY + this.squareSize / 2;

				// Distance entre le carré et la souris
				const distance = Math.hypot(
					squareCenterX - this.mouseX,
					squareCenterY - this.mouseY,
				);

				// Si dans le rayon, utilise le radius animé, sinon le radius normal
				const radius =
					distance < this.hoverRadius ? this.cornerConfig.radius : this.radius;

				this.drawFilledSquare(squareX, squareY, this.squareSize, radius);
			}
		}
	}

	render() {
		this.ctx.fillStyle = this.bgColor; // Set background color
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.drawGrid();
	}

	dispose() {}
}
