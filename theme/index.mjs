import { colorsCss } from './colors.mjs';
import { expressiveCode } from './expressive-code.mjs';

const DEFAULT_ACCENT = '#f76b15';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const styles = ['@laidwin/kiln-theme/styles/index.css'];

/** Starlight components overridden by the theme (Starlight name → theme file). */
const components = {
	Head: '@laidwin/kiln-theme/components/Head.astro',
	ThemeSelect: '@laidwin/kiln-theme/components/ThemeSelect.astro',
	SocialIcons: '@laidwin/kiln-theme/components/SocialIcons.astro',
};

/** Font roles of the `fonts` option and the token each one sets. */
const FONT_ROLES = {
	body: { family: 'Kiln Body', token: '--th-font-sans', fallback: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
	heading: { family: 'Kiln Heading', token: '--th-font-heading', fallback: 'var(--th-font-sans)' },
	mono: { family: 'Kiln Mono', token: '--th-font-mono', fallback: 'ui-monospace, Menlo, Consolas, monospace' },
};

/**
 * @font-face rules and token overrides for project fonts.
 * @param {Record<string, { url: string, weight?: string | number, style?: string }[]>} [fonts]
 */
function fontsCss(fonts = {}) {
	let css = '';
	const tokens = [];
	for (const [role, files] of Object.entries(fonts)) {
		const def = FONT_ROLES[role];
		if (!def || !files?.length) continue;
		for (const f of files) {
			css += `@font-face{font-family:'${def.family}';src:url(${JSON.stringify(f.url)}) format('woff2');font-weight:${f.weight ?? '100 900'};font-style:${f.style ?? 'normal'};font-display:swap}`;
		}
		tokens.push(`${def.token}:'${def.family}',${def.fallback}`);
		// Inter's character variants mean nothing to another body font.
		if (role === 'body') tokens.push('--th-font-features:normal');
	}
	return css + (tokens.length ? `:root:root{${tokens.join(';')}}` : '');
}

/** Vite plugin exposing the theme options that components read at build time. */
function configModule(data) {
	const id = 'virtual:kiln-theme/config';
	return {
		name: 'kiln-theme-config',
		resolveId: (source) => (source === id ? `\0${id}` : undefined),
		load: (source) => (source === `\0${id}` ? `export default ${JSON.stringify(data)};` : undefined),
	};
}

/**
 * A clean, precise Starlight theme: Inter typography, slate palette, orange accent.
 *
 * @param {{
 *   accent?: string,
 *   poweredBy?: boolean,
 *   colors?: { light?: object, dark?: object },
 *   fonts?: { body?: object[], heading?: object[], mono?: object[] },
 *   css?: string[],
 *   nav?: ({ label: string, link: string } | { label: string, items: { label: string, link: string }[] })[],
 * }} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function theme(options = {}) {
	const accent = options.accent ?? DEFAULT_ACCENT;
	const footer = options.poweredBy === false ? {} : { Footer: '@laidwin/kiln-theme/components/Footer.astro' };
	if (!HEX.test(accent)) throw new Error(`@laidwin/kiln-theme: invalid accent "${accent}" (expected #rgb or #rrggbb)`);
	const palette = colorsCss(options.colors);
	const fonts = fontsCss(options.fonts);

	return {
		name: '@laidwin/kiln-theme',
		hooks: {
			'config:setup'({ config, updateConfig, addIntegration }) {
				updateConfig({
					// Project CSS (docs.yml `css`) comes last, so it wins over the theme.
					customCss: [...styles, ...(config.customCss ?? []), ...(options.css ?? [])],
					components: { ...components, ...footer, ...config.components },
					expressiveCode: config.expressiveCode === false ? false : { ...expressiveCode, ...(config.expressiveCode === true ? {} : config.expressiveCode) },
					head: [
						// The theme's dynamic values: every accent shade derives from the accent in CSS.
						{ tag: 'style', content: `:root:root{--th-accent-source:${accent}}${palette}${fonts}` },
						...(config.head ?? []),
					],
				});
				addIntegration({
					name: 'kiln-theme-config',
					hooks: {
						'astro:config:setup'({ updateConfig: updateAstro }) {
							updateAstro({
								vite: { plugins: [configModule({ nav: options.nav ?? [], customBody: Boolean(options.fonts?.body?.length) })] },
							});
						},
					},
				});
			},
		},
	};
}
