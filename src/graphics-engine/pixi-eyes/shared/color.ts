// Color helpers

/**
 * Sanitizes a hex color string. Returns the fallback if invalid.
 * Expected format: #RRGGBB (6 hex digits)
 */
export function sanitizeHexColor(value: string | undefined, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/iu.test(value) ? value : fallback;
}

/**
 * Converts a hex color string (#RRGGBB) to a number.
 * Example: "#ffffff" -> 0xffffff
 */
export function hexToNumber(value: string): number {
  return Number.parseInt(value.slice(1), 16);
}

/**
 * Converts an RGB object to a number.
 * Example: { r: 255, g: 255, b: 255 } -> 0xffffff
 */
export function rgbToNumber(rgb: { r: number; g: number; b: number }): number {
  return (rgb.r << 16) | (rgb.g << 8) | rgb.b;
}

/**
 * Converts a number to a hex color string (#RRGGBB).
 * Example: 0xffffff -> "#ffffff"
 */
export function numberToHex(value: number): string {
  const hex = value.toString(16).padStart(6, "0");
  return `#${hex}`;
}

/**
 * Converts a number to an RGB object.
 * Example: 0xffffff -> { r: 255, g: 255, b: 255 }
 */
export function numberToRgb(value: number): { r: number; g: number; b: number } {
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}
