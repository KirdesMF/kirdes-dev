export type TextPack = {
	font: {
		unitsPerEm: number;
		sizeRefPx: number;
		pxRange: number;
		ascenderPx: number;
		descenderPx: number;
		lineHeightPx: number;
	};
	atlas: {
		image: string; // URL publique vers l’atlas PNG (ex: /assets/msdf/fonts/commissioner-800-0.png)
		width: number;
		height: number;
		chars: Record<
			string,
			{
				x: number;
				y: number;
				w: number;
				h: number;
				uv: { u0: number; v0: number; u1: number; v1: number };
				xoffset: number;
				yoffset: number;
				xadvance: number;
			}
		>;
	};
	kern: Record<string, number>;
	words: Array<{
		text: string;
		baseline: number;
		runs: Array<{ char: string; x: number; y: number }>;
		bounds: { x: number; y: number; w: number; h: number };
	}>;
	contours: Record<
		string,
		{
			contours: Array<{ points: Array<{ x: number; y: number; on: boolean }> }>;
			polylines: number[][];
		}
	>;
};

export async function loadTextPack(url = "/assets/packs/text-pack.json") {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`Failed to load text pack: ${res.status} ${res.statusText}`,
		);
	}

	const pack = (await res.json()) as TextPack;
	// Sanity checks mini
	if (!pack?.atlas?.image) {
		throw new Error("text-pack.json missing atlas.image");
	}

	if (!pack?.atlas?.chars) {
		throw new Error("text-pack.json missing atlas.chars");
	}

	return pack;
}

// Optionnel : si tu veux déjà créer un <img> utilisable (ex. pour Canvas2D)
export async function loadAtlasImage(src: string): Promise<HTMLImageElement> {
	const img = new Image();
	img.decoding = "async";
	img.loading = "eager"; // on veut le plus vite possible
	img.crossOrigin = "anonymous";
	const done = new Promise<HTMLImageElement>((resolve, reject) => {
		img.onload = () => resolve(img);
		img.onerror = () => reject(new Error(`Failed to load atlas image: ${src}`));
	});
	img.src = src;
	return done;
}

// Si tu veux créer directement une texture WebGL
export async function loadAtlasTexture(gl: WebGLRenderingContext, src: string) {
	const img = await loadAtlasImage(src);
	const tex = gl.createTexture();
	if (!tex) throw new Error("gl.createTexture() failed");
	gl.bindTexture(gl.TEXTURE_2D, tex);
	// Pas de flip Y ici pour MSDF en screen-space (on pilotera via UV du pack si besoin)
	gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

	// MSDF → LINEAR + CLAMP
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

	gl.bindTexture(gl.TEXTURE_2D, null);
	return { texture: tex, width: img.naturalWidth, height: img.naturalHeight };
}
