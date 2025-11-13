import { Bodies, type Body, type Engine, World } from "matter-js";
import { type Container, Graphics } from "pixi.js";

export type BlobParams = {
	engine: Engine;
	stage: Container;
	x: number;
	y: number;
	radius: number;
	color?: string;
	physics?: {
		restitution?: number;
		friction?: number;
		frictionAir?: number;
		density?: number;
		isStatic?: boolean;
	};
};

export class Blob {
	#engine: Engine;
	#body: Body;
	#gfx: Graphics;
	#radius: number;

	constructor(params: BlobParams) {
		this.#engine = params.engine;
		this.#radius = params.radius;
		this.#body = Bodies.circle(params.x, params.y, params.radius, {
			restitution: params.physics?.restitution ?? 0.8,
			friction: params.physics?.friction ?? 0.05,
			frictionAir: params.physics?.frictionAir ?? 0.01,
			density: params.physics?.density ?? 0.001,
			isStatic: params.physics?.isStatic ?? false,
		});
		World.add(this.#engine.world, this.#body);

		const g = new Graphics();
		g.circle(0, 0, params.radius).fill(params.color ?? 0xffffff);
		params.stage.addChild(g);
		this.#gfx = g;
	}

	update() {
		this.#gfx.x = this.#body.position.x;
		this.#gfx.y = this.#body.position.y;
		this.#gfx.rotation = this.#body.angle;
	}

	dispose() {
		World.remove(this.#engine.world, this.#body);
		this.#gfx.destroy();
	}

	getBody() {
		return this.#body;
	}

	getRadius() {
		return this.#radius;
	}
}
