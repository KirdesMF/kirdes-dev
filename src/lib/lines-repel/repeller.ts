import type { Point } from "./_types";

export class Repeller {
	coords: Point = { x: 0, y: 0 };
	radius: number = 0;

	getCoords(): Point {
		return this.coords;
	}

	getRadius(): number {
		return this.radius;
	}

	setRepeller({ center, radius }: { center: Point; radius: number }) {
		const x = center.x;
		const y = center.y;
		this.coords = { x, y };
		this.radius = radius;
	}

	draw(
		ctx: CanvasRenderingContext2D,
		config?: { color: string; alpha: number },
	) {
		if (this.radius <= 0) return;
		ctx.save();
		ctx.globalAlpha = config?.alpha || 0;
		ctx.beginPath();
		ctx.arc(this.coords.x, this.coords.y, this.radius, 0, Math.PI * 2);
		ctx.fillStyle = config?.color || "red";
		ctx.fill();
		ctx.restore();
	}
}
