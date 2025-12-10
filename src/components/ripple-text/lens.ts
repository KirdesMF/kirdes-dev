// FILE: src/components/ripple-text/lens.ts
export type RippleLensUniforms = {
	centerPx: { x: number; y: number };
	radiusPx: number;
	featherPx: number;
};

export type RippleLensOptions = {
	canvas: HTMLCanvasElement;
	followLerp: number;
};

export class RippleLens {
	#canvas: HTMLCanvasElement;
	#followLerp: number;

	#centerCurrent = { x: 0, y: 0 };
	#centerTarget = { x: 0, y: 0 };

	#radiusPx: number;
	#featherPx: number;
	#enabled = false;

	#onPointerMoveBound: (event: PointerEvent) => void;

	constructor({ canvas, followLerp }: RippleLensOptions) {
		this.#canvas = canvas;
		this.#followLerp = followLerp;

		const { radiusPx, featherPx } = RippleLens.#readCssRadius();
		this.#radiusPx = radiusPx;
		this.#featherPx = featherPx;

		this.#onPointerMoveBound = (event: PointerEvent) => {
			this.#onPointerMove(event);
		};

		this.#canvas.addEventListener("pointermove", this.#onPointerMoveBound);
	}

	static #readCssRadius(): { radiusPx: number; featherPx: number } {
		if (typeof document === "undefined") {
			return { radiusPx: 200, featherPx: 50 };
		}

		const root = document.documentElement;
		const style = getComputedStyle(root);
		const raw = style.getPropertyValue("--lens-radius").trim();
		const numeric = parseFloat(raw);
		const radiusPx = Number.isFinite(numeric) ? numeric : 200;

		const featherPx = Math.min(radiusPx * 0.1, 4);

		return { radiusPx, featherPx };
	}

	#onPointerMove(event: PointerEvent): void {
		const rect = this.#canvas.getBoundingClientRect();
		const clientWidth = this.#canvas.clientWidth;
		const dpr = clientWidth > 0 ? this.#canvas.width / clientWidth : 1;

		const x = (event.clientX - rect.left) * dpr;
		const y = (event.clientY - rect.top) * dpr;

		this.#centerTarget.x = x;
		this.#centerTarget.y = y;

		if (!this.#enabled) {
			this.#enabled = true;
			this.#centerCurrent.x = x;
			this.#centerCurrent.y = y;
		}
	}

	update(): void {
		const { radiusPx, featherPx } = RippleLens.#readCssRadius();
		this.#radiusPx = radiusPx;
		this.#featherPx = featherPx;

		if (!this.#enabled) return;

		const k = this.#followLerp;
		this.#centerCurrent.x += (this.#centerTarget.x - this.#centerCurrent.x) * k;
		this.#centerCurrent.y += (this.#centerTarget.y - this.#centerCurrent.y) * k;
	}

	getUniforms(): RippleLensUniforms {
		if (!this.#enabled) {
			return {
				centerPx: { x: -1000, y: -1000 },
				radiusPx: 0,
				featherPx: 0,
			};
		}

		const height = this.#canvas.height;
		const flippedY = height - this.#centerCurrent.y;

		return {
			centerPx: {
				x: this.#centerCurrent.x,
				y: flippedY,
			},
			radiusPx: this.#radiusPx,
			featherPx: this.#featherPx,
		};
	}

	dispose(): void {
		this.#canvas.removeEventListener("pointermove", this.#onPointerMoveBound);
	}
}
