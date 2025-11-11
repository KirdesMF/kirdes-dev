import { get2DContext } from "./_utils";

// Utilitaire
const clamp = (v: number, a: number, b: number): number =>
	Math.max(a, Math.min(b, v));

// Deep Partial Type
type DeepPartial<T> = T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
		}
	: T;

// Types
interface Point {
	x: number;
	y: number;
	py: number;
	fixed: boolean;
}

interface Pointer {
	x: number;
	y: number;
	hover: boolean;
}

interface ColorValues {
	bg: string;
	fg: string;
}

interface PhysicsValues {
	friction: number;
	mass: number;
	strength: number;
	baselinePull: number;
	regularity: number;
	smoothIters: number;
	amount: number;
	fixEdges: boolean;
}

interface TextValues {
	content: string;
	tiled: boolean;
	angleDeg: number;
	scale: number;
	lineGap: number;
	hSpacing: number;
	letterSpacing: number;
	scrollSpeed: number;
}

interface IdleValues {
	enabled: boolean;
	amp: number;
	hz: number;
	lambda: number;
	phaseDeg: number;
	resumeSec: number;
}

interface RuntimeValues {
	textScrollPx: number;
	tSec: number;
}

interface AllValues {
	colors: ColorValues;
	physics: PhysicsValues;
	text: TextValues;
	idle: IdleValues;
	runtime: RuntimeValues;
}

interface OffscreenBuffer {
	ctx: CanvasRenderingContext2D;
	canvas: HTMLCanvasElement;
}

// TextRenderer
class TextRenderer {
	private getRect: () => DOMRect;
	private fontStack: string;

	constructor(getRect: () => DOMRect) {
		this.getRect = getRect;
		this.fontStack = "'Commissioner Variable'";
	}

	private measureSpaced(
		ctx: CanvasRenderingContext2D,
		text: string,
		ls?: number,
	): number {
		if (!text) return 0;
		if (!ls) return ctx.measureText(text).width;
		let w = 0;
		for (let i = 0; i < text.length; i++) {
			w += ctx.measureText(text[i]).width;
			if (i < text.length - 1) w += ls;
		}
		return w;
	}

	private fillTextSpaced(
		ctx: CanvasRenderingContext2D,
		text: string,
		x: number,
		y: number,
		ls?: number,
	): void {
		if (!text) return;
		if (!ls) {
			ctx.fillText(text, x, y);
			return;
		}
		let cx = x;
		for (let i = 0; i < text.length; i++) {
			const ch = text[i];
			ctx.fillText(ch, cx, y);
			cx += ctx.measureText(ch).width + ls;
		}
	}

	private computeFontPx(rect: DOMRect, values: AllValues): number {
		return Math.max(24, Math.min(160, rect.width * 0.12)) * values.text.scale;
	}

	private drawLettersWithCurrentFill(
		ctx: CanvasRenderingContext2D,
		values: AllValues,
	): void {
		const rect = this.getRect();
		const fontPx = this.computeFontPx(rect, values);
		ctx.textBaseline = "middle";
		ctx.textAlign = "left";
		ctx.font = `900 ${fontPx}px ${this.fontStack}`;

		const angleRad = ((values.text.angleDeg || 0) * Math.PI) / 180;
		ctx.save();
		ctx.translate(rect.width / 2, rect.height / 2);
		ctx.rotate(angleRad);

		const sample = values.text.content || "";
		const diag = Math.hypot(rect.width, rect.height);
		const stepY = fontPx * (values.text.lineGap || 1);
		const wordW = Math.max(
			1,
			this.measureSpaced(ctx, sample, values.text.letterSpacing),
		);
		const stepX = Math.max(1, wordW * (values.text.hSpacing || 1));

		for (let row = 0, y = -diag; y <= diag; row++, y += stepY) {
			const dir = row % 2 === 0 ? 1 : -1;
			const s = values.runtime.textScrollPx % stepX;
			ctx.save();
			ctx.translate(dir * s, 0);
			const startX = -diag - stepX;
			for (let x = startX; x <= diag + stepX; x += stepX) {
				this.fillTextSpaced(
					ctx,
					values.text.content,
					x,
					y,
					values.text.letterSpacing,
				);
			}
			ctx.restore();
		}
		ctx.restore();
	}

