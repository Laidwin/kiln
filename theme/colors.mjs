/**
 * Project colors (docs.yml `theme`): replace the theme's neutral palette, for light and dark modes.
 *
 * Each named color sets one or more tokens; the shades the theme derives from them (hover fills,
 * header glass, inline code) are recomputed so that every component follows.
 */

export const COLOR_NAMES = ['background', 'surface', 'text', 'mutedText', 'border'];

/** The theme's own palette (tokens.css), used for the colors a project does not set. */
export const DEFAULT_COLORS = {
	light: { background: '#ffffff', surface: '#f4f6f9', text: '#141a24', mutedText: '#515b6a', border: '#d5dae2' },
	dark: { background: '#0b0d12', surface: '#13161d', text: '#e6e9ef', mutedText: '#9aa3b2', border: '#343a46' },
};

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function rgb(hex) {
	const h = hex.slice(1);
	const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
	return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
}

/** WCAG 2 contrast ratio between two hex colors. */
export function contrast(a, b) {
	const luminance = (hex) => {
		const [r, g, b2] = rgb(hex).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
		return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
	};
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text pairs that must stay readable (WCAG AA, 4.5:1), with the colors actually used:
 * the project's, or the theme's defaults.
 *
 * @returns {Array<{ mode: string, pair: string, ratio: number }>} pairs below 4.5:1
 */
export function contrastProblems(colors = {}) {
	const problems = [];
	for (const mode of ['light', 'dark']) {
		const c = { ...DEFAULT_COLORS[mode], ...colors[mode] };
		for (const [fg, bg] of [
			['text', 'background'],
			['mutedText', 'background'],
			['text', 'surface'],
			['mutedText', 'surface'],
		]) {
			const ratio = contrast(c[fg], c[bg]);
			if (ratio < 4.5) problems.push({ mode, pair: `${fg} on ${bg}`, ratio: Math.round(ratio * 100) / 100 });
		}
	}
	return problems;
}

function declarations(mode, colors) {
	const c = colors ?? {};
	const out = [];
	const set = (name, value) => out.push(`${name}:${value}`);
	if (c.background) {
		set('--th-bg', c.background);
		set('--th-bg-glass', `color-mix(in srgb, ${c.background} ${mode === 'dark' ? 72 : 75}%, transparent)`);
		if (mode === 'light') {
			set('--th-bg-elevated', c.background);
			set('--th-tab-active-bg', c.background);
		}
	}
	if (c.surface) {
		set('--th-bg-secondary', c.surface);
		set('--th-code-bg', c.surface);
		if (mode === 'dark') {
			// Dialogs and active tabs sit one step above the surface.
			const raised = `color-mix(in srgb, ${c.surface} 92%, ${c.text ?? DEFAULT_COLORS.dark.text})`;
			set('--th-bg-elevated', raised);
			set('--th-tab-active-bg', raised);
		}
	}
	if (c.text) {
		set('--th-text', c.text);
		set('--th-fill', `color-mix(in srgb, ${c.text} ${mode === 'dark' ? 6 : 4.5}%, transparent)`);
		set('--th-fill-strong', `color-mix(in srgb, ${c.text} ${mode === 'dark' ? 10 : 8}%, transparent)`);
		set('--th-inline-code-bg', `color-mix(in srgb, ${c.text} ${mode === 'dark' ? 10 : 6}%, transparent)`);
		set('--th-hairline', `color-mix(in srgb, ${c.text} ${mode === 'dark' ? 12 : 10}%, transparent)`);
	}
	if (c.mutedText) {
		set('--th-text-secondary', c.mutedText);
		set('--th-text-tertiary', `color-mix(in srgb, ${c.mutedText} 75%, ${c.background ?? DEFAULT_COLORS[mode].background})`);
	}
	if (c.border) set('--th-hairline-strong', c.border);

	// Starlight's gray scale, which Starlight components and code frames read directly.
	const full = { ...DEFAULT_COLORS[mode], ...c };
	if (c.text) {
		set('--sl-color-white', c.text);
		set('--sl-color-gray-1', c.text);
	}
	if (c.text || c.mutedText) set('--sl-color-gray-2', `color-mix(in srgb, ${full.text} 55%, ${full.mutedText})`);
	if (c.mutedText) {
		set('--sl-color-gray-3', c.mutedText);
		set('--sl-color-gray-4', `color-mix(in srgb, ${c.mutedText} 75%, ${full.background})`);
	}
	if (c.border) set('--sl-color-gray-5', c.border);
	if (c.surface) set('--sl-color-gray-6', c.surface);
	if (c.surface || c.background) set('--sl-color-gray-7', `color-mix(in srgb, ${full.surface} 50%, ${full.background})`);
	if (c.background) set('--sl-color-black', c.background);
	return out.join(';');
}

/**
 * CSS overriding the palette. Light rules skip dark mode, and both outrank tokens.css by specificity
 * (the theme's styles are unlayered, like these rules).
 */
export function colorsCss(colors) {
	if (!colors) return '';
	for (const mode of Object.keys(colors)) {
		for (const [name, value] of Object.entries(colors[mode] ?? {})) {
			if (!COLOR_NAMES.includes(name)) throw new Error(`@laidwin/kiln-theme: unknown color "${name}" in ${mode} (expected ${COLOR_NAMES.join(', ')})`);
			if (!HEX.test(value)) throw new Error(`@laidwin/kiln-theme: invalid ${mode}.${name} "${value}" (expected #rgb or #rrggbb)`);
		}
	}
	const light = declarations('light', colors.light);
	const dark = declarations('dark', colors.dark);
	return [light && `:root:root:not([data-theme='dark']){${light}}`, dark && `:root:root[data-theme='dark']{${dark}}`].filter(Boolean).join('');
}
