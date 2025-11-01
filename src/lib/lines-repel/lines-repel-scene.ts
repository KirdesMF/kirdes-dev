import { gsap } from "gsap";
import { get2dContext } from "../../utils/get-2d-context";
import type { Point } from "./_types";
import { ElasticLines, type ElasticLinesConfig } from "./elastic-lines";
import { Repeller } from "./repeller";

export type SceneConfig = {
	maxDPR: number;
	debug: boolean;
	configLines?: Partial<ElasticLinesConfig>;
};

const DEFAULTS: SceneConfig = {
	maxDPR: 2,
	debug: true,
};

export class LinesRepelScene {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;

	private isRunning = false;
	private ro: ResizeObserver | null;
	private config: SceneConfig;
	private dpr = 1;

	private lines: ElasticLines;
	private repeller: Repeller;

	constructor(canvas: HTMLCanvasElement, config?: Partial<SceneConfig>) {
		this.canvas = canvas;
		this.ctx = get2dContext(this.canvas);
		this.config = { ...DEFAULTS, ...config };

		this.lines = new ElasticLines(this.config.configLines);
		this.repeller = new Repeller();

		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(this.canvas);

		this.resize();
	}

	start() {
		if (this.isRunning) return;
		gsap.ticker.add(this.tick);
		this.isRunning = true;
	}

	stop() {
		if (!this.isRunning) return;
		gsap.ticker.remove(this.tick);
		this.isRunning = false;
	}

	dispose() {
		this.stop();
		this.ro?.disconnect();
	}

	setRepellerPosition(center: Point, radius: number) {
		this.repeller.setRepeller({ center, radius });
	}

	private resize() {
		const rect = this.canvas.getBoundingClientRect();
		const raw = window.devicePixelRatio || 1;
		const dpr = Math.min(this.config.maxDPR, raw);

		const wdp = Math.max(1, Math.round(rect.width * dpr));
		const hdp = Math.max(1, Math.round(rect.height * dpr));

		if (
			wdp !== this.canvas.width ||
			hdp !== this.canvas.height ||
			dpr !== this.dpr
		) {
			this.dpr = dpr;
			this.canvas.width = wdp;
			this.canvas.height = hdp;
			// Dessin en CSS px : scale le contexte une fois
			this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

			// Informe Lines de la nouvelle taille
			this.lines.resize({ width: rect.width, height: rect.height, dpr });
		}
	}

	private tick = () => {
		this.resize();
		this.draw();
	};

	private draw() {
		this.lines.draw(this.ctx);
		if (this.config.debug) {
			this.repeller.draw(this.ctx);
		}
	}
}
