/**
 * Geometry constants and helper functions for pointy-topped hexagons.
 */

export type Point = {
	x: number;
	y: number;
};

export type HexLayout = {
	q: number; // Column (axial) - slightly modified for row-offset
	r: number; // Row (axial)
	x: number; // Pixel x center
	y: number; // Pixel y center
};

// Distance from center to a corner
export function calculateHexHeight(radius: number): number {
	return 2 * radius;
}

// Distance between opposite flat sides
export function calculateHexWidth(radius: number): number {
	return Math.sqrt(3) * radius;
}

/**
 * Calculates the path data for a rounded pointy-topped hexagon.
 */
export function getRoundedHexagonPath(radius: number, cornerRadius: number, cx: number, cy: number): string {
	const points: { x: number; y: number }[] = [];
	for (let i = 0; i < 6; i++) {
		const angle_deg = 60 * i - 30;
		const angle_rad = (Math.PI / 180) * angle_deg;
		points.push({
			x: cx + radius * Math.cos(angle_rad),
			y: cy + radius * Math.sin(angle_rad),
		});
	}

	let d = "";

	for (let i = 0; i < 6; i++) {
		const curr = points[i];
		const next = points[(i + 1) % 6];
		const prev = points[(i + 5) % 6];

		// Vectors pointing from current corner to neighbors
		const vPrev = { x: prev.x - curr.x, y: prev.y - curr.y };
		const vNext = { x: next.x - curr.x, y: next.y - curr.y };

		const lenPrev = Math.sqrt(vPrev.x * vPrev.x + vPrev.y * vPrev.y);
		const lenNext = Math.sqrt(vNext.x * vNext.x + vNext.y * vNext.y);

		// Normalize
		const vPrevNorm = { x: vPrev.x / lenPrev, y: vPrev.y / lenPrev };
		const vNextNorm = { x: vNext.x / lenNext, y: vNext.y / lenNext };

		// Clamp corner radius to avoid artifacts if too large
		const safeRadius = Math.min(cornerRadius, lenPrev / 2);

		const start = {
			x: curr.x + vPrevNorm.x * safeRadius,
			y: curr.y + vPrevNorm.y * safeRadius,
		};

		const end = {
			x: curr.x + vNextNorm.x * safeRadius,
			y: curr.y + vNextNorm.y * safeRadius,
		};

		if (i === 0) {
			d += `M ${start.x} ${start.y}`;
		} else {
			d += ` L ${start.x} ${start.y}`;
		}

		d += ` Q ${curr.x} ${curr.y} ${end.x} ${end.y}`;
	}

	d += " Z";
	return d;
}

/**
 * Generates a grid layout for a 6-5-6-5 repeating pattern.
 * Ensures that the grid is generated in full rows to avoid dangling partial rows.
 */
export function generateHexGrid(minItems: number, radius: number, gap: number): HexLayout[] {
	const hexWidth = calculateHexWidth(radius);
	const hexHeight = calculateHexHeight(radius);
	const xStep = hexWidth + gap;
	const yStep = hexHeight * 0.75 + gap * 0.85;

	const layout: HexLayout[] = [];

	// Calculate how many full rows we need to cover minItems
	let coveredItems = 0;
	let rowCount = 0;

	// Pattern: 6, 5, 6, 5...
	while (coveredItems < minItems) {
		const itemsInRow = rowCount % 2 === 0 ? 6 : 5;
		coveredItems += itemsInRow;
		rowCount++;
	}

	// Generate the full grid for the calculated rowCount
	for (let r = 0; r < rowCount; r++) {
		const itemsInRow = r % 2 === 0 ? 6 : 5;
		const xOffset = r % 2 === 0 ? 0 : xStep / 2;

		for (let c = 0; c < itemsInRow; c++) {
			const x = c * xStep + xOffset;
			const y = r * yStep;

			layout.push({
				q: c,
				r: r,
				x,
				y,
			});
		}
	}

	return layout;
}
