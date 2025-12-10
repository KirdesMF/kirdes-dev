// FILE: src/components/ripple-text/scene.ts
import { gsap } from "gsap";
import { getGL2Context, resizeCanvasToDisplaySize } from "../../lib/webgl";
import { cssColorToVec3 } from "../../utils/colors";
import { DisplacementPass } from "./displacement-pass";
import { RippleLens } from "./lens";
import { MarqueeTextMsdf, type MarqueeTextRenderMode } from "./marquee-text-msdf";
import { type RippleConfig, RippleSystem } from "./ripples";

type Vec3 = [number, number, number];

function getTheme(): { background: Vec3; foreground: Vec3 } {
	const style = getComputedStyle(document.documentElement);
	const background = style.getPropertyValue("--color-background");
	const foreground = style.getPropertyValue("--color-foreground");
	return {
		background: cssColorToVec3(background),
		foreground: cssColorToVec3(foreground),
	};
}

export type RippleTextSceneConfig = {
	text: {
		content: string;
		scale: number;
		letterSpacing: number;
		rowGapPx: number;
		outlineWidth: number;
		wordSpacingPx: number;
	};
	marquee: {
		speedPxPerSec: number;
	};
	lens: {
		followLerp: number;
	};
	ripple: RippleConfig;
	rotationRad: number;
};

const DEFAULT_RIPPLE_CONFIG: RippleConfig = {
	maxRipples: 16,
	amplitude: 200,
	frequency: 0.15,
	speed: 500,
	maxRadius: 800,
	idleIntervalSec: 4,
	dragMinDistancePx: 100,
};

const DEFAULT_CONFIG: RippleTextSceneConfig = {
	text: {
		content: "PORTFOLIO",
		scale: 3.5,
		letterSpacing: 2,
		rowGapPx: 16,
		outlineWidth: 0.12,
		wordSpacingPx: 16,
	},
	marquee: {
		speedPxPerSec: 80,
	},
	lens: {
		followLerp: 0.15,
	},
	ripple: DEFAULT_RIPPLE_CONFIG,
	rotationRad: 0.7853981633974483,
};

export class RippleTextScene {
	#canvas: HTMLCanvasElement;
	#gl: WebGL2RenderingContext;
	#isRunning = false;

	#config: RippleTextSceneConfig;
	#colors = getTheme();

	#text: MarqueeTextMsdf;
	#lens: RippleLens;
	#ripples: RippleSystem;

	#baseCanvasWidth: number | null = null;
	#baseCanvasHeight: number | null = null;
	#baseTextScale: number;

	#timeSec = 0;

	#isPointerDown = false;

	#sceneTexture: WebGLTexture | null = null;
	#sceneFbo: WebGLFramebuffer | null = null;
	#displacementPass: DisplacementPass;

	constructor(canvas: HTMLCanvasElement, config?: Partial<RippleTextSceneConfig>) {
		this.#canvas = canvas;
		this.#gl = getGL2Context(canvas);
		this.#config = RippleTextScene.#mergeConfig(config);

		const packedColor: [number, number, number, number] = [...this.#colors.foreground, 1];

		this.#text = new MarqueeTextMsdf({
			gl: this.#gl,
			text: this.#config.text.content,
			scale: this.#config.text.scale,
			letterSpacing: this.#config.text.letterSpacing,
			color: packedColor,
			wordSpacingPx: this.#config.text.wordSpacingPx,
		});

