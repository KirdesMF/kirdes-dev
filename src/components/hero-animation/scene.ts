import {
	type Body,
	type Engine,
	Events,
	type IEventCollision,
	type Pair,
} from "matter-js";
import { Application, Assets, type BitmapText } from "pixi.js";
import { cssVarToPixiColor } from "../../utils/css-color";
import { lerp } from "./_utils";
import { Blob } from "./blob";
import { createFixedStepper } from "./fixed-step";
import { fitFontSize, MsdfText } from "./msdf-text";
import { Panel } from "./panel";
import { createWorld, rebuildWalls } from "./world";

export class Scene {
	#app: Application | null = null;
	#canvas: HTMLCanvasElement;
	#engine: Engine | null = null;
	#walls: Body[] | null = null;
	#blobs: Blob[] = [];
	#blobByBody = new Map<Body, Blob>();
	#onCollisionRef: ((e: IEventCollision<Engine>) => void) | null = null;
	#panel: Panel | null = null;
	#vw = 0;
	#vh = 0;
	#resizeQueued = false;
	#ro: ResizeObserver | null = null;
	#assetsReady = false;
	#msdfManifestUrl = "/assets/generated/manifest.json";
	#title: MsdfText | null = null;

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
	}

	async start(options?: {
		physics?: boolean;
		resolutionCap?: number;
		autoPauseOnBlur?: boolean;
		blobs?: { count: number; radius?: number; margin?: number };
	}) {
		if (this.#app) return;
		const app = new Application();
		const background = cssVarToPixiColor("--color-background");
		const resolutionCap = Math.max(1, options?.resolutionCap ?? 2);
		await app.init({
			canvas: this.#canvas,
			background,
			antialias: true,
			resolution: Math.min(window.devicePixelRatio || 1, resolutionCap),
			resizeTo: this.#canvas.parentElement ?? window,
		});
		this.#app = app;
		this.#vw = app.renderer.width;
		this.#vh = app.renderer.height;

		await this.#ensureAssets();

		if (options?.physics) {
			this.#enablePhysicsInternal();

			if (options.blobs) {
				this.resetBlobs(options.blobs.count, options.blobs);
			}
		}

		this.#ensureTitle("PORTFOLIO", {
			fontFamily: "Commissioner-Black",
			maxWidthRatio: 0.75,
			baseSize: 24,
		});

		// resize
		this.#ro?.disconnect();
		this.#ro = new ResizeObserver(() => {
			if (this.#resizeQueued) return;
			this.#resizeQueued = true;
			requestAnimationFrame(() => {
				this.#resizeQueued = false;
				this.#handleResize();
			});
		});
		this.#ro.observe(this.#canvas);
		window.addEventListener("resize", this.#onWindowResize, { passive: true });

		if (options?.autoPauseOnBlur) {
			document.addEventListener("visibilitychange", this.#onVisibilityChange, {
				passive: true,
			});
		}
	}

	setPanelElement(
		el: HTMLElement,
		opts?: {
			strength?: number;
			direction?: "outward" | "inward";
			falloff?: "linear" | "smoothstep";
			debug?: boolean;
			scrollSync?: boolean;
		},
	) {
		if (!this.#app) throw new Error("App not initialized");
		this.#panel?.dispose();
		this.#panel = new Panel(this.#app, el, opts);
	}

	addBlobs(count: number, options?: { radius?: number; margin?: number }) {
		const app = this.#app;
		const engine = this.#engine;
		if (!app || !engine) throw new Error("App or Engine is not initialized");
		const r = Math.max(2, options?.radius ?? 16);
		const margin = Math.max(r + 4, options?.margin ?? 48);
		const { width, height } = app.renderer;
		const xMin = margin;
		const yMin = margin;
		const xMax = width - margin;
		const yMax = height - margin;
		const color = cssVarToPixiColor("--color-foreground");
		for (let i = 0; i < count; i++) {
			const x = lerp(xMin, xMax, Math.random());
			const y = lerp(yMin, yMax, Math.random());
			const blob = new Blob({
				engine,
				stage: app.stage,
				x,
				y,
				radius: r,
				color,
				jelly: { frequency: 6, damping: 0.85, maxStretch: 0.18, maxSkew: 0.15 },
			});
			this.#blobs.push(blob);
			this.#blobByBody.set(blob.getBody(), blob);
		}
	}

	getViewportSize() {
		return { width: this.#vw, height: this.#vh };
	}

	/** Recolor all blobs from a CSS var (call on theme change). */
	setBlobsColorFromCssVar(varName = "--color-foreground") {
		const color = cssVarToPixiColor(varName);
		for (const b of this.#blobs) b.setColor(color);
	}

	resetBlobs(count: number, options?: { radius?: number; margin?: number }) {
		this.clearBlobs();
		this.addBlobs(count, options);
	}

	clearBlobs() {
		for (const blob of this.#blobs) blob.dispose();
		this.#blobs = [];
		this.#blobByBody.clear();
	}

	/** Expose the BitmapText for external animation (GSAP). */
	getTitleDisplay(): BitmapText | null {
		return this.#title ? this.#title.display : null;
	}

	/** Expose blob displays (Graphics/Sprite) for intro timeline. */
	getBlobDisplays() {
		const out = [];
		for (const b of this.#blobs) out.push(b.getDisplay());
		return out;
	}

	dispose() {
		window.removeEventListener("resize", this.#onWindowResize);
		document.removeEventListener("visibilitychange", this.#onVisibilityChange);

		if (this.#ro) {
			this.#ro.disconnect();
			this.#ro = null;
		}

		if (this.#engine && this.#onCollisionRef) {
			Events.off(this.#engine, "collisionStart", this.#onCollisionRef);
			this.#onCollisionRef = null;
		}

		this.#app?.destroy();
		this.#app = null;
		this.#engine = null;
		this.clearBlobs();
		this.#panel?.dispose();
		this.#panel = null;
		this.#title?.dispose();
		this.#title = null;
	}

	#enablePhysicsInternal() {
		const app = this.#app;
		if (!app) return;
		const { width, height } = app.renderer;
		const world = createWorld(width, height);
		this.#engine = world.engine;
		this.#walls = world.walls;

		const step = createFixedStepper(
			this.#engine,
			{
				stepMs: 1000 / 60,
				maxSubSteps: 5,
				maxDeltaMs: 250,
			},
			{
				beforeStep: () => {
					if (!this.#engine || !this.#panel) return;
					const bodies: Body[] = [];
					for (const b of this.#blobs) bodies.push(b.getBody());
					this.#panel.apply(bodies);
				},
			},
		);

		app.ticker.add((ticker) => {
			step(ticker.deltaMS);
			for (const blob of this.#blobs) blob.update(ticker.deltaMS);
		});

		// collisions → jelly
		const onCol = (e: IEventCollision<Engine>) => {
			for (const p of e.pairs) {
				const a = this.#blobByBody.get(p.bodyA);
				const b = this.#blobByBody.get(p.bodyB);
				const mag = this.#impactFromRelativeSpeed(p);
				if (a) a.onImpact(mag);
				if (b) b.onImpact(mag);
			}
		};
		this.#onCollisionRef = onCol;
		Events.on(this.#engine, "collisionStart", onCol);
	}

	#impactFromRelativeSpeed(pair: Pair): number {
		const dvx = pair.bodyA.velocity.x - pair.bodyB.velocity.x;
		const dvy = pair.bodyA.velocity.y - pair.bodyB.velocity.y;
		const rel = Math.hypot(dvx, dvy);
		const t = Math.min(1, rel / 12);
		return t * (2 - t);
	}

	#onWindowResize = () => {
		if (this.#resizeQueued) return;
		this.#resizeQueued = true;
		requestAnimationFrame(() => {
			this.#resizeQueued = false;
			this.#handleResize();
		});
	};

	#onVisibilityChange = () => {
		const app = this.#app;
		if (!app) return;
		if (document.hidden) {
			app.ticker.stop();
		} else {
			app.ticker.start();
		}
	};

	#handleResize() {
		const app = this.#app;
		if (!app || !this.#engine) return;
		const { width, height } = app.renderer;
		if (width <= 0 || height <= 0) return;

		// rebuild walls
		if (this.#walls) {
			this.#walls = rebuildWalls({
				engine: this.#engine,
				oldWalls: this.#walls,
				width,
				height,
				thickness: 50,
			});
		}

		// set new viewport size
		this.#vw = width;
		this.#vh = height;

		// refit le titre si présent
		if (this.#title) {
			this.#fitAndCenterTitle(this.#title, { maxWidthRatio: 0.8 });
		}
	}

	// ---------- MSDF helpers ----------
	async #ensureAssets(): Promise<void> {
		if (this.#assetsReady) return;
		await Assets.init({
			manifest: this.#msdfManifestUrl,
			basePath: "/assets/generated",
		});
		// Ton manifest a un bundle "default"
		await Assets.loadBundle(["default"]);
		this.#assetsReady = true;
	}

	#ensureTitle(
		text: string,
		opts?: { fontFamily?: string; maxWidthRatio?: number; baseSize?: number },
	) {
		const app = this.#app;
		if (!app) return;
		const color = cssVarToPixiColor("--color-foreground");
		const family = opts?.fontFamily ?? "Commissioner";
		const baseSize = opts?.baseSize ?? 96;
		// Crée une instance pour mesurer et afficher
		const label = new MsdfText({
			text,
			fontFamily: family,
			fontSize: baseSize,
			color,
		});
		label.addTo(app.stage);
		this.#title = label;
		this.#fitAndCenterTitle(label, {
			maxWidthRatio: opts?.maxWidthRatio ?? 0.8,
		});
	}

	#fitAndCenterTitle(label: MsdfText, opts: { maxWidthRatio: number }): void {
		const app = this.#app;
		if (!app) return;
		const target = Math.max(1, app.renderer.width * opts.maxWidthRatio);
		const currentW = Math.max(1, label.width);
		const currentSize = (label.display.style.fontSize as number) || 96;
		const newSize = fitFontSize(currentW, currentSize, target);
		label.setFontSize(newSize);
		label.display.position.set(
			app.renderer.width * 0.5,
			app.renderer.height * 0.25,
		);
	}
}
