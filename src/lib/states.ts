type AppStateType = {
	theme: "light" | "dark";
	menuOpen: boolean;
	params: Record<string, unknown>;
};

type ThemeChangeEvent = CustomEvent<{ theme: "light" | "dark" }>;
type MenuEvent = CustomEvent<{ open: boolean }>;
type ParamsChangeEvent = CustomEvent<{
	params: Record<string, unknown>;
	previous: Record<string, unknown>;
}>;

// État privé
const currentState: AppStateType = {
	theme: (document.documentElement.classList.contains("dark") ? "dark" : "light") as "light" | "dark",
	menuOpen: false,
	params: {},
};

// Bus d'événements
const eventBus = new EventTarget();

// Getters
export const state = {
	getTheme: (): "light" | "dark" => currentState.theme,
	isMenuOpen: (): boolean => currentState.menuOpen,
	getParams: (): Record<string, unknown> => currentState.params,
};

// Events (listeners + emitters)
export const events = {
	// Theme
	onThemeChange: (callback: (theme: "light" | "dark") => void) => {
		const handler = (e: Event) => {
			callback((e as ThemeChangeEvent).detail.theme);
		};
		eventBus.addEventListener("theme-change", handler);
		return () => eventBus.removeEventListener("theme-change", handler);
	},

	emitThemeChange: (theme: "light" | "dark") => {
		currentState.theme = theme;
		document.documentElement.classList.toggle("dark", theme === "dark");
		eventBus.dispatchEvent(new CustomEvent("theme-change", { detail: { theme } }));
	},

	// Menu
	onMenuToggle: (callback: (open: boolean) => void) => {
		const handler = (e: Event) => {
			callback((e as MenuEvent).detail.open);
		};
		eventBus.addEventListener("menu-toggle", handler);
		return () => eventBus.removeEventListener("menu-toggle", handler);
	},

	emitMenuToggle: (open: boolean) => {
		currentState.menuOpen = open;
		eventBus.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open } }));
	},

	// Params for WebGL/Canvas
	onParamsChange: (callback: (params: Record<string, unknown>, previous: Record<string, unknown>) => void) => {
		const handler = (e: Event) => {
			const { params, previous } = (e as ParamsChangeEvent).detail;
			callback(params, previous);
		};
		eventBus.addEventListener("params-change", handler);
		return () => eventBus.removeEventListener("params-change", handler);
	},

	emitParamsChange: (params: Record<string, unknown>) => {
		const previous = currentState.params;
		currentState.params = params;
		eventBus.dispatchEvent(new CustomEvent("params-change", { detail: { params, previous } }));
	},
};
