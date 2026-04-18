import { Container, Graphics, type Rectangle } from "pixi.js";

export type CreateStageOptions = {
	worldBounds: Rectangle;
	backgroundColor: number;
};

export type Stage = {
	world: Container;
	backdrop: Graphics;
	worldBounds: Rectangle;
	setBackgroundColor: (color: number) => void;
};

/**
 * Creates the stage container with backdrop.
 */
export function createStage({ worldBounds, backgroundColor }: CreateStageOptions): Stage {
	const world = new Container();
	const backdrop = new Graphics();

	const drawBackdrop = () => {
		backdrop.clear().rect(0, 0, worldBounds.width, worldBounds.height).fill({ color: backgroundColor });
	};

	drawBackdrop();

	world.addChild(backdrop);

	return {
		world,
		backdrop,
		worldBounds,
		setBackgroundColor: (color: number) => {
			backdrop.clear().rect(0, 0, worldBounds.width, worldBounds.height).fill({ color });
		},
	};
}
