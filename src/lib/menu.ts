export const MENU_STATE_EVENT = "menu:state";
export const MENU_REQUEST_EVENT = "menu:request";

export interface MenuStateDetail {
	open: boolean;
}

export interface MenuRequestDetail {
	open: boolean;
}

export type MenuStateEvent = CustomEvent<MenuStateDetail>;
export type MenuRequestEvent = CustomEvent<MenuRequestDetail>;

export function createMenuStateEvent(open: boolean): MenuStateEvent {
	return new CustomEvent<MenuStateDetail>(MENU_STATE_EVENT, {
		detail: { open },
	});
}

export function createMenuRequestEvent(open: boolean): MenuRequestEvent {
	return new CustomEvent<MenuRequestDetail>(MENU_REQUEST_EVENT, {
		detail: { open },
	});
}

export function dispatchMenuState(
	open: boolean,
	target: EventTarget = window,
): boolean {
	return target.dispatchEvent(createMenuStateEvent(open));
}

export function dispatchMenuRequest(
	open: boolean,
	target: EventTarget = window,
): boolean {
	return target.dispatchEvent(createMenuRequestEvent(open));
}

export function onMenuStateChange(
	handler: (event: MenuStateEvent) => void,
	target: EventTarget = window,
): () => void {
	const listener = (event: Event) => handler(event as MenuStateEvent);
	target.addEventListener(MENU_STATE_EVENT, listener as EventListener);
	return () =>
		target.removeEventListener(MENU_STATE_EVENT, listener as EventListener);
}

export function onMenuRequest(
	handler: (event: MenuRequestEvent) => void,
	target: EventTarget = window,
): () => void {
	const listener = (event: Event) => handler(event as MenuRequestEvent);
	target.addEventListener(MENU_REQUEST_EVENT, listener as EventListener);
	return () =>
		target.removeEventListener(MENU_REQUEST_EVENT, listener as EventListener);
}
