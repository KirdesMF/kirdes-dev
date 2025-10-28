import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { getTheme, onThemeChange, type Theme } from "../theme";
import { WaveLine } from "./wave-line";
import { WaveText } from "./wave-text";

gsap.registerPlugin(ScrollTrigger);

export type WaveParams = {
	phase: number;
	frequency: number;
	amplitude: number;
	dashShift: number;
	speed: number;
};

function getWebGLContext(canvas: HTMLCanvasElement) {
	const gl = canvas.getContext("webgl", {
		antialias: true,
		alpha: true,
	}) as WebGLRenderingContext;
	if (!gl) throw new Error("WebGL not supported");
	return gl;
}

export class WaveScene {
	#canvas: HTMLCanvasElement;
	#gl: WebGLRenderingContext;

	#text: WaveText;
	#line: WaveLine;

	#currentTheme: Theme;

	params: WaveParams = {
		phase: 0,
		frequency: 0.002,
		amplitude: 60,
		dashShift: 0,
		speed: 1,
	};

	#fpsAvg: number | null = null;
	#fpsAlpha = 0.1;
	#reduceMotion = false;
	#unsubscribeThemeChange?: () => void;
	#isRunning = false;
	#scrollTriggers: ScrollTrigger[] = [];
	private scrollProgress = 0;

