// FILE: hero-animation/fixed-step.ts
import type { Engine } from "matter-js";
import { Engine as MatterEngine } from "matter-js";

export type FixedStepOptions = {
	stepMs: number;
	maxSubSteps: number;
	/** Clamp max frame delta in ms (default: stepMs * maxSubSteps). */
	maxDeltaMs?: number;
};

export type FixedStepHooks = {
	beforeStep?: () => void;
	afterStep?: () => void;
};

export type Stepper = (dtMs: number) => void;

export function createFixedStepper(
	engine: Engine,
	options: FixedStepOptions,
	hooks?: FixedStepHooks,
): Stepper {
	let accumulator = 0;
	const stepMs = options.stepMs;
	const maxSub = options.maxSubSteps;
	const maxDelta = options.maxDeltaMs ?? stepMs * maxSub;

	function step(dtMs: number): void {
		const clamped = Math.min(Math.max(0, dtMs), maxDelta);
		accumulator += clamped;
		let steps = 0;
		hooks?.beforeStep?.();
		while (accumulator >= stepMs && steps < maxSub) {
			MatterEngine.update(engine, stepMs);
			accumulator -= stepMs;
			steps++;
		}
		if (steps === maxSub) {
			// drop remainder to keep the simulation stable under heavy frames.
			accumulator = 0;
		}
		hooks?.afterStep?.();
	}
	return step;
}
