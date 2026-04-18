import { Rive, type RiveParameters, type RiveResetParameters } from "@rive-app/webgl2";

type ManagedRiveOptions = Omit<RiveParameters, "canvas" | "src" | "onLoad"> & {
	canvas: HTMLCanvasElement;
	src: string;
	onLoad?: (rive: Rive) => void;
	resizeTarget?: Element | null;
	intersectionTarget?: Element | null;
	visibilityThreshold?: number;
	resetOnHidden?: boolean;
};

export function initManagedRive({
	canvas,
	src,
	onLoad,
	resizeTarget = canvas.parentElement,
	intersectionTarget = resizeTarget ?? canvas,
	visibilityThreshold = 0.05,
	resetOnHidden = false,
	...riveOptions
}: ManagedRiveOptions) {
	let frameId: number | null = null;
	let isReady = false;
	let isInViewport = !("IntersectionObserver" in window);
	let isDocumentVisible = document.visibilityState !== "hidden";
	let shouldResetOnNextVisible = resetOnHidden && !isInViewport;

	let rive!: Rive;

	const resetOptions: RiveResetParameters = {
		artboard: riveOptions.artboard,
		animations: riveOptions.animations,
		stateMachines: riveOptions.stateMachines,
		autoplay: true,
		autoBind: riveOptions.autoBind,
	};

	const queueResize = () => {
		if (!isReady || frameId !== null) return;

		frameId = window.requestAnimationFrame(() => {
			frameId = null;
			rive.resizeDrawingSurfaceToCanvas();
		});
	};

	const syncRendering = () => {
		if (!isReady) return;

		const shouldRender = isInViewport && isDocumentVisible;

		if (shouldRender) {
			rive.startRendering();

			if (shouldResetOnNextVisible) {
				rive.reset(resetOptions);
				shouldResetOnNextVisible = false;
			}

			rive.play();

			return;
		}

		rive.pause();
		rive.stopRendering();
	};

	rive = new Rive({
		...riveOptions,
		src,
		canvas,
		onLoad: () => {
			isReady = true;
			queueResize();
			onLoad?.(rive);
			syncRendering();
		},
	});

	const resizeObserver =
		"ResizeObserver" in window && resizeTarget
			? new ResizeObserver(() => {
					queueResize();
				})
			: null;

	if (resizeObserver && resizeTarget) {
		resizeObserver.observe(resizeTarget);
	}

	const intersectionObserver =
		"IntersectionObserver" in window && intersectionTarget
			? new IntersectionObserver(
					([entry]) => {
						const nextInViewport = (entry?.intersectionRatio ?? 0) >= visibilityThreshold;

						if (!nextInViewport && resetOnHidden) {
							shouldResetOnNextVisible = true;
						}

						isInViewport = nextInViewport;
						syncRendering();
					},
					{ threshold: visibilityThreshold },
				)
			: null;

	if (intersectionObserver && intersectionTarget) {
		intersectionObserver.observe(intersectionTarget);
	}

	const onVisibilityChange = () => {
		isDocumentVisible = document.visibilityState !== "hidden";
		syncRendering();
	};

	document.addEventListener("visibilitychange", onVisibilityChange);

	return () => {
		if (frameId !== null) {
			window.cancelAnimationFrame(frameId);
		}

		document.removeEventListener("visibilitychange", onVisibilityChange);
		resizeObserver?.disconnect();
		intersectionObserver?.disconnect();
		rive.cleanup();
	};
}