	public drawFG(ctx: CanvasRenderingContext2D, values: AllValues): void {
		ctx.fillStyle = values.colors.fg;
		this.drawLettersWithCurrentFill(ctx, values);
	}

	public drawBG(ctx: CanvasRenderingContext2D, values: AllValues): void {
		ctx.fillStyle = values.colors.bg;
		this.drawLettersWithCurrentFill(ctx, values);
	}
}

// Spring
class Spring {
	public a: Point;
	public b: Point;
	public strength: number;
	public restLength: number;
	public mamb: number;

	constructor(a: Point, b: Point, strength: number, rest: number) {
		this.a = a;
		this.b = b;
		this.strength = strength;
		this.restLength = rest;
		this.mamb = 1;
	}

	public update(invMass: number): void {
		const dx = this.b.x - this.a.x;
		const dyF = this.b.y - this.a.y;
		const dist = Math.hypot(dx, dyF) || 1e-6;
		const k = ((dist - this.restLength) / (dist * this.mamb)) * this.strength;
		const dy = dyF * k * invMass * 0.2;
		if (!this.a.fixed) this.a.y += dy;
		if (!this.b.fixed) this.b.y -= dy;
	}
}

// WaveModel
class WaveModel {
	private getRect: () => DOMRect;
	public points: Point[];
	public springs: Spring[];
	public baseY: number;

	constructor(getRect: () => DOMRect) {
		this.getRect = getRect;
		this.points = [];
		this.springs = [];
		this.baseY = 0;
	}

	public rebuild(
		amount: number,
		fixEdges: boolean,
		strength: number,
		mass: number,
	): void {
		const rect = this.getRect();
		this.points = [];
		this.springs = [];
		this.baseY = rect.height * 0.5;

		for (let i = 0; i <= amount; i++) {
			const x = (i / amount) * rect.width;
			const y = this.baseY;
			const px = i === 0 ? 0 : i === amount ? rect.width : x;
			const p: Point = {
				x: px,
				y,
				py: y,
				fixed: fixEdges && (i < 2 || i > amount - 2),
			};
			this.points.push(p);

			if (i > 0) {
				const prev = this.points[i - 1];
				const rest = Math.hypot(p.x - prev.x, p.y - prev.y);
				const s = new Spring(prev, p, strength, rest);
				s.mamb = (1 / mass) * (1 / mass);
				this.springs.push(s);
			}
		}
	}

	public step(dt: number, values: AllValues, idleSuppress: number): void {
		const rect = this.getRect();
		const H = rect.height;
		const baseY = this.baseY;
		const force = 1 - values.physics.friction * dt * dt;
		const invMass = 1 / values.physics.mass;

		for (let i = 0; i < this.points.length; i++) {
			const p = this.points[i];
			if (p.fixed) {
				p.py = p.y = baseY;
				continue;
			}

			const dy = (p.y - p.py) * force;
			p.py = p.y;
			p.y += dy;
			p.y += (baseY - p.y) * values.physics.baselinePull;

			const idleFactor = values.idle.enabled ? 1 - idleSuppress : 0;
			if (idleFactor > 0) {
				const phaseAcross = i / Math.max(1, this.points.length - 1);
				const phase =
					2 *
						Math.PI *
						(values.idle.lambda * phaseAcross -
							values.idle.hz * values.runtime.tSec) +
					(values.idle.phaseDeg * Math.PI) / 180;
				p.y += idleFactor * values.idle.amp * Math.sin(phase);
			}

			p.y = clamp(p.y, 0, H);
		}

		for (const s of this.springs) s.update(invMass);

		for (let t = 0; t < (values.physics.smoothIters | 0); t++) {
			const snap = this.points.map((p) => p.y);
			for (let i = 1; i < this.points.length - 1; i++) {
				const p = this.points[i];
				if (p.fixed) continue;
				p.y +=
					(snap[i - 1] + snap[i + 1] - 2 * snap[i]) * values.physics.regularity;
				p.y = clamp(p.y, 0, H);
			}
		}
	}

