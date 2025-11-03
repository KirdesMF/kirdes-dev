// wave-scene.ts (patch complet)
import { gsap } from "gsap";
import { getTheme, onThemeChange, type Theme } from "../theme";
import { cssColorToVec3, getGL2Context } from "./_helpers";
import { isLikelyMobile, resizeCanvasToDisplaySize } from "./_utils";
import { LensOverlay, type LensUniforms } from "./lens-overlay";
import { SparklesText } from "./sparkles-text";
import { SparklesWaveParticles } from "./sparkles-wave-particles";
import { WaveLine, type WaveLineBuild, type WaveLineConfig } from "./wave-line";
import { WaveText } from "./wave-text";

// ——— Public types ———
export type WavePublicParams = {
	amplitude: number; // px (tweenable)
	frequency: number; // rad/px (tweenable)
	speed: number; // facteur anim phase
	color: [number, number, number, number]; // RGBA 0..1 (ligne)
};

export type SceneBuild = {
	line: Partial<WaveLineBuild>;
	textGridResDesktop: number;
	textGridResMobile: number;
	dprCapDesktop: number;
	dprCapMobile: number;
};

export type SceneTheme = {
	/** Couleur principale (CSS) pour texte + sparkles (field & text). */
	primaryCss: string;
	/** Optionnel: couleur CSS différente pour la ligne. */
	lineColorCss?: string;
};

// ——— Constantes centralisées ———
const MAX_TEXT_W = 1400;
const MAX_TEXT_H = 550;

const SCENE_BUILD_DEFAULTS: SceneBuild = {
	line: { segments: isLikelyMobile() ? 768 : 1024 },
	textGridResDesktop: 200,
	textGridResMobile: 140,
	dprCapDesktop: 2.0,
	dprCapMobile: 1.5,
};

const CONSTANTS = {
	lensEnterRadius: 160, // rayon animé à l’entrée
	mouseLerpK: 0.12, // vitesse de lissage pointeur
	textQuadWFrac: 0.9, // % largeur canvas
	textQuadHFrac: 0.6, // % hauteur canvas
	minSegments: 512,
	maxSegments: 2048,
	pxPerPoint: 2, // heuristique: ~1 point / 2px
};

const PARAM_DEFAULTS: WavePublicParams = {
	amplitude: 120,
	frequency: 0.005,
	speed: 2,
	color: [1, 1, 1, 1],
};

type CssColorKey = string;
const colorVec3Cache = new Map<CssColorKey, [number, number, number]>();

function cssToVec3Cached(color: string): [number, number, number] {
	const key = color.trim().toLowerCase();
	const hit = colorVec3Cache.get(key);
	if (hit) return hit;
	const vec = cssColorToVec3(color);
	colorVec3Cache.set(key, vec);
	return vec;
}

function cloneVec3(vec: [number, number, number]): [number, number, number] {
	return [vec[0], vec[1], vec[2]];
}

// ——— Scene ———
export class WaveScene {
	private canvas: HTMLCanvasElement;
	private gl: WebGL2RenderingContext;

	private unsubscribeThemeChange?: () => void;

	private line: WaveLine;
	private text: WaveText;
	private sparklesText: SparklesText;
	private sparklesWave: SparklesWaveParticles;
	private lensOverlay: LensOverlay;

	private lens: Omit<LensUniforms, "resolution"> = {
		centerPx: { x: 0, y: 0 },
		radiusPx: 0,
		featherPx: 0,
		colorRing: [1, 1, 1, 1],
		colorFill: [0, 0, 0, 0],
	};

	private mouseTarget = { x: 0, y: 0 }; // [-1..1]
	private mouseLerp = { x: 0, y: 0 };

	private phase = 0;
	private timeSec = 0;
	public params: WavePublicParams;

	private isRunning = false;
	private reduceMotion = false;

	private fpsAvg: number | null = null;
	private readonly fpsAlpha = 0.1;

	private maxDPRCap: number;
	private basePointCount: number;

	private build: SceneBuild;

