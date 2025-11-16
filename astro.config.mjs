// @ts-check

import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { assetpackPlugin } from "./plugins/asset-pack";

// https://astro.build/config
export default defineConfig({
	vite: {
		plugins: [tailwindcss(), assetpackPlugin()],
	},
	i18n: {
		locales: ["en", "fr"],
		defaultLocale: "en",
		routing: {
			prefixDefaultLocale: true,
		},
	},
});
