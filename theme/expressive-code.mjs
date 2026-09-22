/**
 * Expressive Code settings for the theme: understated code blocks, rounded corners, slightly
 * contrasted background, discreet file titles. Every visual value points to a theme CSS token.
 *
 * Options stay serializable (no functions), so they also apply to the `<Code>` component
 * without an `ec.config.mjs` file.
 */
export const expressiveCode = {
	themes: ['github-dark-default', 'github-light-default'],
	useStarlightDarkModeSwitch: true,
	useStarlightUiThemeColors: true,
	// Guarantees enough syntax highlighting contrast on our code background.
	minSyntaxHighlightingColorContrast: 5.5,
	// Long lines wrap (keeping their indentation) instead of scrolling: no horizontal scrolling on
	// mobile, and no scrollable region that keyboard users cannot reach (WCAG 2.1.1).
	defaultProps: { wrap: true, preserveIndent: true },
	styleOverrides: {
		borderRadius: 'var(--th-radius-md)',
		borderWidth: '1px',
		borderColor: 'var(--th-hairline)',
		codeBackground: 'var(--th-code-bg)',
		codeFontFamily: 'var(--th-font-mono)',
		codeFontSize: '0.8125rem',
		codeLineHeight: '1.65',
		codePaddingBlock: '1rem',
		codePaddingInline: '1.25rem',
		uiFontFamily: 'var(--th-font-sans)',
		uiFontSize: '0.8125rem',
		uiFontWeight: '500',
		focusBorder: 'var(--th-accent-text)',
		scrollbarThumbColor: 'var(--th-fill-strong)',
		scrollbarThumbHoverColor: 'var(--th-hairline-strong)',
		frames: {
			shadowColor: 'transparent',
			frameBoxShadowCssValue: 'none',
			editorBackground: 'var(--th-code-bg)',
			editorTabBarBackground: 'var(--th-code-bg)',
			editorTabBarBorderColor: 'var(--th-hairline)',
			editorTabBarBorderBottomColor: 'var(--th-hairline)',
			editorActiveTabBackground: 'var(--th-code-bg)',
			editorActiveTabForeground: 'var(--th-text-secondary)',
			editorActiveTabBorderColor: 'transparent',
			editorActiveTabIndicatorHeight: '0px',
			editorActiveTabIndicatorTopColor: 'transparent',
			editorActiveTabIndicatorBottomColor: 'transparent',
			editorTabBorderRadius: '0px',
			terminalBackground: 'var(--th-code-bg)',
			terminalTitlebarBackground: 'var(--th-code-bg)',
			terminalTitlebarForeground: 'var(--th-text-secondary)',
			terminalTitlebarBorderBottomColor: 'var(--th-hairline)',
			terminalTitlebarDotsForeground: 'var(--th-text-tertiary)',
			terminalTitlebarDotsOpacity: '0.45',
			inlineButtonBackground: 'var(--th-text)',
			inlineButtonForeground: 'var(--th-text-secondary)',
			inlineButtonBorder: 'var(--th-hairline-strong)',
			inlineButtonBorderOpacity: '1',
			inlineButtonBackgroundIdleOpacity: '0',
			inlineButtonBackgroundHoverOrFocusOpacity: '0.06',
			inlineButtonBackgroundActiveOpacity: '0.1',
			tooltipSuccessBackground: 'var(--th-text)',
			tooltipSuccessForeground: 'var(--th-bg)',
		},
		textMarkers: {
			lineMarkerAccentWidth: '2px',
			inlineMarkerBorderRadius: '0.25rem',
			defaultChroma: '55',
			backgroundOpacity: '16%',
			borderOpacity: '75%',
			markBackground: 'var(--th-accent-tint)',
			markBorderColor: 'var(--th-accent)',
		},
	},
};
