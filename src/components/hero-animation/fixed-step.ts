import type { Engine } from "matter-js";
import { Engine as MatterEngine } from "matter-js";

export type FixedStepOptions = {
	stepMs: number;
	maxSubSteps: number;
};

export type Stepper = (dtMs: number) => void;

export type FixedStepHooks = {
	/** called before each step */
	beforeStep?: (engine: Engine) => void;
};

export function createFixedStepper(
	engine: Engine,
	options: FixedStepOptions,
	hooks?: FixedStepHooks,
): Stepper {
	let accumulator = 0;
	function step(dtMs: number) {
		const stepMs = options.stepMs;
		accumulator += dtMs;
		let steps = 0;
		while (accumulator >= options.stepMs && steps < options.maxSubSteps) {
			if (hooks?.beforeStep) hooks.beforeStep(engine);
			MatterEngine.update(engine, stepMs);
			accumulator -= stepMs;
			steps++;
		}
		if (steps === options.maxSubSteps) {
			// drop remainder to keep the simulation stable under heavy frames.
			accumulator = 0;
		}
	}
	return step;
}
