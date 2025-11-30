import { gsap } from "gsap";
import { events } from "../../lib/states";
import { getGL2Context, resizeCanvasToDisplaySize } from "../../lib/webgl";
import { cssColorToVec3 } from "../../utils/colors";
import { Lens } from "./lens";
import { SparkleSprites } from "./sparkles";
import { WaveTextMsdf } from "./text-msdf";
import type { WaveLineBuild, WaveLineConfig } from "./wave-line";
import { WaveLine } from "./wave-line";

function getTheme(): { background: [number, number, number]; foreground: [number, number, number] } {
	const style = getComputedStyle(document.documentElement);
	const background = style.getPropertyValue("--color-background");
	const foreground = style.getPropertyValue("--color-foreground");
	return {
		background: cssColorToVec3(background),
		foreground: cssColorToVec3(foreground),
	};
}

export type WaveParams = {
	amplitude: number;
	frequency: number;
	speed: number;
};

export type SceneConfig = {
	line: {
		build: Partial<WaveLineBuild>;
		config: Partial<WaveLineConfig>;
	};
	text: {
		content: string;
		scale: number;
		letterSpacing: number;
		offsetFromWavePx: number;
	};
	lens: {
		followLerp: number;
	};
	sparkles: {
		enabled: boolean;
		scale: number;
		offsetBetweenPx: number;
		offsetFromWavePx: number;
		offsetFromTextEdgePx: number;
		deformStrength: number;
	};
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const PARAMS_DEFAULT: WaveParams = {
	amplitude: 180,
	frequency: 0.003,
	speed: 3.5,
};

const DEFAULT_SCENE_CONFIG: SceneConfig = {
	line: {
		build: {},
		config: {
			lineWidthPx: 2,
			dashPeriodPx: 20,
		},
	},
	text: {
		content: "WORKS",
		scale: 8.0,
		letterSpacing: 2,
		offsetFromWavePx: 20,
	},
	lens: {
		followLerp: 0.15,
	},

	sparkles: {
		enabled: true,
		scale: 4,
		offsetBetweenPx: 10,
		offsetFromWavePx: 80,
		offsetFromTextEdgePx: 100,
		deformStrength: 1,
	},
};

export class Scene {
	#canvas: HTMLCanvasElement;
	#gl: WebGL2RenderingContext;
	#isRunning = false;
	#colors = getTheme();
	#config: SceneConfig;

	#line: WaveLine;
	#lens: Lens;
	#text: WaveTextMsdf;
	#sparkles: SparkleSprites;

	#baseCanvasWidth: number | null = null;
	#baseCanvasHeight: number | null = null;
	#baseTextScale: number;
	#baseSparkleScale: number;

	#phase = 0;
	#timeSec = 0;

	#waveParamsCurrent: WaveParams;
	#waveParamsTarget: WaveParams;

	#reduceMotion = false;
	#reduceMotionMql: MediaQueryList | null = null;

	#unsubscribeTheme: (() => void) | null = null;
	#unsubscribeParams: (() => void) | null = null;

	#textOffsetFromWavePx = 100;

	constructor(canvas: HTMLCanvasElement, config?: Partial<SceneConfig>) {
		this.#canvas = canvas;
		this.#gl = getGL2Context(canvas);

		this.#config = Scene.#mergeConfig(config);

		this.#waveParamsCurrent = { ...PARAMS_DEFAULT };
		this.#waveParamsTarget = { ...PARAMS_DEFAULT };

		this.#line = new WaveLine({
			gl: this.#gl,
			build: this.#config.line.build,
			config: {
				...this.#config.line.config,
				color: [...this.#colors.foreground, 1],
			},
		});

		this.#lens = new Lens({
			canvas: this.#canvas,
			followLerp: this.#config.lens.followLerp,
		});

		const packedColor: [number, number, number, number] = [...this.#colors.foreground, 1];

		this.#textOffsetFromWavePx = this.#config.text.offsetFromWavePx;

		this.#text = new WaveTextMsdf({
			gl: this.#gl,
			text: this.#config.text.content,
			scale: this.#config.text.scale,
			letterSpacing: this.#config.text.letterSpacing,
			color: packedColor,
		});

		this.#sparkles = new SparkleSprites(this.#gl, {
			tint: packedColor,
			deformStrength: this.#config.sparkles.deformStrength,
			scale: this.#config.sparkles.scale,
			spacingPx: this.#config.sparkles.offsetBetweenPx,
		});

		this.#baseTextScale = this.#text.getScale();
		this.#baseSparkleScale = this.#config.sparkles.scale;

		this.#setupReducedMotion();
		this.#subscribeToThemeChange();
	}

	static #mergeConfig(config?: Partial<SceneConfig>): SceneConfig {
		const base = DEFAULT_SCENE_CONFIG;
		if (!config) {
			return {
				line: {
					build: { ...base.line.build },
					config: { ...base.line.config },
				},
				text: { ...base.text },
				lens: { ...base.lens },
				sparkles: { ...base.sparkles },
			};
		}

		return {
			line: {
				build: { ...base.line.build, ...(config.line?.build ?? {}) },
				config: { ...base.line.config, ...(config.line?.config ?? {}) },
			},
			text: {
				content: config.text?.content ?? base.text.content,
				scale: config.text?.scale ?? base.text.scale,
				letterSpacing: config.text?.letterSpacing ?? base.text.letterSpacing,
				offsetFromWavePx: config.text?.offsetFromWavePx ?? base.text.offsetFromWavePx,
			},
			lens: {
				followLerp: config.lens?.followLerp ?? base.lens.followLerp,
			},
			sparkles: {
				enabled: config.sparkles?.enabled ?? base.sparkles.enabled,
				scale: config.sparkles?.scale ?? base.sparkles.scale,
				offsetBetweenPx: config.sparkles?.offsetBetweenPx ?? base.sparkles.offsetBetweenPx,
				offsetFromWavePx: config.sparkles?.offsetFromWavePx ?? base.sparkles.offsetFromWavePx,
				offsetFromTextEdgePx: config.sparkles?.offsetFromTextEdgePx ?? base.sparkles.offsetFromTextEdgePx,
				deformStrength: config.sparkles?.deformStrength ?? base.sparkles.deformStrength,
			},
		};
	}

	start(): void {
		if (this.#isRunning) return;
		gsap.ticker.add(this.#tick);
		this.#isRunning = true;
	}

	stop(): void {
		if (!this.#isRunning) return;
		gsap.ticker.remove(this.#tick);
		this.#isRunning = false;
	}

	dispose(): void {
		this.stop();
		if (this.#reduceMotionMql) {
			this.#reduceMotionMql.removeEventListener("change", this.#onReducedMotionChange);
		}

		this.#unsubscribeTheme?.();
		this.#unsubscribeParams?.();

		this.#lens.dispose();
		this.#text.dispose();
		this.#line.dispose();
		this.#sparkles.dispose();
	}

	setColorsFromTheme(): void {
		this.#colors = getTheme();

		this.#line.updateConfig({
			color: [...this.#colors.foreground, 1],
		});

		const packedColor: [number, number, number, number] = [...this.#colors.foreground, 1];

		this.#text.setColor(packedColor);
		this.#sparkles.setTint(packedColor);
	}

	setParams(params: Partial<WaveParams>): void {
		this.#waveParamsTarget = { ...this.#waveParamsTarget, ...params };
	}

	// API pour une future UI de réglages
	setTextOffsetFromWave(offsetPx: number): void {
		this.#textOffsetFromWavePx = offsetPx;
		this.#config.text.offsetFromWavePx = offsetPx;
	}

	setTextScale(scale: number): void {
		this.#text.setScale(scale);
		this.#config.text.scale = scale;
	}

	setTextLetterSpacing(spacing: number): void {
		this.#text.setLetterSpacing(spacing);
		this.#config.text.letterSpacing = spacing;
	}

	setSparkleScale(scale: number): void {
		this.#sparkles.setScale(scale);
		this.#config.sparkles.scale = scale;
	}

	setLineWidthPx(widthPx: number): void {
		if (!Number.isFinite(widthPx) || widthPx <= 0) {
			return;
		}

		this.#line.updateConfig({
			lineWidthPx: widthPx,
		});
		this.#config.line.config.lineWidthPx = widthPx;
	}

	setLineDash(periodPx: number, duty: number): void {
		if (!Number.isFinite(periodPx) || periodPx <= 0) {
			return;
		}
		const clampedDuty = Math.max(0, Math.min(Number.isFinite(duty) ? duty : 0.5, 1));

		this.#line.updateConfig({
			dashPeriodPx: periodPx,
			dashDuty: clampedDuty,
		});
		this.#config.line.config.dashPeriodPx = periodPx;
		this.#config.line.config.dashDuty = clampedDuty;
	}

	#setupReducedMotion(): void {
		const mql = window.matchMedia(REDUCED_MOTION_QUERY);
		this.#reduceMotion = mql.matches;
		this.#reduceMotionMql = mql;
		mql.addEventListener("change", this.#onReducedMotionChange);
	}

	#onReducedMotionChange = (event: MediaQueryListEvent): void => {
		this.#reduceMotion = event.matches;
	};

	#subscribeToThemeChange(): void {
		this.#unsubscribeTheme = events.onThemeChange(() => {
			this.setColorsFromTheme();
		});
	}

	#tick = (): void => {
		const deltaRatio = gsap.ticker.deltaRatio(60);
		const dtSec = deltaRatio / 60;

		this.#resize();
		this.#lens.update();
		this.#update(dtSec, deltaRatio);
		this.#render();
	};

	#resize(): boolean {
		const hasChanged = resizeCanvasToDisplaySize({ canvas: this.#canvas });

		if (!hasChanged) return false;
		const { width, height } = this.#canvas;
		this.#gl.viewport(0, 0, width, height);

		if (this.#baseCanvasWidth === null || this.#baseCanvasHeight === null) {
			this.#baseCanvasWidth = width;
			this.#baseCanvasHeight = height;
		}

		if (this.#baseCanvasWidth > 0 && this.#baseCanvasHeight > 0) {
			const rw = width / this.#baseCanvasWidth;
			const rh = height / this.#baseCanvasHeight;
			const factor = Math.min(rw, rh);
			const clampedFactor = Math.max(0.4, Math.min(factor, 2.5));

			this.#text.setScale(this.#baseTextScale * clampedFactor);
			this.#sparkles.setScale(this.#baseSparkleScale * clampedFactor);
		}

		return true;
	}

	#lerp(from: number, to: number, alpha: number): number {
		return from + (to - from) * alpha;
	}

	#update(dtSec: number, deltaRatio: number): void {
		const smoothing = 0.15;

		this.#waveParamsCurrent = {
			amplitude: this.#lerp(this.#waveParamsCurrent.amplitude, this.#waveParamsTarget.amplitude, smoothing),
			frequency: this.#lerp(this.#waveParamsCurrent.frequency, this.#waveParamsTarget.frequency, smoothing),
			speed: this.#lerp(this.#waveParamsCurrent.speed, this.#waveParamsTarget.speed, smoothing),
		};

		const baseSpeed = this.#waveParamsCurrent.speed;
		const speed = this.#reduceMotion ? baseSpeed * 0.5 : baseSpeed;
		const phaseStep = 0.02 * speed * deltaRatio;

		this.#phase = (this.#phase - phaseStep) % (Math.PI * 2);
		if (this.#phase < 0) this.#phase += Math.PI * 2;

		this.#timeSec += dtSec;
		void this.#timeSec;
	}

	#clear(): void {
		const gl = this.#gl;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	#render(): void {
		this.#clear();

		const width = this.#canvas.width;
		const height = this.#canvas.height;

		const lens = this.#lens.getUniforms();

		this.#line.render({
			resolution: { width, height },
			phase: this.#phase,
			amplitude: this.#waveParamsCurrent.amplitude,
			frequency: this.#waveParamsCurrent.frequency,
			ampEnvelope: { start: 1, end: 1 },
			baselineSlopePx: 0,
			lens,
		});

		const textWidth = this.#text.getTextWidth();
		const offsetY = this.#textOffsetFromWavePx;
		const offsetX = (width - textWidth) * 0.5;

		this.#text.render({
			resolution: { width, height },
			phase: this.#phase,
			amplitude: this.#waveParamsCurrent.amplitude,
			frequency: this.#waveParamsCurrent.frequency,
			offset: {
				x: offsetX,
				y: offsetY,
			},
			lens,
		});

		if (this.#config.sparkles.enabled) {
			const sparkleOffsetY = offsetY + this.#config.sparkles.offsetFromWavePx;
			const edgeOffsetX = this.#config.sparkles.offsetFromTextEdgePx;

			this.#sparkles.render({
				resolution: { width, height },
				phase: this.#phase,
				amplitude: this.#waveParamsCurrent.amplitude,
				frequency: this.#waveParamsCurrent.frequency,
				offset: {
					x: offsetX + textWidth + edgeOffsetX,
					y: sparkleOffsetY,
				},
				lens,
			});
		}
	}
}