	public nudge(x: number, y: number, power: number): void {
		const pts = this.points;
		if (pts.length < 2) return;

		const firstX = pts[0].x;
		const lastX = pts[pts.length - 1].x;
		const span = Math.max(1e-6, lastX - firstX);
		const i = Math.round(((x - firstX) / span) * (pts.length - 1));
		const infl = this.getRect().height / 4;

		const k0 = (1 / 6) * power,
			k1 = (1 / 24) * power;

		const push = (idx: number, k: number) => {
			if (idx < 0 || idx > pts.length - 1) return;
			const p = pts[idx];
			if (p.fixed) return;
			const d = Math.hypot(p.x - x, p.y - y);
			if (d < infl) p.y += (y - p.y) * k;
		};

		push(i, k0);
		push(i - 1, k1);
		push(i + 1, k1);
	}
}

// WaveRenderer
class WaveRenderer {
	private getRect: () => DOMRect;

	constructor(getRect: () => DOMRect) {
		this.getRect = getRect;
	}

	private pathFill(ctx: CanvasRenderingContext2D, model: WaveModel): void {
		const rect = this.getRect();
		const pts = model.points;
		if (pts.length < 2) return;

		ctx.beginPath();
		ctx.moveTo(0, rect.height);
		ctx.lineTo(pts[0].x, pts[0].y);

		for (let i = 0; i < pts.length - 1; i++) {
			const p0 = pts[Math.max(0, i - 1)],
				p1 = pts[i],
				p2 = pts[i + 1],
				p3 = pts[Math.min(pts.length - 1, i + 2)];

			const cp1x = p1.x + (p2.x - p0.x) / 6;
			const cp1y = p1.y + (p2.y - p0.y) / 6;
			const cp2x = p2.x - (p3.x - p1.x) / 6;
			const cp2y = p2.y - (p3.y - p1.y) / 6;

			ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
		}

		ctx.lineTo(rect.width, rect.height);
		ctx.lineTo(0, rect.height);
		ctx.closePath();
	}

	public renderFrame(
		ctxMain: CanvasRenderingContext2D,
		off: OffscreenBuffer,
		model: WaveModel,
		textRenderer: TextRenderer,
		values: AllValues,
	): void {
		const rect = this.getRect();
		const { bg, fg } = values.colors;

		// fond
		ctxMain.clearRect(0, 0, rect.width, rect.height);
		ctxMain.fillStyle = bg;
		ctxMain.fillRect(0, 0, rect.width, rect.height);

		// vague (FG)
		this.pathFill(ctxMain, model);
		ctxMain.fillStyle = fg;
		ctxMain.fill();

		// texte FG
		textRenderer.drawFG(ctxMain, values);

		// inversion texte∩vague → BG via offscreen
		const { ctx: offCtx, canvas: offCanvas } = off;
		offCtx.setTransform(1, 0, 0, 1, 0, 0);
		offCtx.clearRect(0, 0, rect.width, rect.height);
		textRenderer.drawBG(offCtx, values);

		offCtx.globalCompositeOperation = "destination-in";
		this.pathFill(offCtx, model);
		offCtx.fill();
		offCtx.globalCompositeOperation = "source-over";

		ctxMain.drawImage(offCanvas, 0, 0);
	}
}

function getTheme() {
	const style = getComputedStyle(document.documentElement);
	const bgColor = style.getPropertyValue("--color-background").trim();
	const fgColor = style.getPropertyValue("--color-foreground").trim();

	return { bg: bgColor, fg: fgColor };
}

type Theme = ReturnType<typeof getTheme>;

