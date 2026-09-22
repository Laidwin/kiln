import { expressiveCode } from './expressive-code.mjs';

const DEFAULT_ACCENT = '#f76b15';
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const styles = ['@laidwin/kiln-theme/styles/index.css'];

/** Starlight components overridden by the theme (Starlight name → theme file). */
const components = {
	Head: '@laidwin/kiln-theme/components/Head.astro',
	ThemeSelect: '@laidwin/kiln-theme/components/ThemeSelect.astro',
};

/**
 * A clean, precise Starlight theme: Inter typography, slate palette, orange accent.
 *
 * @param {{ accent?: string }} [options]
 * @returns {import('@astrojs/starlight/types').StarlightPlugin}
 */
export default function theme(options = {}) {
	const accent = options.accent ?? DEFAULT_ACCENT;
	if (!HEX.test(accent)) throw new Error(`@laidwin/kiln-theme: invalid accent "${accent}" (expected #rgb or #rrggbb)`);

	return {
		name: '@laidwin/kiln-theme',
		hooks: {
			'config:setup'({ config, updateConfig }) {
				updateConfig({
					customCss: [...styles, ...(config.customCss ?? [])],
					components: { ...components, ...config.components },
					expressiveCode: config.expressiveCode === false ? false : { ...expressiveCode, ...(config.expressiveCode === true ? {} : config.expressiveCode) },
					head: [
						// The theme's only dynamic value: every accent shade derives from it in CSS.
						{ tag: 'style', content: `:root:root{--th-accent-source:${accent}}` },
						...(config.head ?? []),
					],
				});
			},
		},
	};
}