		this.#lens = new RippleLens({
			canvas: this.#canvas,
			followLerp: this.#config.lens.followLerp,
		});

		this.#ripples = new RippleSystem(this.#config.ripple);

		this.#displacementPass = new DisplacementPass(this.#gl);

		this.#baseTextScale = this.#config.text.scale;

		this.#resize();
		this.#setupRenderTarget();
		this.#setupPointerEvents();
	}

	static #mergeConfig(config?: Partial<RippleTextSceneConfig>): RippleTextSceneConfig {
		if (!config) {
			return {
				text: { ...DEFAULT_CONFIG.text },
				marquee: { ...DEFAULT_CONFIG.marquee },
				lens: { ...DEFAULT_CONFIG.lens },
				ripple: { ...DEFAULT_CONFIG.ripple },
				rotationRad: DEFAULT_CONFIG.rotationRad,
			};
		}

		return {
			text: {
				content: config.text?.content ?? DEFAULT_CONFIG.text.content,
				scale: config.text?.scale ?? DEFAULT_CONFIG.text.scale,
				letterSpacing: config.text?.letterSpacing ?? DEFAULT_CONFIG.text.letterSpacing,
				rowGapPx: config.text?.rowGapPx ?? DEFAULT_CONFIG.text.rowGapPx,
				outlineWidth: config.text?.outlineWidth ?? DEFAULT_CONFIG.text.outlineWidth,
				wordSpacingPx: config.text?.wordSpacingPx ?? DEFAULT_CONFIG.text.wordSpacingPx,
			},
			marquee: {
				speedPxPerSec: config.marquee?.speedPxPerSec ?? DEFAULT_CONFIG.marquee.speedPxPerSec,
			},
			lens: {
				followLerp: config.lens?.followLerp ?? DEFAULT_CONFIG.lens.followLerp,
			},
			ripple: {
				...DEFAULT_CONFIG.ripple,
				...(config.ripple ?? {}),
			},
			rotationRad: config.rotationRad ?? DEFAULT_CONFIG.rotationRad,
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
		this.#text.dispose();
		this.#lens.dispose();
		this.#ripples.setConfig({ ...this.#config.ripple }); // no-op but keeps API symmetric
		this.#displacementPass.dispose();
		this.#removePointerEvents();
		this.#disposeRenderTarget();
	}

	setColorsFromTheme(): void {
		this.#colors = getTheme();
		const packedColor: [number, number, number, number] = [...this.#colors.foreground, 1];
		this.#text.setColor(packedColor);
	}

	setMarqueeSpeed(speedPxPerSec: number): void {
		if (!Number.isFinite(speedPxPerSec) || speedPxPerSec <= 0) {
			return;
		}
		this.#config.marquee.speedPxPerSec = speedPxPerSec;
	}

	setTextScale(scale: number): void {
		if (!Number.isFinite(scale) || scale <= 0) {
			return;
		}
		this.#config.text.scale = scale;
		this.#text.setScale(scale);
	}

	setTextLetterSpacing(spacing: number): void {
		if (!Number.isFinite(spacing)) {
			return;
		}
		this.#config.text.letterSpacing = spacing;
		this.#text.setLetterSpacing(spacing);
	}

	setRowGapPx(rowGapPx: number): void {
		if (!Number.isFinite(rowGapPx) || rowGapPx < 0) {
			return;
		}
		this.#config.text.rowGapPx = rowGapPx;
	}

	setRotationRad(angleRad: number): void {
		if (!Number.isFinite(angleRad)) {
			return;
		}
		this.#config.rotationRad = angleRad;
	}

	setOutlineWidth(width: number): void {
		if (!Number.isFinite(width) || width <= 0) {
			return;
		}
		this.#config.text.outlineWidth = width;
	}

	setWordSpacingPx(px: number): void {
		if (!Number.isFinite(px) || px < 0) {
			return;
		}
		this.#config.text.wordSpacingPx = px;
		this.#text.setWordSpacing(px);
	}

	setRippleParams(params: Partial<RippleConfig>): void {
		this.#config.ripple = { ...this.#config.ripple, ...params };
		this.#ripples.setConfig(this.#config.ripple);
	}

	#setupRenderTarget(): void {
		const gl = this.#gl;
		const width = this.#canvas.width;
		const height = this.#canvas.height;

		if (width <= 0 || height <= 0) return;

		this.#disposeRenderTarget();

		const texture = gl.createTexture();
		const fbo = gl.createFramebuffer();

		if (!texture || !fbo) {
			throw new Error("RippleTextScene: failed to create render target");
		}

		this.#sceneTexture = texture;
		this.#sceneFbo = fbo;

		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

		gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

		const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
		if (status !== gl.FRAMEBUFFER_COMPLETE) {
			throw new Error("RippleTextScene: framebuffer is not complete");
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	#disposeRenderTarget(): void {
		const gl = this.#gl;
		if (this.#sceneFbo) {
			gl.deleteFramebuffer(this.#sceneFbo);
			this.#sceneFbo = null;
		}
		if (this.#sceneTexture) {
			gl.deleteTexture(this.#sceneTexture);
			this.#sceneTexture = null;
		}
	}

	#setupPointerEvents(): void {
		const onPointerDown = (event: PointerEvent): void => {
			this.#isPointerDown = true;
			this.#spawnRippleFromPointer(event);
		};

		const onPointerMove = (event: PointerEvent): void => {
			if (!this.#isPointerDown) return;
			this.#spawnRippleFromPointer(event, true);
		};

		const onPointerUp = (): void => {
			this.#isPointerDown = false;
			this.#ripples.resetDrag();
		};

		this.#canvas.addEventListener("pointerdown", onPointerDown);
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerUp);

		(this.#canvas as unknown as { __rt_onPointerDown?: (e: PointerEvent) => void }).__rt_onPointerDown = onPointerDown;
		(window as unknown as { __rt_onPointerMove?: (e: PointerEvent) => void }).__rt_onPointerMove = onPointerMove;
		(window as unknown as { __rt_onPointerUp?: () => void }).__rt_onPointerUp = onPointerUp;
	}

	#removePointerEvents(): void {
		const canvasWithHandlers = this.#canvas as unknown as {
			__rt_onPointerDown?: (e: PointerEvent) => void;
		};
		const winWithHandlers = window as unknown as {
			__rt_onPointerMove?: (e: PointerEvent) => void;
			__rt_onPointerUp?: () => void;
		};

		if (canvasWithHandlers.__rt_onPointerDown) {
			this.#canvas.removeEventListener("pointerdown", canvasWithHandlers.__rt_onPointerDown);
		}
		if (winWithHandlers.__rt_onPointerMove) {
			window.removeEventListener("pointermove", winWithHandlers.__rt_onPointerMove);
		}
		if (winWithHandlers.__rt_onPointerUp) {
			window.removeEventListener("pointerup", winWithHandlers.__rt_onPointerUp);
		}
	}

	#spawnRippleFromPointer(event: PointerEvent, isDrag = false): void {
		const rect = this.#canvas.getBoundingClientRect();
		const clientWidth = this.#canvas.clientWidth;
		const dpr = clientWidth > 0 ? this.#canvas.width / clientWidth : 1;

		const x = (event.clientX - rect.left) * dpr;
		const y = (event.clientY - rect.top) * dpr;

		if (isDrag) {
			this.#ripples.spawnDrag({ x, y }, this.#timeSec);
		} else {
			this.#ripples.spawnAt({ x, y }, this.#timeSec);
		}
	}

	#tick = (): void => {
		const deltaRatio = gsap.ticker.deltaRatio(60);
		const dtSec = deltaRatio / 60;

		this.#timeSec += dtSec;

		this.#resize();
		this.#lens.update();
		this.#ripples.update(dtSec, this.#timeSec, {
			width: this.#canvas.width,
			height: this.#canvas.height,
		});
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
		}

		this.#setupRenderTarget();

		return true;
	}

	#renderSceneToTexture(width: number, height: number): void {
		if (!this.#sceneFbo) return;

		const gl = this.#gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.#sceneFbo);
		gl.viewport(0, 0, width, height);

		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		const textWidth = this.#text.getTextWidth();
		const lineHeight = this.#text.getLineHeight();
		const rowGapPx = this.#config.text.rowGapPx;

		const stepY = lineHeight + rowGapPx;
		if (stepY <= 0) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			return;
		}

		const rows = Math.ceil(height / stepY) + 2;
		const totalPatternHeight = rows * stepY;
		const startY = (height - totalPatternHeight) * 0.5;

		const wordSpacingPx = this.#config.text.wordSpacingPx;
		const tileSpan = textWidth + wordSpacingPx;

		const baseSpeed = this.#config.marquee.speedPxPerSec;
		if (tileSpan <= 0 || baseSpeed <= 0) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			return;
		}

		for (let row = 0; row < rows; row++) {
			const direction = row % 2 === 0 ? 1 : -1;
			const signedSpeed = baseSpeed * direction;

			const rawShift = this.#timeSec * signedSpeed;
			const shiftInPeriod = ((rawShift % tileSpan) + tileSpan) % tileSpan;
			const scrollX = -shiftInPeriod;

			const baseY = startY + row * stepY;
			const mode: MarqueeTextRenderMode = row % 2 === 0 ? "fill" : "outline";

			const tiles = Math.ceil((width + height) / tileSpan) + 4;
			const startX = -tileSpan * 2;

			for (let tile = 0; tile < tiles; tile++) {
				const offsetX = startX + tile * tileSpan;

				this.#text.render({
					resolution: { width, height },
					baseOffset: { x: offsetX, y: baseY },
					scrollX,
					rotationRad: this.#config.rotationRad,
					mode,
					outlineWidth: this.#config.text.outlineWidth,
				});
			}
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	#render(): void {
		const width = this.#canvas.width;
		const height = this.#canvas.height;
		if (width <= 0 || height <= 0) return;

		this.#renderSceneToTexture(width, height);

		const gl = this.#gl;
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.viewport(0, 0, width, height);

		// Pas besoin de clear ici, on dessine un quad fullscreen
		this.#displacementPass.render({
			resolution: { width, height },
			timeSec: this.#timeSec,
			ripples: this.#ripples.getRipples(),
			rippleConfig: this.#config.ripple,
			sceneTexture: this.#sceneTexture,
		});
	}
}
