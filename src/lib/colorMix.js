import { BLOCK_COLORS } from "./constants";
import { numberValue } from "./pageUtils";

export const STANDARD_BLOCK_COLORS = BLOCK_COLORS.filter(
  (color) => color !== "Custom",
);

export function buildColorMixLabel(colors, quantities = {}) {
  return colors
    .filter((color) => numberValue(quantities[color]) > 0)
    .map((color) => `${color}: ${numberValue(quantities[color])} brass`)
    .join(" + ");
}

export function parseColorMix(value) {
  const parts = String(value || "").split("+");
  const mix = parts.map((part) => {
    const match = part
      .trim()
      .match(/^(.+?):\s*([0-9]+(?:\.[0-9]+)?)\s*brass$/i);
    return match
      ? { color: match[1].trim(), brass: numberValue(match[2]) }
      : null;
  });

  return mix.length >= 2 && mix.every(Boolean) ? mix : [];
}
