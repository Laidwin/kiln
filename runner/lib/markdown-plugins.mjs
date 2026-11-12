import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineHastPlugin, defineMdastPlugin } from 'satteri';

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

/** GitHub alert types and the Starlight aside each one becomes. */
const ALERTS = {
	NOTE: 'note',
	TIP: 'tip',
	IMPORTANT: 'note',
	WARNING: 'caution',
	CAUTION: 'danger',
};

const ALERT_TITLES = {
	en: { NOTE: 'Note', TIP: 'Tip', IMPORTANT: 'Important', WARNING: 'Warning', CAUTION: 'Caution' },
	fr: { NOTE: 'Note', TIP: 'Astuce', IMPORTANT: 'Important', WARNING: 'Avertissement', CAUTION: 'Attention' },
};

/**
 * Sätteri MDAST plugin turning GitHub alerts (`> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`,
 * `> [!CAUTION]`) into `:::variant` directives, which Starlight then renders as asides. The same file
 * reads well on GitHub and on the site.
 */
export function githubAlerts(locale = 'en') {
	const titles = ALERT_TITLES[locale] ?? ALERT_TITLES.en;
	return defineMdastPlugin({
		name: 'kiln-github-alerts',
		blockquote(node) {
			const [first, ...rest] = node.children ?? [];
			const marker = first?.type === 'paragraph' ? first.children?.[0] : undefined;
			if (marker?.type !== 'text') return;
			const match = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\r?\n|$)/i.exec(marker.value);
			if (!match) return;
			const type = match[1].toUpperCase();

			// The rest of the first paragraph, without the marker, stays the first line of the aside.
			const remainder = marker.value.slice(match[0].length);
			const firstChildren = [...(remainder ? [{ ...marker, value: remainder }] : []), ...first.children.slice(1)];
			const children = firstChildren.length ? [{ ...first, children: firstChildren }, ...rest] : rest;

			return {
				type: 'containerDirective',
				name: ALERTS[type],
				attributes: {},
				children: [
					{ type: 'paragraph', data: { directiveLabel: true }, children: [{ type: 'text', value: titles[type] }] },
					...children,
				],
			};
		},
	});
}

const PAGE_LINK = /^([^:#?]*?)\.(md|mdx|mdoc)(#.*)?$/i;

/**
 * Sätteri HAST plugin factory rewriting relative links to Markdown files into site routes:
 * `./install.md#docker` in `docs/guide/start.md` becomes `/guide/install/#docker`. Pages keep
 * working links when read on GitHub or in an editor. `baseLinks` adds the base path afterwards.
 * `docsDirs`: the docs folder, as one path or several (its real path and the app's symlink).
 */
export function relativePageLinks(docsDirs) {
	const roots = [docsDirs].flat().map((d) => d.split('\\').join('/').replace(/\/$/, ''));
	return ({ fileURL }) => {
		if (!fileURL) return null;
		const file = fileURLToPath(fileURL).split('\\').join('/');
		const root = roots.find((r) => file.startsWith(`${r}/`));
		if (!root) return null;
		const fromDir = posix.dirname(file.slice(root.length + 1));

		const rewrite = (href) => {
			if (typeof href !== 'string' || href.startsWith('/') || href.startsWith('#')) return undefined;
			const match = PAGE_LINK.exec(href);
			if (!match) return undefined;
			const target = posix.normalize(posix.join(fromDir, decodeURI(match[1])));
			if (target.startsWith('..')) return undefined; // outside docs/: leave it alone
			const route = target
				.toLowerCase()
				.split('/')
				.filter((part, i, all) => !(i === all.length - 1 && part === 'index'))
				.join('/');
			return `/${route}${route ? '/' : ''}${match[3] ?? ''}`;
		};

		return defineHastPlugin({
			name: 'kiln-relative-page-links',
			element: {
				filter: ['a'],
				visit(node, ctx) {
					const next = rewrite(node.properties?.href);
					if (next) ctx.setProperty(node, 'href', next);
				},
			},
		});
	};
}

/**
 * Sätteri HAST plugin removing a level-1 heading that opens the page: Starlight already shows the page
 * title (taken from that heading when the front matter has none), so it would appear twice.
 */
export function leadingTitle() {
	return defineHastPlugin({
		name: 'kiln-leading-title',
		element: {
			filter: ['h1'],
			visit(node, ctx) {
				const parent = ctx.parent(node);
				const index = ctx.indexOf(node);
				if (parent?.type !== 'root' || index === undefined) return;
				// Only blank text may come before it (children are views, compare by position).
				const opening = parent.children.slice(0, index).every((c) => c.type === 'text' && !c.value.trim());
				if (opening) ctx.removeNode(node);
			},
		},
	});
}
