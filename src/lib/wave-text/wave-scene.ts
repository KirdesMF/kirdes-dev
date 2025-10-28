import { gsap } from "gsap";
import { getGL2, isLikelyMobile, resizeCanvasToDisplaySize } from "./_utils";
import { WaveLine, type WaveLineParams } from "./wave-line";
import { WaveText } from "./wave-text";

export type WavePublicParams = {
	amplitude: number; // px
	frequency: number; // rad/px
	speed: number; // facteur anim phase
	color: [number, number, number, number]; // RGBA 0..1
};

export class WaveScene {
	private canvas: HTMLCanvasElement;
	private gl: WebGL2RenderingContext;

	private line: WaveLine;
	private text: WaveText;

	private phase = 0; // interne (rad)
	public params: WavePublicParams; // tweeneable/public

	private isRunning = false;
	private reduceMotion = false;

	private fpsAvg: number | null = null;
	private readonly fpsAlpha = 0.1;

	// perf knobs
	private maxDPRCap = isLikelyMobile() ? 1.5 : 2.0;
	private basePointCount = isLikelyMobile() ? 768 : 1024;

	public constructor(args: {
		canvas: HTMLCanvasElement;
		initial?: Partial<WavePublicParams>;
	}) {
		const { canvas, initial } = args;
		this.canvas = canvas;
		this.gl = getGL2({ canvas });

		this.params = {
			amplitude: 60,
			frequency: 0.002,
			speed: 1,
			color: [1, 1, 1, 1],
			...initial,
		};

		this.line = new WaveLine(this.gl, this.basePointCount);

		this.text = new WaveText(this.gl);

		const mediaPRM = window.matchMedia("(prefers-reduced-motion: reduce)");
		this.reduceMotion = mediaPRM.matches;
		mediaPRM.addEventListener("change", (ev) => {
			this.reduceMotion = ev.matches;
		});

		this.resize();
		this.resizeTextQuad();
		this.clear();
	}

	// --- Public API (boutons/GSAP) ---
	public setAmplitude(v: number): void {
		this.params.amplitude = Math.max(0, v);
	}
	public setFrequency(v: number): void {
		this.params.frequency = Math.max(0, v);
	}
	public setSpeed(v: number): void {
		this.params.speed = Math.max(0, v);
	}
	public setColor(rgba: [number, number, number, number]): void {
		this.params.color = rgba;
	}

	public start(): void {
		if (this.isRunning) return;
		gsap.ticker.add(this.tick);
		this.isRunning = true;
	}

	public stop(): void {
		if (!this.isRunning) return;
		gsap.ticker.remove(this.tick);
		this.isRunning = false;
	}

	public dispose(): void {
		this.stop();
		this.line.dispose();
	}

	private resizeTextQuad() {
		const w = Math.min(this.canvas.width * 0.9, 1400);
		const h = Math.min(this.canvas.height * 0.6, 550);
		this.text.resizeQuad({
			width: w,
			height: h,
			gridRes: isLikelyMobile() ? 140 : 200,
		});
	}

	// --- Internal ---
	private readonly tick = (): void => {
		const deltaRatio = gsap.ticker.deltaRatio(60);
		const instantFps = 60 / deltaRatio;
		this.fpsAvg =
			this.fpsAvg === null
				? instantFps
				: this.fpsAvg * (1 - this.fpsAlpha) + instantFps * this.fpsAlpha;

		const resized = this.resize();
		if (resized) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

		const speed = this.reduceMotion
			? this.params.speed * 0.5
			: this.params.speed;
		this.phase += 0.02 * speed * deltaRatio;
		if (this.phase > Math.PI * 2) this.phase -= Math.PI * 2;

		this.render();
	};

	private resize(): boolean {
		const changed = resizeCanvasToDisplaySize({
			canvas: this.canvas,
			maxDPR: this.maxDPRCap,
		});

		// Ajuste la densité de points en fonction de la largeur en px (post-DPR)
		// Heuristique: ~1 point / 2px, bornée [512..2048]
		if (changed) {
			this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
			const w = this.canvas.width;
			const target = Math.min(Math.max(512, Math.floor(w / 2)), 2048);

			// Rebuild seulement si changement notable
			if (target !== this.basePointCount) {
				this.line.dispose();
				this.line = new WaveLine(this.gl, target);
				this.basePointCount = target;
				this.resizeTextQuad();
			}
		}
		return changed;
	}

	private clear(): void {
		const gl = this.gl;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	private render(): void {
		this.clear();

		// garde-fous ultra simples pour éviter des valeurs négatives
		const amp = Math.max(0, this.params.amplitude);
		const freq = Math.max(0, this.params.frequency);

		const lineParams: WaveLineParams = {
			amplitude: amp,
			frequency: freq,
			phase: this.phase,
			color: this.params.color,
		};

		this.text.render({
			resolution: { width: this.canvas.width, height: this.canvas.height },
			phase: this.phase,
			amplitude: this.params.amplitude,
			frequency: this.params.frequency,
			offset: {
				x: (this.canvas.width - Math.min(this.canvas.width * 0.9, 1400)) * 0.5,
				y: (this.canvas.height - Math.min(this.canvas.height * 0.6, 550)) * 0.5,
			},
		});

		this.line.render({
			resolution: { width: this.canvas.width, height: this.canvas.height },
			params: lineParams,
		});
	}
}
