export function resizeCanvasToDisplaySize({
	canvas,
	maxDPR,
}: {
	canvas: HTMLCanvasElement;
	maxDPR?: number;
}): boolean {
	const dprRaw = window.devicePixelRatio || 1;
	const dpr = maxDPR ? Math.min(dprRaw, maxDPR) : dprRaw;

	const width = Math.floor(canvas.clientWidth * dpr);
	const height = Math.floor(canvas.clientHeight * dpr);
	if (canvas.width !== width || canvas.height !== height) {
		canvas.width = width;
		canvas.height = height;
		return true;
	}
	return false;
}

/** Heuristique simple pour adapter perf mobile */
export function isLikelyMobile(): boolean {
	const ua = navigator.userAgent.toLowerCase();
	return /iphone|ipad|ipod|android|mobile/.test(ua);
}
