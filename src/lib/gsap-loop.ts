import gsap from "gsap";

interface HorizontalLoopConfig {
	speed?: number;
	paused?: boolean;
	repeat?: number;
	reversed?: boolean;
	snap?: number | false;
	paddingRight?: number | string;
}

interface HorizontalLoopTimeline extends gsap.core.Timeline {
	next(vars?: gsap.TweenVars): gsap.core.Tween;
	previous(vars?: gsap.TweenVars): gsap.core.Tween;
	toIndex(index: number, vars?: gsap.TweenVars): gsap.core.Tween;
	current(): number;
	times: number[];
}

/*
This helper function makes a group of elements animate along the x-axis in a seamless, responsive loop.

Features:
- Uses xPercent so that even if the widths change (like if the window gets resized), it should still work in most cases.
- When each item animates to the left or right enough, it will loop back to the other side
- Optionally pass in a config object with values like "speed" (default: 1, which travels at roughly 100 pixels per second), paused (boolean),  repeat, reversed, and paddingRight.
- The returned timeline will have the following methods added to it:
- next() - animates to the next element using a timeline.tweenTo() which it returns. You can pass in a vars object to control duration, easing, etc.
- previous() - animates to the previous element using a timeline.tweenTo() which it returns. You can pass in a vars object to control duration, easing, etc.
- toIndex() - pass in a zero-based index value of the element that it should animate to, and optionally pass in a vars object to control duration, easing, etc. Always goes in the shortest direction
- current() - returns the current index (if an animation is in-progress, it reflects the final index)
- times - an Array of the times on the timeline where each element hits the "starting" spot. There's also a label added accordingly, so "label1" is when the 2nd element reaches the start.
*/
export function horizontalLoop(
	items: ArrayLike<Element>,
	config?: HorizontalLoopConfig,
): HorizontalLoopTimeline {
	const itemsArray = gsap.utils.toArray(items) as HTMLElement[];
	const cfg = config || {};

	const tl = gsap.timeline({
		repeat: cfg.repeat,
		paused: cfg.paused,
		defaults: { ease: "none" },
		onReverseComplete: () => {
			tl.totalTime(tl.rawTime() + tl.duration() * 100);
		},
	}) as HorizontalLoopTimeline;

	const length = itemsArray.length;
	const startX = (itemsArray[0] as HTMLElement).offsetLeft;
	const times: number[] = [];
	const widths: number[] = [];
	const xPercents: number[] = [];
	let curIndex = 0;
	const pixelsPerSecond = (cfg.speed || 1) * 100;
	const snap: (v: number) => number =
		cfg.snap === false ? (v: number) => v : gsap.utils.snap(cfg.snap || 1);

	let totalWidth: number;
	let curX: number;
	let distanceToStart: number;
	let distanceToLoop: number;
	let item: HTMLElement;

	gsap.set(itemsArray, {
		xPercent: (i: number, el: Element) => {
			const w = parseFloat(gsap.getProperty(el, "width", "px") as string);
			widths[i] = w;
			xPercents[i] = snap(
				((parseFloat(gsap.getProperty(el, "x", "px") as string) / w) * 100 +
					(gsap.getProperty(el, "xPercent") as number)) as number,
			);
			return xPercents[i];
		},
	});

	gsap.set(itemsArray, { x: 0 });

	totalWidth =
		(itemsArray[length - 1] as HTMLElement).offsetLeft +
		(xPercents[length - 1] / 100) * widths[length - 1] -
		startX +
		(itemsArray[length - 1] as HTMLElement).offsetWidth *
			(gsap.getProperty(itemsArray[length - 1], "scaleX") as number) +
		(parseFloat(cfg.paddingRight as string) || 0);

	for (let i = 0; i < length; i++) {
		item = itemsArray[i] as HTMLElement;
		curX = (xPercents[i] / 100) * widths[i];
		distanceToStart = item.offsetLeft + curX - startX;
		distanceToLoop =
			distanceToStart +
			widths[i] * (gsap.getProperty(item, "scaleX") as number);

		tl.to(
			item,
			{
				xPercent: snap(((curX - distanceToLoop) / widths[i]) * 100),
				duration: distanceToLoop / pixelsPerSecond,
			},
			0,
		)
			.fromTo(
				item,
				{
					xPercent: snap(
						((curX - distanceToLoop + totalWidth) / widths[i]) * 100,
					),
				},
				{
					xPercent: xPercents[i],
					duration:
						(curX - distanceToLoop + totalWidth - curX) / pixelsPerSecond,
					immediateRender: false,
				},
				distanceToLoop / pixelsPerSecond,
			)
			.add(`label${i}`, distanceToStart / pixelsPerSecond);

		times[i] = distanceToStart / pixelsPerSecond;
	}

	function toIndex(index: number, vars?: gsap.TweenVars): gsap.core.Tween {
		const v = vars || {};
		if (Math.abs(index - curIndex) > length / 2) {
			index += index > curIndex ? -length : length;
		}

		const newIndex = gsap.utils.wrap(0, length, index);
		let time = times[newIndex];

		if (time > tl.time() !== index > curIndex) {
			v.modifiers = { time: gsap.utils.wrap(0, tl.duration()) };
			time += tl.duration() * (index > curIndex ? 1 : -1);
		}

		curIndex = newIndex;
		v.overwrite = true;
		return tl.tweenTo(time, v);
	}

	tl.next = (vars?: gsap.TweenVars) => toIndex(curIndex + 1, vars);
	tl.previous = (vars?: gsap.TweenVars) => toIndex(curIndex - 1, vars);
	tl.current = () => curIndex;
	tl.toIndex = (index: number, vars?: gsap.TweenVars) => toIndex(index, vars);
	tl.times = times;

	tl.progress(1, true).progress(0, true);

	if (cfg.reversed) {
		tl.vars.onReverseComplete?.();
		tl.reverse();
	}

	return tl;
}
