import { Application } from "pixi.js";

export class Scene {
	#app: Application | null = null;
	#canvas: HTMLCanvasElement;

	constructor(canvas: HTMLCanvasElement) {
		this.#canvas = canvas;
	}

	async init() {
		const app = new Application();
		await app.init({
			canvas: this.#canvas,
			background: "red",
			antialias: true,
			resolution: window.devicePixelRatio || 1,
			resizeTo: this.#canvas.parentElement ?? window,
		});

		this.#app = app;
	}

	destroy() {
		this.#app?.destroy();
		this.#app = null;
	}
}
