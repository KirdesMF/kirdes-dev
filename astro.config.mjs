// @ts-check
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { msdfPlugin } from "./plugins/msdf";

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [
			tailwindcss(),
			msdfPlugin({
				outputDir: "/assets/msdf",
				fonts: [
					{
						input: "raw-assets/fonts/SwisspoTrial-Black{msdf}{family=Swiss}.ttf",
						outputName: "wave-text",
						charset: "WORKSABOUTCONTACTPROJECTFLI",
					},
				],
			}),
		],
	},
	i18n: {
		locales: ["en", "fr"],
		defaultLocale: "en",
		routing: {
			prefixDefaultLocale: true,
		},
	},
});
