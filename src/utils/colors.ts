export type RgbFloat = {
	r: number;
	g: number;
	b: number;
};

/**
 * Convert a CSS color (including OKLCH) to linear-ish RGB floats in [0, 1].
 * Uses a 1×1 canvas so the browser does the parsing and conversion.
 */
export function convertCssColorToRgbFloat(input: string): RgbFloat {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;

	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("no canvas context to use");

	ctx.clearRect(0, 0, 1, 1);
	ctx.fillStyle = input;
	ctx.fillRect(0, 0, 1, 1);

	const data = ctx.getImageData(0, 0, 1, 1).data;
	const r = data[0] / 255;
	const g = data[1] / 255;
	const b = data[2] / 255;

	return { r, g, b };
}

export type ThemeColorsFloat = {
	background: RgbFloat;
	foreground: RgbFloat;
};

export function readThemeColorsFromCss(): ThemeColorsFloat {
	const rootStyle = getComputedStyle(document.documentElement);
	const bgRaw =
		rootStyle.getPropertyValue("--color-background").trim() || "#000000";
	const fgRaw =
		rootStyle.getPropertyValue("--color-foreground").trim() || "#ffffff";

	return {
		background: convertCssColorToRgbFloat(bgRaw),
		foreground: convertCssColorToRgbFloat(fgRaw),
	};
}

export function rgbFloatToHex(color: RgbFloat): number {
	const r = Math.round(color.r * 255);
	const g = Math.round(color.g * 255);
	const b = Math.round(color.b * 255);
	return (r << 16) | (g << 8) | b;
}
