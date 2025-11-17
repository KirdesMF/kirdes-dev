export type ThemeName = "light" | "dark" | "system";
export type ThemeChangeSource = "user" | "system" | "restore";
export type ThemeChangeDetail = {
	theme: ThemeName;
	source: ThemeChangeSource;
};

const THEME_EVENT_TYPE = "app:theme-change" as const;

// État en mémoire du thème courant (côté client).
let currentTheme: ThemeName = "system";

/**
 * Retourne la dernière valeur de thème connue dans ce module.
 * Utile pour initialiser un composant sans réécouter immédiatement un event.
 */
export function getCurrentTheme(): ThemeName {
	return currentTheme;
}

/**
 * Émet un changement de thème global.
 * - Met à jour l’état interne `currentTheme`.
 * - Émet un CustomEvent sur `window` (si disponible).
 */
export function emitThemeChange(
	theme: ThemeName,
	source: ThemeChangeSource = "user",
): void {
	currentTheme = theme;

	const event = new CustomEvent<ThemeChangeDetail>(THEME_EVENT_TYPE, {
		detail: { theme, source },
	});

	window.dispatchEvent(event);
}

/**
 * Abonne un handler aux changements de thème.
 * Retourne une fonction d’unsubscribe à appeler lors du cleanup.
 */
export function onThemeChange(
	handler: (detail: ThemeChangeDetail) => void,
): () => void {
	const listener = (event: Event): void => {
		if (!(event instanceof CustomEvent)) return;
		const detail = event.detail as ThemeChangeDetail | null;
		if (!detail) return;
		handler(detail);
	};

	window.addEventListener(THEME_EVENT_TYPE, listener as EventListener);

	return () => {
		window.removeEventListener(THEME_EVENT_TYPE, listener as EventListener);
	};
}

/** Helpers optionnels si tu veux des appels plus explicites. */
export function setLightTheme(source: ThemeChangeSource = "user"): void {
	emitThemeChange("light", source);
}

export function setDarkTheme(source: ThemeChangeSource = "user"): void {
	emitThemeChange("dark", source);
}

export function setSystemTheme(source: ThemeChangeSource = "user"): void {
	emitThemeChange("system", source);
}