	// — caches / flags —
	private readonly isMobile = isLikelyMobile();
	private mediaPRM = window.matchMedia("(prefers-reduced-motion: reduce)");
	private textOffset = { x: 0, y: 0 };
	private textOffsets = { top: 0, bottom: 0 };
	private renderSize = { width: 0, height: 0 };
	private sparklesArea = { width: 0, height: 0 };
	private ro?: ResizeObserver;

	constructor(args: {
		canvas: HTMLCanvasElement;
		initial?: Partial<WavePublicParams>;
		build?: Partial<SceneBuild>;
		waveLine?: Partial<WaveLineConfig>;
		theme?: SceneTheme;
	}) {
		const { canvas, initial, build, waveLine, theme } = args;
		const domTheme = getTheme();
		const primaryCss = theme?.primaryCss ?? domTheme.text;
		const primaryVec3 = cssToVec3Cached(primaryCss);
		const lineCss = theme?.lineColorCss ?? primaryCss;
		const lineVec3 = cssToVec3Cached(lineCss);
		const defaultAlpha = initial?.color?.[3] ?? 1;
		const lineColorRgba: [number, number, number, number] = [
			lineVec3[0],
			lineVec3[1],
			lineVec3[2],
			defaultAlpha,
		];

		this.canvas = canvas;
		this.gl = getGL2Context(canvas);

		this.gl.enable(this.gl.BLEND);
		this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);

		this.params = {
			...PARAM_DEFAULTS,
			color: lineColorRgba,
			...initial,
		};

		this.lens.colorRing = [
			this.params.color[0],
			this.params.color[1],
			this.params.color[2],
			this.params.color[3] ?? 1,
		];

		this.build = { ...SCENE_BUILD_DEFAULTS, ...build };
		this.maxDPRCap = this.isMobile
			? this.build.dprCapMobile
			: this.build.dprCapDesktop;
		this.basePointCount =
			this.build.line.segments ?? (this.isMobile ? 768 : 1024);

		// — lens overlay
		this.lensOverlay = new LensOverlay(this.gl);

		// — wave line (vec4)
		this.line = new WaveLine(
			this.gl,
			{ ...this.build.line },
			{
				color: this.params.color,
				isDashed: true,
				dashPeriodPx: 12,
				dashDuty: 0.6,
				...waveLine,
			},
		);

		// — text (fill = CSS)
		this.text = new WaveText(this.gl, {
			color: primaryCss,
		});
		this.text.setDualOffsetX(this.textOffsets.top, this.textOffsets.bottom);

		// — sparkles next to text (vec3)
		const initialQuadWidth = Math.min(
			this.canvas.width * CONSTANTS.textQuadWFrac,
			MAX_TEXT_W,
		);
		const initialQuadHeight = Math.min(
			this.canvas.height * CONSTANTS.textQuadHFrac,
			MAX_TEXT_H,
		);
		this.sparklesArea.width = this.canvas.width;
		this.sparklesArea.height = this.canvas.height;

		this.sparklesText = new SparklesText(this.gl, {
			quadWidth: initialQuadWidth,
			quadHeight: initialQuadHeight,
			topSizesPx: this.isMobile ? [58, 38] : [92, 58],
			bottomSizesPx: this.isMobile ? [58, 38] : [92, 58],
			color: cloneVec3(primaryVec3),
		});
		this.sparklesText.setDualOffsetX(
			this.textOffsets.top,
			this.textOffsets.bottom,
		);

		this.sparklesWave = new SparklesWaveParticles(this.gl, {
			count: this.isMobile ? 48 : 84,
			color: cloneVec3(primaryVec3),
			areaWidth: this.canvas.width,
			areaHeight: this.canvas.height,
			sizeRangePx: this.isMobile ? [18, 46] : [24, 64],
			yOffsetRangePx: this.isMobile ? [-110, 110] : [-150, 150],
			speedRangePxPerSec: this.isMobile ? [30, 120] : [40, 190],
			rotationSpeedRangeDeg: this.isMobile ? [-35, 35] : [-40, 40],
			rotationBaseRangeDeg: this.isMobile ? [-20, 20] : [-30, 30],
			tiltAmplitudeDegRange: this.isMobile ? [8, 24] : [10, 32],
			tiltSpeedRangeHz: this.isMobile ? [0.15, 0.45] : [0.2, 0.6],
			alphaRange: [0.35, 1],
		});

