export function get2dContext(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("2D context not available");
	return ctx;
}