// Scene
export class SplashWaveScene {
	private canvas: HTMLCanvasElement;
	private ctx: CanvasRenderingContext2D;
	private offCanvas: HTMLCanvasElement;
	private offCtx: CanvasRenderingContext2D;
	private dpr: number;
	private pointer: Pointer;
	private tSec: number;
	private idleSuppress: number;
	private rafId: number;
	private _last?: number;
	private values: AllValues;
	private text: TextRenderer;
	private model: WaveModel;
	private renderer: WaveRenderer;
	private _onResize: () => void;
	private _onMove: (e: MouseEvent | TouchEvent) => void;
	private _onLeave: () => void;
	private _onEnter: () => void;
	private _onThemeChange: () => void;
	private theme: Theme;

	constructor(canvas: HTMLCanvasElement) {
		this.canvas = canvas;
		this.ctx = get2DContext(this.canvas);
		this.offCanvas = document.createElement("canvas");
		this.offCtx = get2DContext(this.offCanvas);
		this.dpr = 1;
		this.pointer = { x: 0, y: 0, hover: false };
		this.tSec = 0;
		this.idleSuppress = 0;
		this.rafId = 0;
		this.theme = getTheme();

		this.values = {
			colors: { bg: this.theme.bg, fg: this.theme.fg },
			physics: {
				friction: 0.8,
				mass: 2,
				strength: 0.1,
				baselinePull: 0.008,
				regularity: 0.15,
				smoothIters: 2,
				amount: 64,
				fixEdges: false,
			},
			text: {
				content: "CREATIVE DEVELOPER",
				tiled: true,
				angleDeg: -35,
				scale: 1.25,
				lineGap: 0.8,
				hSpacing: 1,
				letterSpacing: -3,
				scrollSpeed: 30,
			},
			idle: {
				enabled: true,
				amp: 0.75,
				hz: 0.5,
				lambda: 1,
				phaseDeg: 0.5,
				resumeSec: 1.2,
			},
			runtime: { textScrollPx: 0, tSec: 0 },
		};

		this.text = new TextRenderer(() => this.getRect());
		this.model = new WaveModel(() => this.getRect());
		this.renderer = new WaveRenderer(() => this.getRect());

		this._onThemeChange = () => this.setTheme(getTheme());
		this._onResize = () => this.resize();
		this._onMove = (e) => this.onPointerMove(e);
		this._onLeave = () => {
			this.pointer.hover = false;
		};
		this._onEnter = () => {
			this.pointer.hover = true;
		};
	}

	private getRect(): DOMRect {
		return this.canvas.getBoundingClientRect();
	}

	public mount(): void {
		window.addEventListener("resize", this._onResize);
		window.addEventListener("themechange", this._onThemeChange);
		this.canvas.addEventListener("mousemove", this._onMove, { passive: true });
		this.canvas.addEventListener("touchmove", this._onMove, { passive: true });
		this.canvas.addEventListener("mouseenter", this._onEnter);
		this.canvas.addEventListener("mouseleave", this._onLeave);
		this.canvas.addEventListener("touchstart", this._onEnter, {
			passive: true,
		});
		this.canvas.addEventListener("touchend", this._onLeave, { passive: true });
		this.resize();
		this.start();
	}

	public unmount(): void {
		this.stop();
		window.removeEventListener("resize", this._onResize);
		window.removeEventListener("themechange", this._onThemeChange);
		this.canvas.removeEventListener("mousemove", this._onMove);
		this.canvas.removeEventListener("touchmove", this._onMove);
		this.canvas.removeEventListener("mouseenter", this._onEnter);
		this.canvas.removeEventListener("mouseleave", this._onLeave);
		this.canvas.removeEventListener("touchstart", this._onEnter);
		this.canvas.removeEventListener("touchend", this._onLeave);
	}

	public setTheme(theme: Theme): void {
		this.theme = theme;
		this.values.colors.bg = theme.bg;
		this.values.colors.fg = theme.fg;
	}

