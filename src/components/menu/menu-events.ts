export const MENU_TOGGLE_EVENT = "app:menu-toggle" as const;

export type MenuToggleDetail = {
	open: boolean;
};

export type MenuToggleEvent = CustomEvent<MenuToggleDetail>;

export function emitMenuToggle(open: boolean): void {
	const event: MenuToggleEvent = new CustomEvent<MenuToggleDetail>(
		MENU_TOGGLE_EVENT,
		{ detail: { open } },
	);
	window.dispatchEvent(event);
}

export function emitMenuOpen(): void {
	emitMenuToggle(true);
}

export function emitMenuClose(): void {
	emitMenuToggle(false);
}

export function onMenuToggle(handler: (open: boolean) => void): () => void {
	const listener = (event: Event): void => {
		if (!(event instanceof CustomEvent)) return;
		const detail = event.detail as MenuToggleDetail | null;
		if (!detail || typeof detail.open !== "boolean") return;
		handler(detail.open);
	};

	window.addEventListener(MENU_TOGGLE_EVENT, listener as EventListener);

	return () => {
		window.removeEventListener(MENU_TOGGLE_EVENT, listener as EventListener);
	};
}
