// Categorical colors for constellations, validated for colorblind separation and contrast on the
// app's dark surfaces (#05060a, #0b0d14). Assigned in this fixed order; never cycled.
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767']
const OTHER = '#8a8f98'

/** Color for a constellation, by its position in the sorted list of constellations. */
export function constellationColor(groups: string[], group: string): string {
  const i = [...groups].sort().indexOf(group)
  return i >= 0 && i < SLOTS.length ? SLOTS[i]! : OTHER
}
