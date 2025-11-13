import type { Body, Engine } from "matter-js";
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
			for (const blob of this.#blobs) blob.update();
		});
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
			});
			this.#blobs.push(blob);
		}
	}

	resetBlobs(count: number, options?: { radius?: number; margin?: number }) {
		this.clearBlobs();
		this.addBlobs(count, options);
	}

	clearBlobs() {
		for (const blob of this.#blobs) blob.dispose();
		this.#blobs = [];
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
		this.#app?.destroy();
		this.#app = null;
		this.#engine = null;
		this.clearBlobs();
	}
}