	private resize(): void {
		const rect = this.getRect();
		if (rect.width < 2 || rect.height < 2) return;

		this.dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
		const W = Math.floor(rect.width * this.dpr);
		const H = Math.floor(rect.height * this.dpr);

		if (this.canvas.width !== W || this.canvas.height !== H) {
			this.canvas.width = W;
			this.canvas.height = H;
			this.ctx.setTransform(1, 0, 0, 1, 0, 0);
			this.ctx.scale(this.dpr, this.dpr);
		}

		const cssW = Math.floor(rect.width),
			cssH = Math.floor(rect.height);
		if (this.offCanvas.width !== cssW || this.offCanvas.height !== cssH) {
			this.offCanvas.width = cssW;
			this.offCanvas.height = cssH;
		}

		this.offCtx.setTransform(1, 0, 0, 1, 0, 0);
		// document.documentElement.style.setProperty("--bg", this.values.colors.bg);
		// document.documentElement.style.setProperty("--fg", this.values.colors.fg);

		this.model.rebuild(
			this.values.physics.amount,
			this.values.physics.fixEdges,
			this.values.physics.strength,
			this.values.physics.mass,
		);
	}

	public updateValues(patch: DeepPartial<AllValues>): void {
		this.deepMerge(this.values, patch);
		this.values.physics.mass = clamp(this.values.physics.mass, 0.5, 10);
		this.values.physics.friction = clamp(this.values.physics.friction, 0, 1);
		this.values.idle.hz = clamp(this.values.idle.hz, 0, 2);
	}

	private deepMerge<T>(target: T, source: DeepPartial<T>): void {
		for (const key in source) {
			const sourceValue = source[key];
			const targetValue = target[key as keyof T];

			if (sourceValue === undefined || sourceValue === null) {
				continue;
			}

			if (
				typeof sourceValue === "object" &&
				!Array.isArray(sourceValue) &&
				typeof targetValue === "object" &&
				!Array.isArray(targetValue)
			) {
				this.deepMerge(
					targetValue,
					sourceValue as DeepPartial<typeof targetValue>,
				);
			} else {
				target[key as keyof T] = sourceValue as T[keyof T];
			}
		}
	}

	private onPointerMove(e: MouseEvent | TouchEvent): void {
		const rect = this.getRect();
		const pt = e instanceof TouchEvent ? e.touches[0] : e;
		const x = pt.clientX - rect.left;
		const y = pt.clientY - rect.top;
		this.pointer.x = x;
		this.pointer.y = y;
		this.pointer.hover = true;
		this.model.nudge(x, y, 1.0);
		this.idleSuppress = 1;
	}

	private start(): void {
		if (this.rafId) return;

		const loop = (now: number) => {
			const dt = Math.min(0.05, this._last ? (now - this._last) / 1000 : 0.016);
			this._last = now;
			this.tSec += dt;
			this.values.runtime.tSec = this.tSec;

			if (this.idleSuppress > 0) {
				this.idleSuppress = Math.max(
					0,
					this.idleSuppress - dt / Math.max(0.001, this.values.idle.resumeSec),
				);
			}

			this.values.runtime.textScrollPx =
				(this.values.runtime.textScrollPx + this.values.text.scrollSpeed * dt) %
				1e9;

			this.model.step(dt, this.values, this.idleSuppress);
			this.renderer.renderFrame(
				this.ctx,
				{ ctx: this.offCtx, canvas: this.offCanvas },
				this.model,
				this.text,
				this.values,
			);

			this.rafId = requestAnimationFrame(loop);
		};

		this.rafId = requestAnimationFrame(loop);
	}

	public stop(): void {
		if (this.rafId) {
			cancelAnimationFrame(this.rafId);
			this.rafId = 0;
		}
	}

	public getValues(): AllValues {
		return JSON.parse(JSON.stringify(this.values));
	}

	public setValues(v: AllValues): void {
		this.values = JSON.parse(JSON.stringify(v));
		this.resize();
	}
}