	constructor(canvas: HTMLCanvasElement, params?: WaveParams) {
		this.params = params || this.params;
		this.#canvas = canvas;
		const gl = getWebGLContext(canvas);
		this.#gl = gl;
		this.#currentTheme = getTheme();

		// Enable extensions
		gl.getExtension("OES_standard_derivatives");

		// Setup blending
		gl.enable(gl.BLEND);
		gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

		// get theme
		const theme = getTheme();

		// init components
		this.#text = new WaveText(gl, theme.text);
		this.#line = new WaveLine(gl);

		// reduced motion preference
		const mediaPRM = window.matchMedia("(prefers-reduced-motion: reduce)");
		mediaPRM.addEventListener("change", (event) => {
			this.#reduceMotion = event.matches;
		});

		this.#unsubscribeThemeChange = onThemeChange((newTheme) => {
			this.#currentTheme = newTheme;
			this.#text.updateTextColor(newTheme.text);
		});

		this.#resize();
		this.#setupWaveSections();
		this.#setupVisibilityListener();
	}

	#setupWaveSections() {
		// cleanup
		if (this.#scrollTriggers.length) {
			this.#scrollTriggers.forEach((t) => {
				t.kill();
			});
			this.#scrollTriggers.length = 0;
		}

		const panels = Array.from(document.querySelectorAll<HTMLElement>(".panel"));
		const texts = panels.map((p) =>
			p.querySelector<HTMLElement>("[data-wave-text]"),
		);

		// proxy persistant pour le tween (évite les overlaps)
		if (!this._progress) this._progress = { p: this.scrollProgress };

		panels.forEach((panel, i) => {
			const wordEl = texts[i];
			const word = wordEl?.getAttribute("data-wave-text") || "WAVE";

			const trig = ScrollTrigger.create({
				trigger: panel, // <-- wrapper non-sticky
				start: "top 60%",
				end: "bottom 40%",
				onEnter: () => {
					this.#text.updateText(word);
					this.tweenTextProgress(1); // arrive au centre
				},
				onLeave: () => {
					this.tweenTextProgress(0); // repart
				},
				onEnterBack: () => {
					this.#text.updateText(word);
					this.tweenTextProgress(1);
				},
				onLeaveBack: () => {
					this.tweenTextProgress(0);
				},
				// markers: true,
				invalidateOnRefresh: true,
				fastScrollEnd: true,
			});

			this.#scrollTriggers.push(trig);
		});

		ScrollTrigger.refresh();

		// Tu gardes ton dash animé en continu (c’est indépendant du texte)
		gsap.to(this.params, {
			dashShift: 800,
			duration: 8,
			ease: "none",
			repeat: -1,
			onRepeat: () => {
				this.params.dashShift = 0;
			},
		});
	}

	private _progress = { p: 0 };
	private tweenTextProgress(
		target: number,
		opts?: { duration?: number; ease?: string },
	) {
		gsap.killTweensOf(this._progress);
		gsap.to(this._progress, {
			duration: opts?.duration ?? (target > this._progress.p ? 0.8 : 0.6),
			ease:
				opts?.ease ?? (target > this._progress.p ? "power3.out" : "power2.in"),
			p: target,
			onUpdate: () => {
				this.scrollProgress = this._progress.p;
				this.#text.setScrollProgress(this.scrollProgress);
			},
		});
	}

	#setupVisibilityListener() {
		document.addEventListener("visibilitychange", () => {
			document.hidden ? this.stop() : this.start();
		});
	}

	start() {
		if (!this.#isRunning) {
			gsap.ticker.add(() => this.render());
			this.#isRunning = true;
		}
	}

	stop() {
		if (this.#isRunning) {
			gsap.ticker.remove(() => this.render());
			this.#isRunning = false;
		}
	}

	#resize() {
		const canvasWidth = this.#canvas.clientWidth;
		const canvasHeight = this.#canvas.clientHeight;

		const needResize =
			canvasWidth !== this.#canvas.width ||
			canvasHeight !== this.#canvas.height;

		if (needResize) {
			this.#canvas.width = canvasWidth;
			this.#canvas.height = canvasHeight;

			this.#gl.viewport(0, 0, this.#gl.canvas.width, this.#gl.canvas.height);
			this.#text.resize(this.#canvas.width, this.#canvas.height, this.#fpsAvg);
		}

		return needResize;
	}

	render() {
		const deltaRatio = gsap.ticker.deltaRatio(60);

		// Calculate FPS for adaptive performance
		const instantFps = 60 / deltaRatio;
		this.#fpsAvg =
			this.#fpsAvg === null
				? instantFps
				: this.#fpsAvg * (1 - this.#fpsAlpha) + instantFps * this.#fpsAlpha;

		this.#resize();

		// Calculate effective amplitude (reduce if motion preference)
		const effectiveAmplitude = this.#reduceMotion
			? this.params.amplitude * 0.5
			: this.params.amplitude;

		// Calculate effective dash shift (reduce if motion preference)
		const effectiveDashShift = this.#reduceMotion ? 0 : this.params.dashShift;

		// Clear canvas
		this.#gl.clearColor(0, 0, 0, 0);
		this.#gl.clear(this.#gl.COLOR_BUFFER_BIT);

		const theme = this.#currentTheme;

		// La wave s'anime toujours
		this.params.phase += this.params.speed * 0.02 * deltaRatio;
		if (this.params.phase > Math.PI * 2) {
			this.params.phase -= Math.PI * 2;
		}

		// Render layers
		this.#text.render({
			canvasWidth: this.#canvas.width,
			canvasHeight: this.#canvas.height,
			phase: this.params.phase,
			frequency: this.params.frequency,
			amplitude: effectiveAmplitude,
		});

		this.#line.render({
			canvasWidth: this.#canvas.width,
			canvasHeight: this.#canvas.height,
			phase: this.params.phase,
			frequency: this.params.frequency,
			amplitude: effectiveAmplitude,
			dashShift: effectiveDashShift,
			color: theme.line,
		});
	}

	killDefaultAnimations() {
		gsap.killTweensOf(this.params);
		gsap.killTweensOf(this);
		this.#scrollTriggers.forEach((trigger) => {
			trigger.kill();
		});
	}

	dispose() {
		this.stop();
		this.killDefaultAnimations();
		this.#unsubscribeThemeChange?.();
		this.#text.dispose();
		this.#line.dispose();
	}
}