		// reduce motion
		this.reduceMotion = this.mediaPRM.matches;
		this.mediaPRM.addEventListener("change", this.onPRMChange);

		// pointer
		this.canvas.addEventListener("pointerenter", this.onPointerEnter);
		this.canvas.addEventListener("pointermove", this.onPointerMove, {
			passive: true,
		});
		this.canvas.addEventListener("pointerleave", this.onPointerLeave);

		// webgl context lost/restored (optionnel mais robuste)
		this.canvas.addEventListener(
			"webglcontextlost",
			this.onContextLost as EventListener,
			false,
		);
		this.canvas.addEventListener(
			"webglcontextrestored",
			this.onContextRestored as EventListener,
			false,
		);

		// resize observer (facultatif mais pratique)
		this.ro = new ResizeObserver(() => this.resize());
		this.ro.observe(this.canvas);

		this.setThemeColors({ primaryCss, lineColorCss: lineCss });
		this.unsubscribeThemeChange = onThemeChange(this.handleThemeChange);

		// first layout
		this.resize();
		this.recalcTextAndSparklesQuads();
		this.updateTextOffset();
		this.clear();
	}

	public getLensCSS() {
		const rect = this.canvas.getBoundingClientRect();
		const sx = this.canvas.width / rect.width;
		const sy = this.canvas.height / rect.height;

		const x = this.lens.centerPx.x / sx;
		const y = (this.canvas.height - this.lens.centerPx.y) / sy;
		const radius = this.lens.radiusPx / sx;

		return { x, y, radius };
	}

	// ——— Public API (GSAP friendly) ———
	public setAmplitude(v: number) {
		this.params.amplitude = Math.max(0, v);
	}
	public setFrequency(v: number) {
		this.params.frequency = Math.max(0, v);
	}
	public setSpeed(v: number) {
		// borne un peu pour éviter des vitesses “folles”
		this.params.speed = Math.max(0, Math.min(10, v));
	}
	public setLineColorRgba(rgba: [number, number, number, number]) {
		this.params.color = rgba;
		this.line.updateConfig({ color: rgba });
	}

	private handleThemeChange = (theme: Theme) => {
		this.setThemeColors({
			primaryCss: theme.text,
			lineColorCss: theme.text,
		});
	};

	/** Met à jour les couleurs du thème (texte/sparkles + optionnellement la ligne). */
	public setThemeColors(theme: SceneTheme) {
		const primaryCss = theme.primaryCss ?? "#ffffff";
		const primaryVec3 = cssToVec3Cached(primaryCss);
		this.text.updateColor(primaryCss);
		this.text.updateLensConfig({
			textColor: cloneVec3(primaryVec3),
		});
		this.sparklesText.updateConfig({
			color: cloneVec3(primaryVec3),
		});
		this.sparklesWave.updateConfig({
			color: cloneVec3(primaryVec3),
		});

		const lineCss = theme.lineColorCss ?? primaryCss;
		const [r, g, b] = cssToVec3Cached(lineCss);
		const alpha = this.params.color[3] ?? 1;
		this.setLineColorRgba([r, g, b, alpha]);
		this.lens.colorRing = [r, g, b, alpha];
	}

	/** Rebuild des éléments “build-time” (ex: segments, DPR caps, gridRes). */
	public setBuild(patch: Partial<SceneBuild>) {
		this.build = { ...this.build, ...patch };

		if (patch.line && patch.line.segments !== undefined) {
			this.basePointCount = Math.max(2, patch.line.segments);
			this.line.rebuild({ segments: this.basePointCount });
		}
		if (patch.dprCapDesktop !== undefined || patch.dprCapMobile !== undefined) {
			this.maxDPRCap = this.isMobile
				? (patch.dprCapMobile ?? this.maxDPRCap)
				: (patch.dprCapDesktop ?? this.maxDPRCap);
			this.resize(); // recalc DPR
		}
		// gridRes côté texte sera réappliqué au prochain recalc
		this.recalcTextAndSparklesQuads();
		this.updateTextOffset();
	}

	/** Setter explicite pour les caps DPR. */
	public setDprCap(desktop: number, mobile: number) {
		this.maxDPRCap = this.isMobile ? mobile : desktop;
		this.resize();
	}

	/** Affiche/masque la lentille. */
	public setLensVisible(visible: boolean, animated = true) {
		if (animated) {
			gsap.to(this.lens, {
				radiusPx: visible ? CONSTANTS.lensEnterRadius : 0,
				duration: 0.2,
				ease: visible ? "power2.out" : "power2.in",
			});
		} else {
			this.lens.radiusPx = visible ? CONSTANTS.lensEnterRadius : 0;
		}
	}

	public start() {
		if (this.isRunning) return;
		gsap.ticker.add(this.tick);
		this.isRunning = true;
	}
	public stop() {
		if (!this.isRunning) return;
		gsap.ticker.remove(this.tick);
		this.isRunning = false;
	}

	public dispose() {
		this.stop();

		this.mediaPRM.removeEventListener("change", this.onPRMChange);
		this.canvas.removeEventListener("pointerenter", this.onPointerEnter);
		this.canvas.removeEventListener("pointermove", this.onPointerMove);
		this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
		this.canvas.removeEventListener(
			"webglcontextlost",
			this.onContextLost as EventListener,
		);
		this.canvas.removeEventListener(
			"webglcontextrestored",
			this.onContextRestored as EventListener,
		);
		this.ro?.disconnect();
		this.unsubscribeThemeChange?.();

		this.lensOverlay.dispose();
		this.line.dispose();
		this.sparklesWave.dispose();
		this.sparklesText.dispose();
		this.text.dispose();
	}

	// ——— internals ———
	private onPRMChange = (ev: MediaQueryListEvent) => {
		this.reduceMotion = ev.matches;
	};

	private onPointerMove = (e: PointerEvent) => {
		const rect = this.canvas.getBoundingClientRect();
		const sx = this.canvas.width / rect.width;
		const sy = this.canvas.height / rect.height;

		// lens in px-space
		this.lens.centerPx.x = (e.clientX - rect.left) * sx;
		this.lens.centerPx.y = this.canvas.height - (e.clientY - rect.top) * sy;

		// parallax in [-1..1]
		const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
		const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
		this.mouseTarget.x = Math.max(-1, Math.min(1, nx));
		this.mouseTarget.y = Math.max(-1, Math.min(1, ny));
	};

	private onPointerEnter = () => {
		this.setLensVisible(true, true);
	};

	private onPointerLeave = () => {
		this.setLensVisible(false, false);

		// parallax
		this.mouseTarget.x = 0;
		this.mouseTarget.y = 0;

		gsap.to(this.mouseLerp, {
			x: 0,
			y: 0,
			duration: 1,
			ease: "elastic.out(1.5, 0.2)",
		});
	};

	private onContextLost = (e: Event) => {
		e.preventDefault();
		this.stop();
	};

	private onContextRestored = () => {
		// Si tu as des ressources GL à recréer, fais-le ici.
		this.start();
	};

	private tick = () => {
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
		this.phase = (this.phase + 0.02 * speed * deltaRatio) % (Math.PI * 2);
		this.timeSec += deltaRatio / 60;

		// mouse lerp
		const k = CONSTANTS.mouseLerpK;
		this.mouseLerp.x += (this.mouseTarget.x - this.mouseLerp.x) * k;
		this.mouseLerp.y += (this.mouseTarget.y - this.mouseLerp.y) * k;

		this.render();
	};

	private resize(): boolean {
		const changed = resizeCanvasToDisplaySize({
			canvas: this.canvas,
			maxDPR: this.maxDPRCap,
		});
		if (!changed) return false;

		this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);

		// Heuristique: ~1 point / 2px, bornée [512..2048]
		const target = Math.min(
			Math.max(
				CONSTANTS.minSegments,
				Math.floor(this.canvas.width / CONSTANTS.pxPerPoint),
			),
			CONSTANTS.maxSegments,
		);

		if (target !== this.basePointCount) {
			this.basePointCount = target;
			this.line.rebuild({ segments: target });
		}

		// Toujours (re)adapter quads & field sur resize
		this.recalcTextAndSparklesQuads();
		this.updateTextOffset();
		return true;
	}

	private recalcTextAndSparklesQuads() {
		const w = Math.min(this.canvas.width * CONSTANTS.textQuadWFrac, MAX_TEXT_W);
		const h = Math.min(
			this.canvas.height * CONSTANTS.textQuadHFrac,
			MAX_TEXT_H,
		);

		this.text.resizeQuad({
			width: w,
			height: h,
			gridRes: this.isMobile
				? this.build.textGridResMobile
				: this.build.textGridResDesktop,
		});

		this.sparklesText.resizeQuad({ width: w, height: h });
		this.sparklesWave.resizeArea({
			width: this.canvas.width,
			height: this.canvas.height,
		});
		this.sparklesArea.width = this.canvas.width;
		this.sparklesArea.height = this.canvas.height;

		const wordPx = this.text.getTextContentWidthPx(); // texture px
		const texW = this.text.getTextureCanvasWidth(); // texture px
		this.sparklesText.setTextContentWidthFromTexture(wordPx, texW);
	}

	public setTextContent(text: string) {
		this.text.updateText(text);
		const wordPx = this.text.getTextContentWidthPx();
		const texW = this.text.getTextureCanvasWidth();
		this.sparklesText.setTextContentWidthFromTexture(wordPx, texW);
	}

	public setTextOffsets(offsets: { top?: number; bottom?: number }) {
		const nextTop =
			offsets.top !== undefined ? offsets.top : this.textOffsets.top;
		const nextBottom =
			offsets.bottom !== undefined ? offsets.bottom : this.textOffsets.bottom;
		if (
			nextTop === this.textOffsets.top &&
			nextBottom === this.textOffsets.bottom
		) {
			return;
		}
		this.textOffsets.top = nextTop;
		this.textOffsets.bottom = nextBottom;
		this.text.setDualOffsetX(this.textOffsets.top, this.textOffsets.bottom);
		this.sparklesText.setDualOffsetX(
			this.textOffsets.top,
			this.textOffsets.bottom,
		);
	}

	public getTextOffsets() {
		return { ...this.textOffsets };
	}

	private updateTextOffset() {
		const w = Math.min(this.canvas.width * CONSTANTS.textQuadWFrac, MAX_TEXT_W);
		const h = Math.min(
			this.canvas.height * CONSTANTS.textQuadHFrac,
			MAX_TEXT_H,
		);
		this.textOffset.x = (this.canvas.width - w) * 0.5;
		this.textOffset.y = (this.canvas.height - h) * 0.5;
	}

	private clear() {
		const gl = this.gl;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	}

	private render() {
		this.clear();

		const offset = this.textOffset;
		const resolution = this.renderSize;
		const amp = Math.max(0, this.params.amplitude);
		const freq = Math.max(0, this.params.frequency);
		const lens = {
			centerPx: { x: this.lens.centerPx.x, y: this.lens.centerPx.y },
			radiusPx: this.lens.radiusPx,
			featherPx: this.lens.featherPx,
		};

		// cache la taille pour éviter d’allouer à chaque appel
		this.renderSize.width = this.canvas.width;
		this.renderSize.height = this.canvas.height;

		// 2) ligne
		this.line.render({
			resolution,
			phase: this.phase,
			amplitude: amp,
			frequency: freq,
			lens,
		});

		// 3) particules le long de l'onde
		const particlesOffset = { x: 0, y: this.canvas.height * 0.5 };
		this.sparklesWave.render({
			resolution,
			phase: this.phase,
			amplitude: amp,
			frequency: freq,
			offset: particlesOffset,
			areaSize: this.sparklesArea,
			time: this.timeSec,
			lens,
		});

		// 4) sparkles du texte
		this.sparklesText.render({
			resolution,
			phase: this.phase,
			amplitude: amp,
			frequency: freq,
			offset,
			lens,
		});

		// 5) texte
		this.text.render({
			resolution,
			phase: this.phase,
			amplitude: amp,
			frequency: freq,
			offset,
			lens,
		});

		// 6) overlay de lentille
		this.lensOverlay.render({
			resolution,
			centerPx: lens.centerPx,
			radiusPx: lens.radiusPx,
			featherPx: lens.featherPx,
			colorRing: this.lens.colorRing,
		});
	}
}
