// FILE: src/components/ripple-text/ripples.ts
export type RippleConfig = {
	maxRipples: number;
	amplitude: number;
	frequency: number;
	speed: number;
	maxRadius: number;
	idleIntervalSec: number;
	dragMinDistancePx: number;
};

export type RippleInstance = {
	centerPx: { x: number; y: number };
	startTimeSec: number;
	amplitude: number;
	frequency: number;
};

export class RippleSystem {
	#config: RippleConfig;
	#ripples: RippleInstance[] = [];
	#timeSinceLastSpawn = 0;
	#lastDragPos: { x: number; y: number } | null = null;

	constructor(config: RippleConfig) {
		this.#config = config;
	}

	update(dtSec: number, timeSec: number, canvasSize: { width: number; height: number }): void {
		this.#timeSinceLastSpawn += dtSec;

		// Idle ripple from center
		if (this.#timeSinceLastSpawn >= this.#config.idleIntervalSec) {
			this.#spawnCenter(timeSec, canvasSize);
			this.#timeSinceLastSpawn = 0;
		}

		// Cleanup old ripples by age vs radius/speed
		const maxAge = this.#config.maxRadius / Math.max(this.#config.speed, 0.0001) + 1;
		this.#ripples = this.#ripples.filter((r) => timeSec - r.startTimeSec <= maxAge);
	}

	spawnAt(positionPx: { x: number; y: number }, timeSec: number): void {
		const ripple: RippleInstance = {
			centerPx: { x: positionPx.x, y: positionPx.y },
			startTimeSec: timeSec,
			amplitude: this.#config.amplitude,
			frequency: this.#config.frequency,
		};
		this.#pushRipple(ripple);
		this.#timeSinceLastSpawn = 0;
		this.#lastDragPos = { x: positionPx.x, y: positionPx.y };
	}

	spawnDrag(positionPx: { x: number; y: number }, timeSec: number): void {
		if (!this.#lastDragPos) {
			this.spawnAt(positionPx, timeSec);
			return;
		}
		const dx = positionPx.x - this.#lastDragPos.x;
		const dy = positionPx.y - this.#lastDragPos.y;
		const distSq = dx * dx + dy * dy;
		const minDistSq = this.#config.dragMinDistancePx * this.#config.dragMinDistancePx;
		if (distSq >= minDistSq) {
			this.spawnAt(positionPx, timeSec);
		}
	}

	resetDrag(): void {
		this.#lastDragPos = null;
	}

	getRipples(): RippleInstance[] {
		return this.#ripples;
	}

	getConfig(): RippleConfig {
		return this.#config;
	}

	setConfig(config: Partial<RippleConfig>): void {
		this.#config = { ...this.#config, ...config };
	}

	#spawnCenter(timeSec: number, canvasSize: { width: number; height: number }): void {
		const center: { x: number; y: number } = {
			x: canvasSize.width * 0.5,
			y: canvasSize.height * 0.5,
		};
		this.spawnAt(center, timeSec);
	}

	#pushRipple(ripple: RippleInstance): void {
		this.#ripples.push(ripple);
		if (this.#ripples.length > this.#config.maxRipples) {
			this.#ripples.splice(0, this.#ripples.length - this.#config.maxRipples);
		}
	}
}
