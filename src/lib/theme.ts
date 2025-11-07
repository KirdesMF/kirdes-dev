export type Theme = {
	bg: [number, number, number, number];
	bgCss: string;
	text: string;
	line: [number, number, number, number];
	sparkle: [number, number, number, number];
};

export function parseColor(cssColor: string): [number, number, number] {
	// Create a temporary canvas to convert any CSS color to RGB
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");

	if (!ctx) return [0, 0, 0];

	// Draw with the color - canvas will convert OKLCH to RGB internally
	ctx.fillStyle = cssColor;
	ctx.fillRect(0, 0, 1, 1);

	// Get the RGB data
	const imageData = ctx.getImageData(0, 0, 1, 1);
	const [r, g, b] = imageData.data;

	return [r / 255, g / 255, b / 255];
}

export function getTheme(): Theme {
	const style = getComputedStyle(document.documentElement);
	const bgColor = style.getPropertyValue("--color-background").trim();
	const fgColor = style.getPropertyValue("--color-foreground").trim();

	const bg = parseColor(bgColor);
	const fg = parseColor(fgColor);

	return {
		bg: [...bg, 1],
		bgCss: bgColor,
		text: fgColor, // Keep as OKLCH string for canvas text
		line: [...fg, 1],
		sparkle: [...fg, 1],
	};
}

export function isDark() {
	return document.documentElement.classList.contains("dark");
}

export function onThemeChange(callback: (theme: Theme) => void) {
	const handler = () => callback(getTheme());

	// Listen to custom event
	window.addEventListener("themechange", handler);

	// Return cleanup function
	return () => window.removeEventListener("themechange", handler);
}
