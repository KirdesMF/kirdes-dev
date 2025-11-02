import { gsap } from "gsap";
import { parseColor } from "../theme";
import type { Point } from "./_types";

export type ElasticLinesConfig = {
	color: string;
	width: number;
	spacing: number;
	maxDPR: number;

	// déformation
	pathSegments: number; // >= 2 (2 => 1 point intérieur)
	snapDist: number; // en px CSS (seuil d'autorisation)
	yAxisLocked: boolean; // true = on ne modifie pas Y
	duration: number; // GSAP elastic
	easeStrength: number; // amplitude
	easePeriod: number; // période
	samplesPerSegment: number; // 4..8 pour Catmull-Rom
};

const DEFAULT_CONFIG: ElasticLinesConfig = {
	color: "oklch(0.9332 0.025 75.27 / 0.4)",
	width: 1,
	spacing: 10,
	maxDPR: 2,
	pathSegments: 2,
	snapDist: 200,
	yAxisLocked: true,
	duration: 2,
	easeStrength: 1.2,
	easePeriod: 0.2,
	samplesPerSegment: 50,
};

const ELASTIC_LINES_OPACITY = 0.4;

function colorWithOpacity(cssColor: string, alpha: number): string {
	const [r, g, b] = parseColor(cssColor);
	const to255 = (value: number) =>
		Math.max(0, Math.min(255, Math.round(value * 255)));
	return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`;
}

/* ------------------ utils ------------------ */
function dist2(a: Point, b: Point): number {
	const dx = a.x - b.x;
	const dy = a.y - b.y;
	return dx * dx + dy * dy;
}
function isClose(a: Point, b: Point, eps = 0.1): boolean {
	return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps;
}
function normalize(v: Point): Point {
	const len = Math.hypot(v.x, v.y);
	return len > 1e-8 ? { x: v.x / len, y: v.y / len } : { x: 0, y: 0 };
}
// Catmull-Rom centripète (alpha=0.5), échantillonné
function catmullRomPoint(
	p0: Point,
	p1: Point,
	p2: Point,
	p3: Point,
	t: number,
	alpha = 0.5,
): Point {
	const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y) ** alpha;
	const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y) ** alpha;
	const d23 = Math.hypot(p3.x - p2.x, p3.y - p2.y) ** alpha;

	const t0 = 0;
	const t1 = t0 + d01;
	const t2 = t1 + d12;
	const t3 = t2 + d23;
	const tt = t1 + (t2 - t1) * t;

	const A1: Point = {
		x: ((t1 - tt) / (t1 - t0)) * p0.x + ((tt - t0) / (t1 - t0)) * p1.x,
		y: ((t1 - tt) / (t1 - t0)) * p0.y + ((tt - t0) / (t1 - t0)) * p1.y,
	};
	const A2: Point = {
		x: ((t2 - tt) / (t2 - t1)) * p1.x + ((tt - t1) / (t2 - t1)) * p2.x,
		y: ((t2 - tt) / (t2 - t1)) * p1.y + ((tt - t1) / (t2 - t1)) * p2.y,
	};
	const A3: Point = {
		x: ((t3 - tt) / (t3 - t2)) * p2.x + ((tt - t2) / (t3 - t2)) * p3.x,
		y: ((t3 - tt) / (t3 - t2)) * p2.y + ((tt - t2) / (t3 - t2)) * p3.y,
	};
	const B1: Point = {
		x: ((t2 - tt) / (t2 - t0)) * A1.x + ((tt - t0) / (t2 - t0)) * A2.x,
		y: ((t2 - tt) / (t2 - t0)) * A1.y + ((tt - t0) / (t2 - t0)) * A2.y,
	};
	const B2: Point = {
		x: ((t3 - tt) / (t3 - t1)) * A2.x + ((tt - t1) / (t3 - t1)) * A3.x,
		y: ((t3 - tt) / (t3 - t1)) * A2.y + ((tt - t1) / (t3 - t1)) * A3.y,
	};
	return {
		x: ((t2 - tt) / (t2 - t1)) * B1.x + ((tt - t1) / (t2 - t1)) * B2.x,
		y: ((t2 - tt) / (t2 - t1)) * B1.y + ((tt - t1) / (t2 - t1)) * B2.y,
	};
}

class ControlPoint {
	readonly home: Point;
	readonly current: Point;
	private animating = false;

	constructor(start: Point) {
		this.home = { x: start.x, y: start.y };
		this.current = { x: start.x, y: start.y };
	}

	isAnimating(): boolean {
		return this.animating;
	}

	cancel() {
		gsap.killTweensOf(this.current);
		this.animating = false;
	}

	snapBack(duration: number, ease: { strength: number; period: number }) {
		gsap.killTweensOf(this.current);
		this.animating = true;
		gsap.to(this.current, {
			x: this.home.x,
			y: this.home.y,
			duration,
			ease: `elastic.out(${ease.strength}, ${ease.period})`,
			onComplete: () => {
				this.animating = false;
			},
		});
	}
}

class LinePath {
	readonly x0: number;
	readonly points: ControlPoint[];

	constructor(x0: number, h: number, segments: number) {
		this.x0 = x0;
		const pts: ControlPoint[] = [];
		for (let i = 0; i <= segments; i++) {
			const y = (i / segments) * h;
			pts.push(new ControlPoint({ x: x0, y }));
		}
		this.points = pts;
	}
}

export class ElasticLines {
	private config: ElasticLinesConfig;
	private width = 0;
	private height = 0;
	private dpr = 1;

	// repeller
	private center: Point = { x: 0, y: 0 };
	private radius = 0;

	// maillage de lignes
	private lines: LinePath[] = [];
	private builtForW = 0;
	private builtForH = 0;
	private builtForSpacing = 0;
	private builtForSegments = 0;

	constructor(config?: Partial<ElasticLinesConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		this.config.color = colorWithOpacity(
			this.config.color,
			ELASTIC_LINES_OPACITY,
		);
	}

	resize(arg: { width: number; height: number; dpr: number }) {
		this.width = arg.width;
		this.height = arg.height;
		this.dpr = arg.dpr;
		this.ensureBuilt();
	}

	setConfig(config: Partial<ElasticLinesConfig>) {
		this.config = { ...this.config, ...config };
		if (config.color !== undefined) {
			this.config.color = colorWithOpacity(config.color, ELASTIC_LINES_OPACITY);
		}
		this.ensureBuilt();
	}

	/** call every tick from Scene */
	update(center: Point, radius: number) {
		this.center = center;
		this.radius = Math.max(0, radius);

		// logique repel/snap pour chaque point intérieur
		const r2 = this.radius * this.radius;
		const s2 = this.config.snapDist * this.config.snapDist;

		for (const line of this.lines) {
			const n = line.points.length;
			for (let i = 1; i < n - 1; i++) {
				const cp = line.points[i];

				const insideRepel = dist2(cp.current, this.center) < r2;
				if (insideRepel) {
					const allow = dist2(cp.home, this.center) <= s2;
					if (allow) {
						// pousser sur le périmètre
						const dir = normalize({
							x: cp.current.x - this.center.x,
							y: cp.current.y - this.center.y,
						});
						const tx = this.center.x + dir.x * Math.max(0, this.radius - 1);
						const ty = this.center.y + dir.y * Math.max(0, this.radius - 1);

						cp.cancel(); // pas d'elastic pendant la poussée
						cp.current.x = tx;
						cp.current.y = this.config.yAxisLocked ? cp.home.y : ty;
					} else {
						if (!isClose(cp.current, cp.home)) {
							cp.snapBack(this.config.duration, {
								strength: this.config.easeStrength,
								period: this.config.easePeriod,
							});
						}
					}
				} else {
					if (!cp.isAnimating() && !isClose(cp.current, cp.home)) {
						cp.snapBack(this.config.duration, {
							strength: this.config.easeStrength,
							period: this.config.easePeriod,
						});
					}
				}
			}
		}
	}

	draw(ctx: CanvasRenderingContext2D) {
		const w = this.width;
		const h = this.height;

		ctx.clearRect(0, 0, w, h);
		ctx.lineWidth = this.config.width;
		ctx.strokeStyle = this.config.color;

		// tracer chaque ligne via Catmull-Rom (centripète)
		const samples = Math.max(2, this.config.samplesPerSegment);
		const alpha = 1;

		for (const line of this.lines) {
			const pts: Point[] = line.points.map((p) => p.current);
			const n = pts.length;
			if (n < 2) continue;

			// 👇 ghost points pour éviter p0==p1 et p2==p3 aux bords
			const first = pts[0];
			const second = pts[Math.min(1, n - 1)];
			const last = pts[n - 1];
			const penult = pts[Math.max(0, n - 2)];

			const ghost0: Point = {
				x: first.x + (first.x - second.x),
				y: first.y + (first.y - second.y),
			};
			const ghostN: Point = {
				x: last.x + (last.x - penult.x),
				y: last.y + (last.y - penult.y),
			};

			const ext: Point[] = [ghost0, ...pts, ghostN]; // ✅ plus de doublons

			ctx.beginPath();
			ctx.moveTo(pts[0].x, pts[0].y);

			for (let i = 0; i < pts.length - 1; i++) {
				const P0 = ext[i];
				const P1 = ext[i + 1];
				const P2 = ext[i + 2];
				const P3 = ext[i + 3];

				for (let s = 1; s <= samples; s++) {
					const t = s / samples;
					const q = catmullRomPoint(P0, P1, P2, P3, t, alpha);
					ctx.lineTo(q.x, q.y);
				}
			}
			ctx.stroke();
		}
	}

	private ensureBuilt(): void {
		const needRebuild =
			this.width !== this.builtForW ||
			this.height !== this.builtForH ||
			this.config.spacing !== this.builtForSpacing ||
			this.config.pathSegments !== this.builtForSegments;

		if (!needRebuild) return;

		const segs = Math.max(2, Math.floor(this.config.pathSegments));
		const spacing = Math.max(2, Math.floor(this.config.spacing));

		const lines: LinePath[] = [];
		for (let x = 0; x <= this.width + 0.5; x += spacing) {
			lines.push(new LinePath(x, this.height, segs));
		}
		this.lines = lines;

		this.builtForW = this.width;
		this.builtForH = this.height;
		this.builtForSpacing = spacing;
		this.builtForSegments = segs;
	}
}
