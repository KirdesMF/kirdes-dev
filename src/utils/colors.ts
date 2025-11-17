type Rgb01 = [number, number, number];

/**
 * Converts a CSS color string to RGB values in the range [0, 255].
 */
export function cssColorToRgb255(cssColor: string): [number, number, number] {
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	if (!ctx) return [0, 0, 0];

	ctx.fillStyle = cssColor;
	ctx.fillRect(0, 0, 1, 1);
	const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
	return [r, g, b];
}

/**
 * Converts a CSS color string to RGB values in the range [0, 1].
 */
export function cssColorToRgb01(cssColor: string): Rgb01 {
	const [r, g, b] = cssColorToRgb255(cssColor);
	return [r / 255, g / 255, b / 255];
}

/**
 * Converts a CSS color string to a PixiJS hex color value.
 */
export function cssColorToPixiHex(cssColor: string): number {
	const [r, g, b] = cssColorToRgb255(cssColor);
	return (r << 16) | (g << 8) | b;
}

/**
 * Converts a CSS color string to a PixiJS hex color value.
 */
export function cssVarToPixiHex(cssVar: string): number {
	const cssColor = getComputedStyle(document.documentElement).getPropertyValue(
		cssVar,
	);
	return cssColorToPixiHex(cssColor);
}
