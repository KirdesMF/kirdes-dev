import { gsap } from "gsap";
import { getGL2, isLikelyMobile, resizeCanvasToDisplaySize } from "./_utils";
import { SparklesField } from "./sparkles-field";
import { SparklesText } from "./sparkles-text";
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
	private sparklesText: SparklesText;
	private sparklesField: SparklesField;

	private mouseTarget = { x: 0, y: 0 }; // [-1..1]
	private mouseLerp = { x: 0, y: 0 };

	private phase = 0; // interne (rad)
	public params: WavePublicParams; // tweeneable/public

	private isRunning = false;
	private reduceMotion = false;

	private fpsAvg: number | null = null;
	private readonly fpsAlpha = 0.1;

	// perf knobs
	private maxDPRCap = isLikelyMobile() ? 1.5 : 2.0;
	private basePointCount = isLikelyMobile() ? 768 : 1024;

	constructor(args: {
		canvas: HTMLCanvasElement;
		initial?: Partial<WavePublicParams>;
	}) {
		const { canvas, initial } = args;
		this.canvas = canvas;
		this.gl = getGL2({ canvas });

		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

		this.params = {
			amplitude: 120,
			frequency: 0.002,
			speed: 2,
			color: [1, 1, 1, 1],
			...initial,
		};

		this.line = new WaveLine(this.gl, this.basePointCount);
		this.text = new WaveText(this.gl);
		this.sparklesText = new SparklesText(this.gl, {
			quadWidth: Math.min(this.canvas.width * 0.9, 1400),
			quadHeight: Math.min(this.canvas.height * 0.6, 550),
			sideMarginPx: 60,
			liftFromLinePx: 50, // vers la wave
			topSizesPx: isLikelyMobile() ? [18, 12] : [26, 18], // [left, right]
			bottomSizesPx: isLikelyMobile() ? [18, 12] : [26, 18], // [left, right]
			color: "#ffffff",
			texSize: 64,
		});

		this.sparklesField = new SparklesField(this.gl, {
			count: isLikelyMobile() ? 80 : 100,
			minSizePx: isLikelyMobile() ? 5 : 6,
			maxSizePx: isLikelyMobile() ? 10 : 14,
			parallaxStrengthPx: isLikelyMobile() ? 8 : 50,
			color: "#ffffff",
			texSize: 48,
		});

		const mediaPRM = window.matchMedia("(prefers-reduced-motion: reduce)");
		this.reduceMotion = mediaPRM.matches;
		mediaPRM.addEventListener("change", (ev) => {
			this.reduceMotion = ev.matches;
		});

		this.canvas.addEventListener("pointermove", this.onPointerMove, {
			passive: true,
		});
		this.canvas.addEventListener("pointerleave", this.onPointerLeave);

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
		this.canvas.removeEventListener("pointermove", this.onPointerMove);
		this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
		this.line.dispose();
		this.sparklesField.dispose();
		this.sparklesText.dispose();
	}

	private resizeTextQuad() {
		const w = Math.min(this.canvas.width * 0.9, 1400);
		const h = Math.min(this.canvas.height * 0.6, 550);

		// 1) on (re)calibre le quad du texte
		this.text.resizeQuad({
			width: w,
			height: h,
			gridRes: isLikelyMobile() ? 140 : 200,
		});

		// 2) on (re)calibre le quad des sparkles
		this.sparklesText.resizeQuadSize({ width: w, height: h });

		// 3) on transmet la largeur RÉELLE du mot (mesurée) aux sparkles
		//    => pour que sideMarginPx s’applique depuis le bord du mot, pas le bord du quad
		// Convert texture-space measurement to a ratio, then to quad-space inside SparklesText
		const wordPx = this.text.getTextContentWidthPx(); // texture px
		const texW = this.text.getTextureCanvasWidth(); // texture px
		this.sparklesText.setTextContentWidthFromTexture(wordPx, texW);
	}

	private getTextOffset() {
		return {
			x: (this.canvas.width - Math.min(this.canvas.width * 0.9, 1400)) * 0.5,
			y: (this.canvas.height - Math.min(this.canvas.height * 0.6, 550)) * 0.5,
		};
	}

	private onPointerMove = (e: PointerEvent) => {
		const rect = this.canvas.getBoundingClientRect();
		const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
		this.mouseTarget.x = Math.max(-1, Math.min(1, nx));
		this.mouseTarget.y = Math.max(-1, Math.min(1, ny));
	};

	private onPointerLeave = () => {
		// 1) remets la cible à zéro (le lerp naturel va y retourner)
		this.mouseTarget.x = 0;
		this.mouseTarget.y = 0;

		// 2) (optionnel) accélère le retour visuel avec un tween direct du lerp
		gsap.to(this.mouseLerp, {
			x: 0,
			y: 0,
			duration: 1,
			ease: "elastic.out(1.5, 0.2)",
		});
	};

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

		// lerp doux de la souris
		const k = 0.12;
		this.mouseLerp.x += (this.mouseTarget.x - this.mouseLerp.x) * k;
		this.mouseLerp.y += (this.mouseTarget.y - this.mouseLerp.y) * k;

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
				this.sparklesField.resize({
					width: this.canvas.width,
					height: this.canvas.height,
				});
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

		this.sparklesField.render({
			resolution: { width: this.canvas.width, height: this.canvas.height },
			parallax: { x: this.mouseLerp.x, y: this.mouseLerp.y },
			reduceMotion: this.reduceMotion,
		});

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

		const ofs = this.getTextOffset();
		this.sparklesText.render({
			resolution: { width: this.canvas.width, height: this.canvas.height },
			phase: this.phase,
			amplitude: this.params.amplitude,
			frequency: this.params.frequency,
			offset: ofs,
		});

		this.line.render({
			resolution: { width: this.canvas.width, height: this.canvas.height },
			params: lineParams,
		});
	}
}
