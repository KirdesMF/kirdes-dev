let colorCanvas: HTMLCanvasElement | null = null;
let colorCtx: CanvasRenderingContext2D | null = null;

function getColorContext(): CanvasRenderingContext2D {
	if (!colorCanvas || !colorCtx) {
		colorCanvas = document.createElement("canvas");
		colorCanvas.width = 1;
		colorCanvas.height = 1;

		const ctx = colorCanvas.getContext("2d", { willReadFrequently: true });
		if (!ctx) throw new Error("Canvas 2D context not supported");
		colorCtx = ctx;
	}

	return colorCtx;
}

export function cssColorToVec3(color: string): [number, number, number] {
	const ctx = getColorContext();

	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);

	const data = ctx.getImageData(0, 0, 1, 1).data;
	const r = data[0] / 255;
	const g = data[1] / 255;
	const b = data[2] / 255;

	return [r, g, b];
}
