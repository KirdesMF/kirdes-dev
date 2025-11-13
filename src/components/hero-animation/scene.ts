import {
	type Body,
	type Engine,
	Events,
	type IEventCollision,
} from "matter-js";
import { Application } from "pixi.js";
import { lerp } from "./_utils";
import { Blob } from "./blob";
import { createFixedStepper } from "./fixed-step";
import { createWorld, rebuildWalls } from "./world";

export class Scene {
	#app: Application | null = null;
	#canvas: HTMLCanvasElement;
	#engine: Engine | null = null;
	#walls: Body[] | null = null;
	#blobs: Blob[] = [];
	#blobByBody = new Map<Body, Blob>();
	#onCollisionRef: ((e: IEventCollision<Engine>) => void) | null = null;
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
		await app.init({
			canvas: this.#canvas,
			background: "red",
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

	#enablePhysicsInternal() {
		const app = this.#app;
		if (!app) return;
		const { width, height } = app.renderer;
		const world = createWorld(width, height);
		this.#engine = world.engine;
		this.#walls = world.walls;

		const step = createFixedStepper(this.#engine, {
			stepMs: 1000 / 60,
			maxSubSteps: 5,
		});

		app.ticker.add((ticker) => {
			step(ticker.deltaMS);
			for (const blob of this.#blobs) blob.update(ticker.deltaMS);
		});

		// collisions → jelly
		const onCol = (e: IEventCollision<Engine>) => {
			for (const p of e.pairs) {
				const a = this.#blobByBody.get(p.bodyA);
				const b = this.#blobByBody.get(p.bodyB);
				if (a) a.onImpact(this.#impact01(p.bodyA));
				if (b) b.onImpact(this.#impact01(p.bodyB));
			}
		};
		this.#onCollisionRef = onCol;
		Events.on(this.#engine, "collisionStart", onCol);
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
		for (let i = 0; i < count; i++) {
			const x = lerp(xMin, xMax, Math.random());
			const y = lerp(yMin, yMax, Math.random());
			const blob = new Blob({
				engine,
				stage: app.stage,
				x,
				y,
				radius: r,
				color: "0xffffff",
				jelly: { frequency: 6, damping: 0.85, maxStretch: 0.18, maxSkew: 0.15 },
			});
			this.#blobs.push(blob);
			this.#blobByBody.set(blob.getBody(), blob);
		}
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

	// Estimate normalized impact from a body speed (0..1).
	#impact01(body: Body): number {
		// Typical speed peaks ~10–20 in notre scène; clamp for stability
		const m = Math.min(1, body.speed / 12);
		// ease-out a bit
		return m * (2 - m);
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
	}
}
