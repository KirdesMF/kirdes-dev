import { gsap } from "gsap";
import { get2DContext } from "../../lib/canvas-2d";
import { events, state } from "../../lib/states";
import { parseColor, type Theme } from "../../lib/theme";

const MOIRE_OPACITY = 0.3;

function colorWithOpacity(cssColor: string, alpha: number): string {
	const [r, g, b] = parseColor(cssColor);
	const to255 = (value: number) => Math.max(0, Math.min(255, Math.round(value * 255)));
	return `rgba(${to255(r)}, ${to255(g)}, ${to255(b)}, ${alpha})`;
}

export type MoireConfig = {
	lineColor: string;
	lineWidth: number;
	lineSpacing: number;
	maxDPR: number;
};

export class MoireCanvas {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private config: MoireConfig;

	private dpr = 1;
	private invalidated = true;
	private isRunning = false;
	private ro: ResizeObserver | null = null;
	private unsubscribeThemeChange?: () => void;

	constructor(canvas: HTMLCanvasElement, config?: Partial<MoireConfig>) {
		this.canvas = canvas;
		this.ctx = get2DContext(canvas);
		this.config = {
			lineColor: "oklch(0.9332 0.025 75.27 / 0.3)",
			lineWidth: 1,
			lineSpacing: 30,
			maxDPR: 2,
			...config,
		};

		// observe canvas resize
		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(this.canvas);

		this.resize();
	}

	start() {
		if (this.isRunning) return;
		this.applyTheme(state.getTheme());
		this.unsubscribeThemeChange = events.onThemeChange((t) => this.applyTheme(t));
		gsap.ticker.add(this.tick);
		this.isRunning = true;
	}

	stop() {
		if (!this.isRunning) return;
		gsap.ticker.remove(this.tick);
		this.isRunning = false;
	}

	dispose() {
		if (this.ro) this.ro.disconnect();
		gsap.ticker.remove(this.tick);
		this.ro = null;
		this.isRunning = false;
		this.unsubscribeThemeChange?.();
	}

	setConfig(config: Partial<MoireConfig>) {
		this.config = { ...this.config, ...config };
		this.invalidated = true;
	}

	setLineSpacing(spacing: number) {
		this.config.lineSpacing = spacing;
		this.invalidated = true;
	}

	private applyTheme(t: Theme) {
		this.setConfig({ lineColor: colorWithOpacity(t.text, MOIRE_OPACITY) });
	}

	private resize() {
		const rect = this.canvas.getBoundingClientRect();
		const rawDpr = window.devicePixelRatio || 1;
		this.dpr = Math.min(this.config.maxDPR, rawDpr);

		const w = Math.max(1, Math.round(rect.width * this.dpr));
		const h = Math.max(1, Math.round(rect.height * this.dpr));

		if (w !== this.canvas.width || h !== this.canvas.height) {
			this.canvas.width = w;
			this.canvas.height = h;
			this.invalidated = true;
		}
	}

	private tick = () => {
		if (!this.invalidated) return;
		this.draw();
		this.invalidated = false;
	};

	private draw() {
		const ctx = this.ctx;
		const wdp = this.canvas.width; // device px
		const hdp = this.canvas.height; // device px
		const config = this.config;

		// efface
		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.clearRect(0, 0, wdp, hdp);

		// tile en device px
		const spacingDp = Math.max(1, Math.round(config.lineSpacing * this.dpr));
		const lineWdp = Math.max(1, Math.round(config.lineWidth * this.dpr));
		const tile = document.createElement("canvas");
		tile.width = spacingDp;
		tile.height = 2; // min

		const tctx = tile.getContext("2d");
		if (tctx) {
			tctx.strokeStyle = config.lineColor;
			tctx.lineWidth = lineWdp;
			const x = 0.5; // align with LinesRepel grid
			tctx.beginPath();
			tctx.moveTo(x, 0);
			tctx.lineTo(x, tile.height);
			tctx.stroke();
		}

		const pattern = ctx.createPattern(tile, "repeat");
		if (pattern) {
			ctx.fillStyle = pattern;
			ctx.fillRect(0, 0, wdp, hdp);
		}
	}
}
