export function get2DContext(canvas: HTMLCanvasElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Failed to get 2D context");
	return ctx;
}

export function getPointDistance(start: number, end: number) {
	return Math.abs(Math.floor(start - end));
}

export function get2DPointDistance(x1: number, y1: number, x2: number, y2: number) {
	return Math.hypot(x2 - x1, y2 - y1);
}

type SVGPath = {
	size: number;
	startPoint: number;
	controlPoint: number;
	endPoint: number;
	dir: "hor" | "ver";
};
export function setPathSVG({ size, startPoint, controlPoint, endPoint, dir }: SVGPath) {
	return dir === "hor"
		? `M0,${startPoint} Q${size / 2},${controlPoint} ${size},${endPoint}`
		: `M${startPoint},0 Q${controlPoint},${size / 2} ${endPoint},${size}`;
}

export function getMousePosCanvas(canvas: HTMLCanvasElement, event: MouseEvent) {
	const { left, top } = canvas.getBoundingClientRect();

	return {
		x: event.clientX - left,
		y: event.clientY - top,
	};
}

export function getMousePosSVG(svg: SVGSVGElement, event: MouseEvent) {
	const pt = svg.createSVGPoint();

	pt.x = event.clientX;
	pt.y = event.clientY;

	return pt.matrixTransform(svg.getScreenCTM()?.inverse());
}
