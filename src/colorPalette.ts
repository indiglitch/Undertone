export const COLOR_PALETTES = [
  { id: 'midnight', name: 'Полночь', description: 'Индиго · фиолетовый · розовый', swatches: ['#5263ff', '#9a68ff', '#f15fc5'] },
  { id: 'ocean', name: 'Океан', description: 'Синий · лазурный · бирюзовый', swatches: ['#397cff', '#35b8ee', '#38d7c2'] },
  { id: 'aurora', name: 'Аврора', description: 'Изумрудный · мятный · сиреневый', swatches: ['#27b998', '#63d9ae', '#9a86ff'] },
  { id: 'rose', name: 'Рубин', description: 'Сливовый · малиновый · коралл', swatches: ['#9b5be8', '#ed58a8', '#ff8295'] },
] as const;

export type ColorPaletteId = (typeof COLOR_PALETTES)[number]['id'] | 'custom';
export type RgbColor = readonly [red: number, green: number, blue: number];

const storageKey = 'undertone.color-palette';
const customColorStorageKey = 'undertone.custom-rgb-color';
export const DEFAULT_CUSTOM_COLOR: RgbColor = [154, 104, 255];

export function readColorPalette(storage: Pick<Storage, 'getItem'> | null): ColorPaletteId {
  try {
    const stored = storage?.getItem(storageKey);
    if (stored === 'custom') return 'custom';
    return COLOR_PALETTES.some(palette => palette.id === stored)
      ? stored as ColorPaletteId
      : 'midnight';
  } catch {
    return 'midnight';
  }
}

export function saveColorPalette(storage: Pick<Storage, 'setItem'> | null, palette: ColorPaletteId): void {
  try { storage?.setItem(storageKey, palette); } catch { /* Storage can be unavailable. */ }
}

export function readCustomColor(storage: Pick<Storage, 'getItem'> | null): RgbColor {
  try {
    const stored = storage?.getItem(customColorStorageKey);
    if (!stored) return DEFAULT_CUSTOM_COLOR;
    const color = JSON.parse(stored) as unknown;
    if (Array.isArray(color) && color.length === 3 && color.every(channel => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
      return color as unknown as RgbColor;
    }
  } catch { /* Use the default when storage is unavailable or malformed. */ }
  return DEFAULT_CUSTOM_COLOR;
}

export function saveCustomColor(storage: Pick<Storage, 'setItem'> | null, color: RgbColor): void {
  try { storage?.setItem(customColorStorageKey, JSON.stringify(color)); } catch { /* Storage can be unavailable. */ }
}

export function parseRgbColor(value: string): RgbColor | null {
  const normalized = value.trim();
  const hex = normalized.match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  if (hex) {
    const expanded = hex.length === 3 ? [...hex].map(channel => channel + channel).join('') : hex;
    return [0, 2, 4].map(index => Number.parseInt(expanded.slice(index, index + 2), 16)) as unknown as RgbColor;
  }
  const match = normalized.match(/^(?:rgb\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
  if (!match) return null;
  const color = match.slice(1).map(Number);
  if (color.some(channel => channel > 255)) return null;
  return color as unknown as RgbColor;
}

export function formatRgbColor([red, green, blue]: RgbColor): string {
  return `rgb(${red}, ${green}, ${blue})`;
}

export function rgbColorToHex([red, green, blue]: RgbColor): string {
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const h = ((hue % 360) + 360) % 360 / 360;
  const s = Math.max(0, Math.min(1, saturation));
  const l = Math.max(0, Math.min(1, lightness));
  const channel = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return `#${[channel(0), channel(8), channel(4)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function rgbToHsl([redValue, greenValue, blueValue]: RgbColor): [number, number, number] {
  const red = redValue / 255, green = greenValue / 255, blue = blueValue / 255;
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min;
  const lightness = (max + min) / 2;
  if (delta === 0) return [265, 0, lightness];
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = max === red ? (green - blue) / delta + (green < blue ? 6 : 0)
    : max === green ? (blue - red) / delta + 2
    : (red - green) / delta + 4;
  hue *= 60;
  return [hue, saturation, lightness];
}

const customProperties = [
  '--bg-base', '--accent-blue', '--accent-violet', '--accent-pink',
  '--palette-bg-start', '--palette-bg-mid', '--palette-bg-end', '--palette-panel',
  '--palette-glow-center-a', '--palette-glow-center-b', '--palette-glow-blue',
  '--palette-glow-violet', '--palette-glow-pink', '--palette-glow-cyan',
  '--glass-border', '--glass-border-active',
];

export function applyCustomColor(root: HTMLElement, color: RgbColor): void {
  const [hue, saturation, originalLightness] = rgbToHsl(color);
  const vividness = Math.min(.82, saturation);
  const accentLightness = Math.max(.44, Math.min(.72, originalLightness));
  const surfaceScale = Math.min(1, originalLightness / .16);
  const surfaceLightness = (lightness: number) => lightness * surfaceScale;
  const rgb = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
  const accentBlue = hslToHex(hue - 28, vividness, Math.min(.7, accentLightness + .035));
  const accentViolet = originalLightness >= .34 && originalLightness <= .78
    ? rgbColorToHex(color)
    : hslToHex(hue, vividness, accentLightness);
  const accentPink = hslToHex(hue + 34, vividness, Math.max(.48, Math.min(.74, accentLightness + .025)));
  const surfaceSaturation = Math.min(.68, saturation * .72);
  const props: Record<string, string> = {
    '--bg-base': hslToHex(hue, surfaceSaturation, surfaceLightness(.045)),
    '--accent-blue': accentBlue,
    '--accent-violet': accentViolet,
    '--accent-pink': accentPink,
    '--palette-bg-start': hslToHex(hue, surfaceSaturation, surfaceLightness(.045)),
    '--palette-bg-mid': hslToHex(hue + 18, surfaceSaturation, surfaceLightness(.075)),
    '--palette-bg-end': hslToHex(hue - 26, surfaceSaturation, surfaceLightness(.065)),
    '--palette-panel': hslToHex(hue + 8, surfaceSaturation, surfaceLightness(.16)),
    '--palette-glow-center-a': `rgba(${color[0]}, ${color[1]}, ${color[2]}, .12)`,
    '--palette-glow-center-b': `rgba(${color[0]}, ${color[1]}, ${color[2]}, .075)`,
    '--palette-glow-blue': `color-mix(in srgb, ${accentBlue} 74%, transparent)`,
    '--palette-glow-violet': `color-mix(in srgb, ${accentViolet} 64%, transparent)`,
    '--palette-glow-pink': `color-mix(in srgb, ${accentPink} 52%, transparent)`,
    '--palette-glow-cyan': `color-mix(in srgb, ${accentBlue} 48%, transparent)`,
    '--glass-border': `color-mix(in srgb, ${accentViolet} 23%, rgba(202, 210, 255, .1))`,
    '--glass-border-active': accentPink,
  };
  for (const [property, value] of Object.entries(props)) root.style.setProperty(property, value);
}

export function clearCustomColor(root: HTMLElement): void {
  for (const property of customProperties) root.style.removeProperty(property);
}
