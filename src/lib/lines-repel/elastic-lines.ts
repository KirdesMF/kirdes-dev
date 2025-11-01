export type ElasticLinesConfig = {
	color: string;
	width: number;
	spacing: number;
	maxDPR: number;
};

const DEFAULT_CONFIG: ElasticLinesConfig = {
	color: "red",
	width: 1,
	spacing: 10,
	maxDPR: 2,
};

export class ElasticLines {
	private config: ElasticLinesConfig;
	private width = 0;
	private height = 0;
	private dpr = 1;

	constructor(config?: Partial<ElasticLinesConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
	}

	resize({
		width,
		height,
		dpr,
	}: {
		width: number;
		height: number;
		dpr: number;
	}) {
		this.width = width;
		this.height = height;
		this.dpr = dpr;
	}

	draw(ctx: CanvasRenderingContext2D) {
		const w = this.width;
		const h = this.height;

		ctx.clearRect(0, 0, w, h);
		ctx.lineWidth = this.config.width;
		ctx.strokeStyle = this.config.color;

		const spacing = this.config.spacing;
		const path = new Path2D();
		for (let x = 0; x <= w + 0.5; x += spacing) {
			const px = Math.floor(x) + 0.5; // crisp
			path.moveTo(px, 0);
			path.lineTo(px, h);
		}
		ctx.stroke(path);
	}
}
