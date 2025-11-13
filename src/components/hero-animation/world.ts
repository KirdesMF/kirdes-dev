import { Bodies, type Body, Composite, Engine, World } from "matter-js";

export type WorldSetup = {
	engine: Engine;
	walls: Body[];
};

/**
 * Creates walls for the Matter.js world.
 * @param width The width of the world.
 * @param height
 * @param thickness
 * @returns
 */
function createWalls(width: number, height: number, thickness: number): Body[] {
	return [
		Bodies.rectangle(width / 2, -thickness / 2, width, thickness, {
			isStatic: true,
		}),
		Bodies.rectangle(width / 2, height + thickness / 2, width, thickness, {
			isStatic: true,
		}),
		Bodies.rectangle(-thickness / 2, height / 2, thickness, height, {
			isStatic: true,
		}),
		Bodies.rectangle(width + thickness / 2, height / 2, thickness, height, {
			isStatic: true,
		}),
	];
}

/**
 * Creates a new Matter.js world with a ball and four walls.
 * @param width The width of the world.
 * @param height The height of the world.
 * @returns The setup of the world.
 */
export function createWorld(width: number, height: number): WorldSetup {
	const engine: Engine = Engine.create();
	const thickness = 50;
	const walls: Body[] = createWalls(width, height, thickness);

	World.add(engine.world, walls);
	return { engine, walls };
}

/**
 * Rebuilds the walls of the world to match the new dimensions.
 * @param args
 * @returns The updated walls.
 */
export function rebuildWalls(args: {
	engine: Engine;
	width: number;
	height: number;
	thickness: number;
	oldWalls: Body[];
}) {
	const { engine, width, height, thickness = 50, oldWalls } = args;
	for (const wall of oldWalls) {
		World.remove(engine.world, wall);
	}
	const newWalls = createWalls(width, height, thickness);
	World.add(engine.world, newWalls);
	return newWalls;
}

/**
 * Removes all bodies from the world.
 * @param engine
 */
export function clearWorld(engine: Engine) {
	const bodies = Composite.allBodies(engine.world);
	for (const b of bodies) {
		World.remove(engine.world, b);
	}
}
