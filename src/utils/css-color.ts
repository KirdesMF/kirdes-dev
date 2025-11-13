let _ctx: CanvasRenderingContext2D | null = null;

function getCtx() {
	if (_ctx) return _ctx;
	const canvas = document.createElement("canvas");
	_ctx = canvas.getContext("2d");
	return _ctx;
}

export type RGBA8bit = { r: number; g: number; b: number; a: number };

export function cssColorToRGBA(color: string): RGBA8bit {
	const ctx = getCtx();
	if (!ctx) return { r: 0, g: 0, b: 0, a: 255 };

	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, 1, 1);
	const data = ctx.getImageData(0, 0, 1, 1).data; // RGBA 8-bit
	return { r: data[0], g: data[1], b: data[2], a: data[3] };
}

export function cssVarToPixiColor(name: string) {
	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue(name)
		.trim();
	const { r, g, b } = cssColorToRGBA(raw);
	const rr = Math.max(0, Math.min(255, r));
	const gg = Math.max(0, Math.min(255, g));
	const bb = Math.max(0, Math.min(255, b));
	return (rr << 16) | (gg << 8) | bb;
}
