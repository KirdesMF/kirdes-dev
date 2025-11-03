import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { WaveScene } from "./wave-scene";

type WaveScrollControllerArgs = {
	scene: WaveScene;
	canvas: HTMLCanvasElement;
	sections?: Iterable<HTMLElement>;
	selector?: string;
	slideDistanceMultiplier?: number;
	minSlideDistance?: number;
};

/**
 * Sets up ScrollTrigger hooks to animate wave text content based on the active section.
 * Returns a teardown function that removes listeners, kills triggers, and cancels ongoing tweens.
 */
export function setupWaveSectionController(args: WaveScrollControllerArgs) {
	const {
		scene,
		canvas,
		sections,
		selector = "[data-wave-text]",
		slideDistanceMultiplier = 2.5,
		minSlideDistance = 1400,
	} = args;

	const sectionList = sections
		? Array.from(sections)
		: Array.from(document.querySelectorAll<HTMLElement>(selector));

	if (!sectionList.length) {
		return;
	}

	const triggers: ScrollTrigger[] = [];

	const offsets = scene.getTextOffsets();
	const applyOffsets = () => scene.setTextOffsets(offsets);

	const getSlideDistance = () => {
		const rect = canvas.getBoundingClientRect();
		const width =
			rect.width ||
			canvas.width ||
			window.innerWidth ||
			document.documentElement?.clientWidth ||
			0;
		return Math.max(width * slideDistanceMultiplier, minSlideDistance);
	};

	const hiddenOffsets = () => {
		const distance = getSlideDistance();
		return { top: -distance, bottom: distance };
	};

	let currentSection: HTMLElement | null = null;
	let currentText = "";
	let activeTween: gsap.core.Tween | gsap.core.Timeline | null = null;

	const ensureHidden = () => {
		const hidden = hiddenOffsets();
		offsets.top = hidden.top;
		offsets.bottom = hidden.bottom;
		applyOffsets();
	};

	ensureHidden();

	const showSection = (section: HTMLElement) => {
		const text = section.dataset.waveText?.trim() ?? "";
		if (!text) return;

		const hidden = hiddenOffsets();
		const alreadyVisible =
			currentSection === section &&
			currentText === text &&
			Math.abs(offsets.top) < 1 &&
			Math.abs(offsets.bottom) < 1 &&
			!activeTween;

		if (alreadyVisible) {
			return;
		}

		currentSection = section;
		activeTween?.kill();

		const timeline = gsap.timeline({
			defaults: {
				onUpdate: applyOffsets,
			},
		});

		const needsHide =
			Math.abs(offsets.top - hidden.top) > 0.5 ||
			Math.abs(offsets.bottom - hidden.bottom) > 0.5;

		if (needsHide) {
			timeline.to(offsets, {
				top: hidden.top,
				bottom: hidden.bottom,
				duration: 0.85,
				ease: "power3.in",
			});
		} else {
			timeline.set(offsets, hidden);
		}

		timeline.add(() => {
			scene.setTextContent(text);
			currentText = text;
			applyOffsets();
		});

		timeline.to(offsets, {
			top: 0,
			bottom: 0,
			duration: 1.5,
			ease: "elastic.out(0.5, 0.8)",
		});

		timeline.call(() => {
			activeTween = null;
		});

		timeline.play(0);
		activeTween = timeline;
	};

	const hideSection = () => {
		if (!currentSection && !currentText) {
			return;
		}
		const hidden = hiddenOffsets();
		activeTween?.kill();
		activeTween = gsap.to(offsets, {
			top: hidden.top,
			bottom: hidden.bottom,
			duration: 0.85,
			ease: "power3.in",
			onUpdate: applyOffsets,
			onComplete: () => {
				currentSection = null;
				currentText = "";
				activeTween = null;
			},
		});
	};

	sectionList.forEach((section) => {
		const trigger = ScrollTrigger.create({
			trigger: section,
			start: "top center",
			end: "bottom center",
			onEnter: () => showSection(section),
			onEnterBack: () => showSection(section),
			onLeave: () => {
				if (currentSection === section) {
					hideSection();
				}
			},
			onLeaveBack: () => {
				if (currentSection === section) {
					hideSection();
				}
			},
		});

		triggers.push(trigger);
	});

	const handleResize = () => {
		ScrollTrigger.refresh();
		if (currentSection) {
			const text = currentSection.dataset.waveText?.trim() ?? "";
			scene.setTextContent(text);
			applyOffsets();
		} else {
			ensureHidden();
		}
	};

	window.addEventListener("resize", handleResize);

	return () => {
		triggers.forEach((trigger) => {
			trigger.kill();
		});
		window.removeEventListener("resize", handleResize);
		activeTween?.kill();
	};
}
