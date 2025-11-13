export type JellyParams = {
	frequency: number; // Hz
	damping: number; // 0...1
	maxStretch: number; // e.g 0.25 => ±25%
	maxSkew: number; // radians (e.g. O.2)
};

export type JellyOutput = {
	sx: number;
	sy: number;
	skewY: number;
};

function clamp(value: number, min: number, max: number): number {
	return value < min ? min : value > max ? max : value;
}

export class JellyDeformer {
	#params: JellyParams;
	#s = 0; // displacement
	#v = 0; // velocity

	constructor(params: JellyParams) {
		this.#params = params;
	}

	/** Trigger an impulse (normalized -1..1). */
	hit(magnitude: number): void {
		const m = clamp(magnitude, -1, 1);
		const w = 2 * Math.PI * this.#params.frequency;
		this.#v += m * this.#params.maxStretch * w;
	}

	/** Advance by dtMs and return target scales/skew. */
	update(dtMs: number): JellyOutput {
		const dt = dtMs / 1000;
		const w = 2 * Math.PI * this.#params.frequency;
		const z = this.#params.damping;
		// s'' + 2ζω s' + ω² s = 0
		const a = -2 * z * w * this.#v - w * w * this.#s;
		this.#v += a * dt;
		this.#s += this.#v * dt;
		// clamp displacement softly
		this.#s = clamp(this.#s, -this.#params.maxStretch, this.#params.maxStretch);
		const sx = 1 + this.#s;
		const sy = 1 / sx; // ~conservation d’aire
		const skewY = clamp(this.#v / w, -1, 1) * this.#params.maxSkew;
		return { sx, sy, skewY };
	}
}
