import { defaultLang, ui } from "./ui";

export function getLangFromURL(url: URL) {
	const [, lang] = url.pathname.split("/");
	if (lang in ui) return lang as keyof typeof ui;
	return defaultLang;
}

export function getRouteFromURL(url: URL) {
	const [, lang] = url.pathname.split("/");
	return url.pathname.replace(`/${lang}/`, "");
}

export function useTranslations(lang: keyof typeof ui) {
	return function t(key: keyof (typeof ui)[typeof defaultLang]) {
		return ui[lang][key] || ui[defaultLang][key];
	};
}
