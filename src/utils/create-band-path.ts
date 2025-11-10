type Orientation = "horizontal" | "vertical";

interface CreateBandPathOptions {
	position: number;
	bend?: number;
	orientation?: Orientation;
	controlStart: number;
	controlEnd: number;
	viewBoxSpan: number;
}

export function createBandPath({
	position,
	bend = 0,
	orientation = "horizontal",
	controlStart,
	controlEnd,
	viewBoxSpan,
}: CreateBandPathOptions): string {
	if (orientation === "vertical") {
		return `M${position} 0 C${position + bend} ${controlStart} ${position + bend} ${controlEnd} ${position} ${viewBoxSpan}`;
	}

	return `M0 ${position} C${controlStart} ${position + bend} ${controlEnd} ${position + bend} ${viewBoxSpan} ${position}`;
}
