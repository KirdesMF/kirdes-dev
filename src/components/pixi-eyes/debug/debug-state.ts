// @env browser

// Debug state for HTML controls

import type { ControlDefinition } from "../controls";

export const STORAGE_KEY = "pixi-eyes-settings";

/**
 * Reads stored settings from localStorage.
 * Returns an empty object if reading fails.
 */
export function readStoredSettings(): Record<string, number | string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * Writes settings to localStorage.
 * Silently ignores errors.
 */
export function writeStoredSettings(settings: Record<string, number | string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Creates default settings from control definitions.
 */
export function createDefaultSettings(
  controls: readonly ControlDefinition[],
): Record<string, number | string> {
  const result: Record<string, number | string> = {};
  for (const control of controls) {
    result[control.id] = control.default;
  }
  return result;
}

/**
 * Merges stored settings with defaults.
 */
export function loadSettings(
  defaults: Record<string, number | string>,
  stored: Record<string, number | string>,
): Record<string, number | string> {
  return { ...defaults, ...stored };
}
