// FILE: plugins/msdf-plugin.ts
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import generateBMFont from "msdf-bmfont-xml";
import type { Plugin } from "vite";

export interface MSDFFontConfig {
	/** Chemin vers le fichier .ttf (relatif à la racine du projet) */
	input: string;
	/** Nom de sortie (sans extension) */
	outputName: string;
	/** Taille du glyphe en pixels */
	fontSize?: number;
	/** Taille de la texture [width, height] */
	textureSize?: [number, number];
	/** Distance range pour MSDF (généralement 4) */
	distanceRange?: number;
	/** Caractères à inclure (par défaut: tous) */
	charset?: string;
	/** Type de field: 'msdf' | 'sdf' | 'psdf' */
	fieldType?: "msdf" | "sdf" | "psdf";
}

export interface MSDFPluginOptions {
	/** Liste des fonts à générer */
	fonts: MSDFFontConfig[];
	/** Dossier de sortie (relatif à public/ pour les PNG, relatif à src/ pour les JSON) */
	outputDir?: string;
	/** Générer les types TypeScript */
	generateTypes?: boolean;
	/** Activer les logs détaillés */
	verbose?: boolean;
	/** Forcer la régénération (ignore le cache) */
	force?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<MSDFFontConfig, "input" | "outputName">> = {
	fontSize: 64,
	textureSize: [1024, 1024],
	distanceRange: 4,
	charset: "",
	fieldType: "msdf",
};

interface CacheEntry {
	hash: string;
	timestamp: number;
}

interface GeneratedTexture {
	filename: string;
	texture: Buffer;
	svg?: string;
}

interface GeneratedFontFile {
	filename: string;
	data: string;
	settings?: unknown;
}

export function msdfPlugin(options: MSDFPluginOptions): Plugin {
	const { fonts, outputDir = "assets/msdf", generateTypes = true, verbose = false, force = false } = options;

	// JSON dans src/assets/msdf, PNG dans public/assets/msdf
	const jsonOutputPath = join("src", outputDir);
	const pngOutputPath = join("public", outputDir);

	const cacheFile = join(jsonOutputPath, ".msdf-cache.json");

	let cache: Record<string, CacheEntry> = {};

	const log = (...args: unknown[]) => {
		if (verbose) console.log("[msdf-plugin]", ...args);
	};

	async function loadCache(): Promise<void> {
		try {
			if (existsSync(cacheFile)) {
				const data = await readFile(cacheFile, "utf-8");
				cache = JSON.parse(data) as Record<string, CacheEntry>;
			}
		} catch {
			cache = {};
		}
	}

	async function saveCache(): Promise<void> {
		await writeFile(cacheFile, JSON.stringify(cache, null, 2));
	}

	async function getFileHash(filePath: string): Promise<string> {
		const content = await readFile(filePath);
		return createHash("md5").update(content).digest("hex");
	}

	async function needsRegeneration(fontPath: string, fontName: string): Promise<boolean> {
		if (force) return true;

		const jsonPath = join(jsonOutputPath, `${fontName}.json`);
		const pngPath = join(pngOutputPath, `${fontName}.png`);

		if (!existsSync(jsonPath) || !existsSync(pngPath)) {
			log(`Missing output files for ${fontName}`);
			return true;
		}

		const currentHash = await getFileHash(fontPath);
		const cached = cache[fontName];

		if (!cached || cached.hash !== currentHash) {
			log(`Hash mismatch for ${fontName}`);
			return true;
		}

		return false;
	}

	async function generateFont(config: MSDFFontConfig): Promise<void> {
		const fontConfig = { ...DEFAULT_OPTIONS, ...config };
		const { input, outputName } = config;

		log(`Checking ${outputName}...`);

		const needsRegen = await needsRegeneration(input, outputName);
		if (!needsRegen) {
			log(`✓ ${outputName} is up to date`);
			return;
		}

		log(`🔨 Generating ${outputName}...`);
		const fontBuffer = await readFile(input);

		return new Promise((resolve, reject) => {
			generateBMFont(
				fontBuffer,
				{
					filename: outputName,
					outputType: "json",
					fieldType: fontConfig.fieldType,
					distanceRange: fontConfig.distanceRange,
					textureSize: fontConfig.textureSize,
					fontSize: fontConfig.fontSize,
					smartSize: true,
					pot: true,
					square: true,
					border: 2,
					radius: 8,
					...(fontConfig.charset && { charset: fontConfig.charset }),
				},
				async (error: Error | null, textures: GeneratedTexture[], font: GeneratedFontFile) => {
					if (error) {
						reject(new Error(`Failed to generate ${outputName}: ${error.message}`));
						return;
					}

					try {
						// Sauvegarder JSON dans src/assets/msdf
						const fontFileName = font?.filename ? basename(font.filename) : `${outputName}.json`;
						const fontPayload = typeof font?.data === "string" ? font.data : JSON.stringify(font?.data ?? {}, null, 2);
						await writeFile(join(jsonOutputPath, fontFileName), fontPayload);

						// Sauvegarder PNG(s) dans public/assets/msdf
						for (const tex of textures) {
							const textureName = `${basename(tex.filename)}.png`;
							await writeFile(join(pngOutputPath, textureName), tex.texture);
						}

						// Mettre à jour le cache
						const hash = await getFileHash(input);
						cache[outputName] = {
							hash,
							timestamp: Date.now(),
						};

						log(`✅ ${outputName} generated`);
						resolve();
					} catch (err) {
						reject(err);
					}
				},
			);
		});
	}

	async function generateTypeDefinitions(): Promise<void> {
		if (!generateTypes) return;

		const types = `// Auto-generated by vite-plugin-msdf
      export interface MSDFFontChar {
        id: number;
        index: number;
        char: string;
        width: number;
        height: number;
        xoffset: number;
        yoffset: number;
        xadvance: number;
        chnl: number;
        x: number;
        y: number;
        page: number;
      }

      export interface MSDFFontKerning {
        first: number;
        second: number;
        amount: number;
      }

      export interface MSDFFontCommon {
        lineHeight: number;
        base: number;
        scaleW: number;
        scaleH: number;
        pages: number;
        packed: number;
      }

      export interface MSDFFontDistanceField {
        fieldType: 'msdf' | 'sdf' | 'psdf';
        distanceRange: number;
      }

      export interface MSDFFontData {
        pages: string[];
        chars: MSDFFontChar[];
        common: MSDFFontCommon;
        distanceField: MSDFFontDistanceField;
        kernings?: MSDFFontKerning[];
      }

      // Font exports
      ${fonts.map((f) => `export type ${toPascalCase(f.outputName)}Data = MSDFFontData;`).join("\n")}

      declare module '/${outputDir}/*.json' {
        const fontData: MSDFFontData;
        export default fontData;
      }
`;

		await writeFile(join("src/types", "msdf-fonts.d.ts"), types);
		log("✅ Type definitions generated");
	}

	function toPascalCase(str: string): string {
		return str
			.split(/[-_]/)
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join("");
	}

	return {
		name: "vite-plugin-msdf",

		async buildStart() {
			log("Starting MSDF font generation...");

			// Créer les dossiers de sortie
			if (!existsSync(jsonOutputPath)) {
				await mkdir(jsonOutputPath, { recursive: true });
			}

			if (!existsSync(pngOutputPath)) {
				await mkdir(pngOutputPath, { recursive: true });
			}

			// Charger le cache
			await loadCache();

			try {
				// Générer les fonts
				await Promise.all(fonts.map(generateFont));

				// Sauvegarder le cache
				await saveCache();

				// Générer les types
				await generateTypeDefinitions();

				log("✨ All fonts processed");
			} catch (error) {
				this.error(error instanceof Error ? error.message : String(error));
			}
		},

		configureServer(server) {
			// Watch les fichiers .ttf
			fonts.forEach((font) => {
				server.watcher.add(font.input);
			});

			// Régénérer si un .ttf change
			server.watcher.on("change", async (file) => {
				const changedFont = fonts.find((f) => file.endsWith(f.input));
				if (changedFont) {
					log(`📝 ${changedFont.input} changed, regenerating...`);

					try {
						await generateFont(changedFont);
						await saveCache();
						await generateTypeDefinitions();

						// Trigger HMR
						server.ws.send({
							type: "full-reload",
							path: "*",
						});
					} catch (error) {
						console.error("[msdf-plugin] Regeneration failed:", error);
					}
				}
			});
		},
	};
}
