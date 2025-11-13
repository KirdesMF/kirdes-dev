import {
	type Body,
	type Engine,
	Events,
	type IEventCollision,
	type Pair,
} from "matter-js";
import { Application } from "pixi.js";
import { cssVarToPixiColor } from "../../utils/css-color";
import { lerp } from "./_utils";
import { Blob } from "./blob";
import { createFixedStepper } from "./fixed-step";
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

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
	}

	async start(options?: {
		physics?: boolean;
		blobs?: { count: number; radius?: number; margin?: number };
	}) {
		if (this.#app) return;
		const app = new Application();
		const background = cssVarToPixiColor("--color-background");
		await app.init({
			canvas: this.#canvas,
			background,
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			resizeTo: this.#canvas.parentElement ?? window,
		});
		this.#app = app;
		this.#vw = app.renderer.width;
		this.#vh = app.renderer.height;

		if (options?.physics) {
			this.#enablePhysicsInternal();

			if (options.blobs) {
				this.resetBlobs(options.blobs.count, options.blobs);
			}
		}

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
	): void {
		if (!this.#app) throw new Error("App not initialized");
		this.#panel?.dispose();
		this.#panel = new Panel(this.#app, el, opts);
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

	#onWindowResize = () => {
		if (this.#resizeQueued) return;
		this.#resizeQueued = true;
		requestAnimationFrame(() => {
			this.#resizeQueued = false;
			this.#handleResize();
		});
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
	}

	get viewportSize() {
		return { width: this.#vw, height: this.#vh };
	}

	dispose() {
		window.removeEventListener("resize", this.#onWindowResize);

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
	}
}
