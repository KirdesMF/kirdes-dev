import { defaultLang, ui } from "./ui";

export function getLangFromURL(url: URL) {
	const [, lang] = url.pathname.split("/");
	if (lang in ui) return lang as keyof typeof ui;
	return defaultLang;
}

export function getRouteFromURL(url: URL) {
	const segments = url.pathname.split("/").filter(Boolean);
	if (segments.length === 0) return "";

	const [, ...routeSegments] = segments;
	return routeSegments.join("/");
}

export function useTranslations(lang: keyof typeof ui) {
	return function t(key: keyof (typeof ui)[typeof defaultLang]) {
		return ui[lang][key] || ui[defaultLang][key];
	};
}
