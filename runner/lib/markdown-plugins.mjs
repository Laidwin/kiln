import { defineHastPlugin } from 'satteri';

/** Starlight MDX components whose `href` attribute points to a page. */
const LINK_COMPONENTS = ['LinkCard', 'LinkButton', 'Card'];

/**
 * Sätteri HAST plugin that prefixes the base path (`base` in docs.yml) to absolute internal links:
 * `/guides/` becomes `/my-project/guides/`. Authors can write links that do not depend on the
 * publication URL, including in MDX components (LinkCard, LinkButton…).
 */
export function baseLinks(base = '/') {
	const prefix = base.replace(/\/+$/, '');
	if (!prefix) return null;

	const rewrite = (url) =>
		typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && url !== prefix && !url.startsWith(`${prefix}/`)
			? prefix + url
			: undefined;

	const rewriteJsx = {
		filter: LINK_COMPONENTS,
		visit(node, ctx) {
			const href = node.attributes?.find((a) => a.type === 'mdxJsxAttribute' && a.name === 'href');
			const next = rewrite(href?.value);
			if (next) ctx.setProperty(node, 'href', next);
		},
	};

	return defineHastPlugin({
		name: 'docs-base-links',
		element: {
			filter: ['a'],
			visit(node, ctx) {
				const next = rewrite(node.properties?.href);
				if (next) ctx.setProperty(node, 'href', next);
			},
		},
		mdxJsxFlowElement: rewriteJsx,
		mdxJsxTextElement: rewriteJsx,
	});
}

const TASK_LABELS = {
	fr: { done: 'Tâche terminée', todo: 'Tâche à faire' },
	en: { done: 'Completed task', todo: 'Open task' },
};

/**
 * Sätteri HAST plugin with accessibility fixes for the generated Markdown:
 * - GFM task list checkboxes get an explicit label;
 * - tables (which scroll horizontally on mobile) become reachable with the keyboard.
 */
export function accessibility(locale = 'en') {
	const labels = TASK_LABELS[locale] ?? TASK_LABELS.en;
	return defineHastPlugin({
		name: 'docs-accessibility',
		element: [
			{
				filter: ['input'],
				visit(node, ctx) {
					if (node.properties?.type !== 'checkbox' || node.properties.ariaLabel) return;
					ctx.setProperty(node, 'ariaLabel', node.properties.checked ? labels.done : labels.todo);
				},
			},
			{
				filter: ['table'],
				visit(node, ctx) {
					if (node.properties?.tabIndex === undefined) ctx.setProperty(node, 'tabIndex', 0);
				},
			},
		],
	});
}
