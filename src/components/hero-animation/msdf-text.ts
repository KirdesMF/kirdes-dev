import type { Container } from "pixi.js";
import { BitmapText } from "pixi.js";

export type MsdfTextParams = {
	text: string;
	fontFamily: string;
	fontSize: number;
	color: number; // 0xRRGGBB
};

export class MsdfText {
	#bt: BitmapText;

	constructor(params: MsdfTextParams) {
		this.#bt = new BitmapText({
			text: params.text,
			style: {
				fontFamily: params.fontFamily,
				fontSize: params.fontSize,
			},
		});
		this.#bt.tint = params.color;

		// Pivot au centre pour faciliter le positionnement et le “fit”.
		this.#centerPivot();
	}

	addTo(stage: Container): void {
		stage.addChild(this.#bt);
	}

	setText(text: string): void {
		this.#bt.text = text;
		this.#centerPivot();
	}

	setColor(color: number): void {
		this.#bt.tint = color;
	}

	setFontSize(size: number): void {
		this.#bt.style.fontSize = size;
		this.#centerPivot();
	}

	get display(): BitmapText {
		return this.#bt;
	}

	get width(): number {
		return this.#bt.width;
	}
	get height(): number {
		return this.#bt.height;
	}

	dispose(): void {
		this.#bt.destroy();
	}

	#centerPivot(): void {
		// BitmapText calcule width/height après maj du style/texte.
		const w = this.#bt.width;
		const h = this.#bt.height;
		this.#bt.pivot.set(w * 0.5, h * 0.5);
	}
}

/** Calcule une taille de police qui “fit” la largeur cible (approx. linéaire). */
export function fitFontSize(
	baseTextWidth: number,
	baseFontSize: number,
	targetWidth: number,
): number {
	if (baseTextWidth <= 0 || baseFontSize <= 0) return baseFontSize;
	const ratio = targetWidth / baseTextWidth;
	return Math.max(1, baseFontSize * ratio);
}
